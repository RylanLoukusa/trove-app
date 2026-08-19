// Public, unauthenticated read path for a folder shared via a public link.
// No Authorization header is required or checked — the token itself is the
// credential. Every read here uses the service role (bypassing RLS on purpose)
// but only ever returns an explicit, read-only field whitelist: never owner_id,
// notes, or connections. Tag names/colors are included (read-only) since the
// owner's collaborators/viewers already see them; item notes/connections stay
// excluded as they can reference private context outside the shared scope.

type LinkScope = "folder_only" | "folder_and_subfolders";

type LinkRow = {
  folder_id: string;
  revoked_at: string | null;
  scope: LinkScope;
};

type FolderRow = {
  color: string | null;
  icon: string | null;
  id: string;
  name: string;
  parent_folder_id: string | null;
  purpose: string | null;
};

type MediaMetadataRow = {
  mediaType?: "image" | "video";
  storagePath?: string;
  thumbnailPath?: string;
  tiktokUrl?: string;
};

type MediaCollectionItemRow = MediaMetadataRow & { id: string };

type ItemAttachmentRow = { caption?: string; id: string; mediaType: "image" | "video"; uri: string };

type ListItemRow = { checked?: boolean; id: string; indentLevel?: number; kind: "check" | "bullet"; text: string };

type ItemRow = {
  attachments: ItemAttachmentRow[] | null;
  created_at: string;
  description: string | null;
  folder_id: string | null;
  id: string;
  list_items: ListItemRow[] | null;
  media: MediaMetadataRow | null;
  media_items: MediaCollectionItemRow[] | null;
  rich_text: string | null;
  shared_text: string | null;
  source_platform: string | null;
  source_url: string | null;
  title: string;
  type: string;
  updated_at: string;
  url: string | null;
};

type TagOptionRow = { color: string | null; id: string; name: string };

type TagAssignmentRow = { item_id: string; trove_tag_options: TagOptionRow | null };

type RequestBody = { token?: string };

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const env = (key: string): string => Deno.env.get(key) ?? "";

const supabaseUrl = env("SUPABASE_URL");
const supabaseServiceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
const STORAGE_BUCKET = "media";
const SIGNED_URL_TTL_SECONDS = 3600;

const parseErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const payload = await response.json();
    const message = payload?.message ?? payload?.error ?? payload?.msg;
    return typeof message === "string" && message.trim() ? message : fallback;
  } catch {
    return fallback;
  }
};

const serviceFetch = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Supabase request failed."));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

const inList = (ids: string[]): string => `(${ids.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",")})`;

const signStoragePath = async (storagePath: string | undefined): Promise<string | null> => {
  if (!storagePath) return null;

  try {
    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/sign/${STORAGE_BUCKET}/${storagePath}`,
      {
        body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
        headers: {
          apikey: supabaseServiceRoleKey,
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    if (!response.ok) return null;

    const data = await response.json();
    const signedUrl = typeof data?.signedURL === "string" ? data.signedURL : null;
    return signedUrl ? `${supabaseUrl}/storage/v1${signedUrl}` : null;
  } catch {
    return null;
  }
};

const mapMedia = async (
  media: MediaMetadataRow | null,
): Promise<{ mediaUrl: string | null; thumbnailUrl: string | null }> => {
  if (!media) return { mediaUrl: null, thumbnailUrl: null };

  const [mediaUrl, thumbnailUrl] = await Promise.all([
    signStoragePath(media.storagePath),
    signStoragePath(media.thumbnailPath),
  ]);

  return { mediaUrl, thumbnailUrl };
};

const mapMediaItems = async (
  mediaItems: MediaCollectionItemRow[] | null,
): Promise<Array<{ id: string; mediaType: string | null; thumbnailUrl: string | null; url: string | null }>> => {
  if (!mediaItems?.length) return [];

  return Promise.all(
    mediaItems.map(async (mediaItem) => {
      const [url, thumbnailUrl] = await Promise.all([
        signStoragePath(mediaItem.storagePath),
        signStoragePath(mediaItem.thumbnailPath),
      ]);
      return { id: mediaItem.id, mediaType: mediaItem.mediaType ?? null, thumbnailUrl, url };
    }),
  );
};

const mapItem = async (row: ItemRow, tagsByItemId: Map<string, TagOptionRow[]>) => {
  const { mediaUrl, thumbnailUrl } = await mapMedia(row.media);
  const mediaItems = await mapMediaItems(row.media_items);

  return {
    attachments: (row.attachments ?? []).map((attachment) => ({
      caption: attachment.caption ?? null,
      id: attachment.id,
      mediaType: attachment.mediaType,
      uri: attachment.uri,
    })),
    createdAt: row.created_at,
    description: row.description,
    folderId: row.folder_id,
    id: row.id,
    listItems: (row.list_items ?? []).map((listItem) => ({
      checked: listItem.checked ?? false,
      id: listItem.id,
      indentLevel: listItem.indentLevel ?? 0,
      kind: listItem.kind,
      text: listItem.text,
    })),
    mediaItems,
    mediaUrl,
    richText: row.rich_text,
    sharedText: row.shared_text,
    sourcePlatform: row.source_platform,
    sourceUrl: row.source_url,
    tags: (tagsByItemId.get(row.id) ?? []).map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
    thumbnailUrl,
    title: row.title,
    type: row.type,
    updatedAt: row.updated_at,
    url: row.url,
  };
};

const mapFolder = (row: FolderRow) => ({
  color: row.color,
  icon: row.icon,
  id: row.id,
  name: row.name,
  parentFolderId: row.parent_folder_id,
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse({ error: "Supabase function environment is not configured." }, 500);
    }

    const body = (await request.json()) as RequestBody;
    const token = body.token?.trim();

    if (!token) {
      return jsonResponse({ error: "A link token is required." }, 400);
    }

    // token is a uuid column -- a malformed value would otherwise reach Postgres
    // and come back as a raw type-coercion error, leaking implementation details
    // to an anonymous caller. Treat it the same as "not found" instead.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      return jsonResponse({ error: "This link is no longer available." }, 404);
    }

    const links = await serviceFetch<LinkRow[]>(
      `/rest/v1/trove_folder_public_links?select=folder_id,scope,revoked_at&token=eq.${encodeURIComponent(token)}&limit=1`,
      { method: "GET" },
    );
    const link = links[0];

    if (!link) {
      return jsonResponse({ error: "This link is no longer available." }, 404);
    }

    if (link.revoked_at) {
      return jsonResponse({ error: "This link has been revoked." }, 410);
    }

    const rootFolders = await serviceFetch<FolderRow[]>(
      `/rest/v1/trove_folders?select=id,name,icon,color,purpose,parent_folder_id&id=eq.${encodeURIComponent(link.folder_id)}&limit=1`,
      { method: "GET" },
    );
    const rootFolder = rootFolders[0];

    if (!rootFolder) {
      return jsonResponse({ error: "This folder is no longer available." }, 404);
    }

    let folderIds = [rootFolder.id];

    if (link.scope === "folder_and_subfolders") {
      const descendantIds = await serviceFetch<string[]>("/rest/v1/rpc/trove_folder_descendant_ids", {
        body: JSON.stringify({ root_folder_id: rootFolder.id }),
        method: "POST",
      });
      folderIds = [rootFolder.id, ...(descendantIds ?? [])];
    }

    const folders =
      folderIds.length > 1
        ? await serviceFetch<FolderRow[]>(
            `/rest/v1/trove_folders?select=id,name,icon,color,purpose,parent_folder_id&id=in.${inList(folderIds)}`,
            { method: "GET" },
          )
        : [rootFolder];

    const itemRows = await serviceFetch<ItemRow[]>(
      `/rest/v1/trove_items?select=id,folder_id,title,description,type,url,source_url,source_platform,shared_text,media,media_items,attachments,list_items,rich_text,created_at,updated_at&folder_id=in.${inList(folderIds)}&order=created_at.asc`,
      { method: "GET" },
    );

    const tagsByItemId = new Map<string, TagOptionRow[]>();
    if (itemRows.length > 0) {
      const itemIds = itemRows.map((row) => row.id);
      const assignments = await serviceFetch<TagAssignmentRow[]>(
        `/rest/v1/trove_item_tag_assignments?select=item_id,trove_tag_options(id,name,color)&item_id=in.${inList(itemIds)}`,
        { method: "GET" },
      );
      for (const assignment of assignments) {
        if (!assignment.trove_tag_options) continue;
        const existing = tagsByItemId.get(assignment.item_id) ?? [];
        existing.push(assignment.trove_tag_options);
        tagsByItemId.set(assignment.item_id, existing);
      }
    }

    const items = await Promise.all(itemRows.map((row) => mapItem(row, tagsByItemId)));

    return jsonResponse({
      folder: mapFolder(rootFolder),
      folders: folders.map(mapFolder),
      items,
      link: { scope: link.scope },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load this shared folder.";
    return jsonResponse({ error: message }, 400);
  }
});
