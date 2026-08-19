import {
  buildPublicFolderLink,
  createPublicLink,
  fetchPublicFolder,
  loadPublicLinkStatus,
  revokePublicLink,
} from "./folderPublicLinks";

const makeQueryBuilder = (result: { data: unknown; error: unknown }) => {
  const builder: Record<string, jest.Mock> = {};
  builder.select = jest.fn().mockReturnValue(builder);
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.is = jest.fn().mockReturnValue(builder);
  builder.maybeSingle = jest.fn().mockResolvedValue(result);
  return builder;
};

describe("buildPublicFolderLink", () => {
  it("builds a web URL with the token encoded", () => {
    expect(buildPublicFolderLink("abc 123")).toBe("https://trovecollections.app/shared/abc%20123");
  });
});

describe("loadPublicLinkStatus", () => {
  it("returns the mapped link when an active row exists", async () => {
    const row = {
      id: "link-1",
      folder_id: "folder-1",
      token: "tok-1",
      scope: "folder_only",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const from = jest.fn().mockReturnValue(makeQueryBuilder({ data: row, error: null }));
    const supabase = { from } as unknown as Parameters<typeof loadPublicLinkStatus>[0];

    const result = await loadPublicLinkStatus(supabase, "folder-1");

    expect(from).toHaveBeenCalledWith("trove_folder_public_links");
    expect(result.error).toBeUndefined();
    expect(result.link).toEqual({
      id: "link-1",
      folderId: "folder-1",
      token: "tok-1",
      scope: "folder_only",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("returns no link when nothing is active", async () => {
    const from = jest.fn().mockReturnValue(makeQueryBuilder({ data: null, error: null }));
    const supabase = { from } as unknown as Parameters<typeof loadPublicLinkStatus>[0];

    const result = await loadPublicLinkStatus(supabase, "folder-1");

    expect(result.link).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it("maps a query error to a friendly message", async () => {
    const from = jest
      .fn()
      .mockReturnValue(makeQueryBuilder({ data: null, error: { message: "boom" } }));
    const supabase = { from } as unknown as Parameters<typeof loadPublicLinkStatus>[0];

    const result = await loadPublicLinkStatus(supabase, "folder-1");

    expect(result.error).toBe("boom");
    expect(result.link).toBeUndefined();
  });
});

describe("createPublicLink", () => {
  it("maps the row returned by the RPC", async () => {
    const row = {
      id: "link-1",
      folder_id: "folder-1",
      token: "tok-1",
      scope: "folder_and_subfolders",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const rpc = jest.fn().mockResolvedValue({ data: [row], error: null });
    const supabase = { rpc } as unknown as Parameters<typeof createPublicLink>[0];

    const result = await createPublicLink(supabase, "folder-1", "folder_and_subfolders");

    expect(rpc).toHaveBeenCalledWith("trove_create_folder_public_link", {
      target_folder_id: "folder-1",
      target_scope: "folder_and_subfolders",
    });
    expect(result.link?.id).toBe("link-1");
    expect(result.link?.scope).toBe("folder_and_subfolders");
  });

  it("returns an error when the RPC fails", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: "Only the folder owner can create a shareable link." } });
    const supabase = { rpc } as unknown as Parameters<typeof createPublicLink>[0];

    const result = await createPublicLink(supabase, "folder-1", "folder_only");

    expect(result.error).toBe("Only the folder owner can create a shareable link.");
    expect(result.link).toBeUndefined();
  });
});

describe("revokePublicLink", () => {
  it("calls the revoke RPC with the link id", async () => {
    const rpc = jest.fn().mockResolvedValue({ error: null });
    const supabase = { rpc } as unknown as Parameters<typeof revokePublicLink>[0];

    const result = await revokePublicLink(supabase, "link-1");

    expect(rpc).toHaveBeenCalledWith("trove_revoke_folder_public_link", { target_link_id: "link-1" });
    expect(result.error).toBeUndefined();
  });

  it("returns an error when the RPC fails", async () => {
    const rpc = jest.fn().mockResolvedValue({ error: { message: "Shareable link not found." } });
    const supabase = { rpc } as unknown as Parameters<typeof revokePublicLink>[0];

    const result = await revokePublicLink(supabase, "missing");

    expect(result.error).toBe("Shareable link not found.");
  });
});

describe("fetchPublicFolder", () => {
  it("returns the payload from the edge function", async () => {
    const payload = {
      folder: { id: "folder-1", name: "Recipes" },
      folders: [{ id: "folder-1", name: "Recipes" }],
      items: [],
      link: { scope: "folder_only" as const },
    };
    const invoke = jest.fn().mockResolvedValue({ data: payload, error: null });
    const supabase = { functions: { invoke } } as unknown as Parameters<typeof fetchPublicFolder>[0];

    const result = await fetchPublicFolder(supabase, "tok-1");

    expect(invoke).toHaveBeenCalledWith("get-public-folder", { body: { token: "tok-1" } });
    expect(result.data).toEqual(payload);
    expect(result.error).toBeUndefined();
  });

  it("surfaces an invoke-level error", async () => {
    const invoke = jest.fn().mockResolvedValue({ data: null, error: { message: "network down" } });
    const supabase = { functions: { invoke } } as unknown as Parameters<typeof fetchPublicFolder>[0];

    const result = await fetchPublicFolder(supabase, "tok-2");

    expect(result.error).toBe("network down");
    expect(result.data).toBeUndefined();
  });

  it("surfaces an application-level error in the response body", async () => {
    const invoke = jest.fn().mockResolvedValue({ data: { error: "This link has been revoked." }, error: null });
    const supabase = { functions: { invoke } } as unknown as Parameters<typeof fetchPublicFolder>[0];

    const result = await fetchPublicFolder(supabase, "tok-3");

    expect(result.error).toBe("This link has been revoked.");
    expect(result.data).toBeUndefined();
  });

  it("caches a successful response so repeated calls with the same token don't refetch", async () => {
    const payload = {
      folder: { id: "folder-1", name: "Recipes" },
      folders: [{ id: "folder-1", name: "Recipes" }],
      items: [],
      link: { scope: "folder_only" as const },
    };
    const invoke = jest.fn().mockResolvedValue({ data: payload, error: null });
    const supabase = { functions: { invoke } } as unknown as Parameters<typeof fetchPublicFolder>[0];

    await fetchPublicFolder(supabase, "tok-4");
    const second = await fetchPublicFolder(supabase, "tok-4");

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(second.data).toEqual(payload);
  });
});
