import { accessRoleLabel, canEditFolderContentRecord, canEditItemRecord, canManageFolderRecord, isSharedAccess } from "./access";
import type { Folder, SavedItem } from "../types/models";

const makeFolder = (accessRole?: Folder["accessRole"]): Folder => ({
  id: "folder-1",
  name: "Folder",
  parentFolderId: null,
  accessRole,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const makeItem = (accessRole?: SavedItem["accessRole"]): SavedItem => ({
  id: "item-1",
  folderId: "folder-1",
  title: "Item",
  type: "text",
  tagOptionIds: [],
  accessRole,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("isSharedAccess", () => {
  it("is true for editor and viewer roles", () => {
    expect(isSharedAccess({ accessRole: "editor" })).toBe(true);
    expect(isSharedAccess({ accessRole: "viewer" })).toBe(true);
  });

  it("is false for owner role, undefined role, and null/undefined input", () => {
    expect(isSharedAccess({ accessRole: "owner" })).toBe(false);
    expect(isSharedAccess({})).toBe(false);
    expect(isSharedAccess(null)).toBe(false);
    expect(isSharedAccess(undefined)).toBe(false);
  });
});

describe("accessRoleLabel", () => {
  it("maps each role to its label", () => {
    expect(accessRoleLabel("editor")).toBe("Can edit");
    expect(accessRoleLabel("viewer")).toBe("Can view");
    expect(accessRoleLabel("owner")).toBe("Owner");
  });

  it("defaults to Owner when role is undefined", () => {
    expect(accessRoleLabel(undefined)).toBe("Owner");
  });
});

describe("canManageFolderRecord", () => {
  it("allows management when accessRole is undefined or owner", () => {
    expect(canManageFolderRecord(makeFolder(undefined))).toBe(true);
    expect(canManageFolderRecord(makeFolder("owner"))).toBe(true);
  });

  it("denies management for editor and viewer", () => {
    expect(canManageFolderRecord(makeFolder("editor"))).toBe(false);
    expect(canManageFolderRecord(makeFolder("viewer"))).toBe(false);
  });

  it("allows management when folder is missing (local-only, pre-sync folder)", () => {
    expect(canManageFolderRecord(undefined)).toBe(true);
    expect(canManageFolderRecord(null)).toBe(true);
  });
});

describe("canEditFolderContentRecord", () => {
  it("allows content edits for undefined, owner, and editor", () => {
    expect(canEditFolderContentRecord(makeFolder(undefined))).toBe(true);
    expect(canEditFolderContentRecord(makeFolder("owner"))).toBe(true);
    expect(canEditFolderContentRecord(makeFolder("editor"))).toBe(true);
  });

  it("denies content edits for viewer", () => {
    expect(canEditFolderContentRecord(makeFolder("viewer"))).toBe(false);
  });
});

describe("canEditItemRecord", () => {
  it("returns false when the item itself is missing", () => {
    expect(canEditItemRecord(undefined, makeFolder("owner"))).toBe(false);
    expect(canEditItemRecord(null, makeFolder("owner"))).toBe(false);
  });

  it("uses the item's own accessRole when present, ignoring the folder", () => {
    expect(canEditItemRecord(makeItem("owner"), makeFolder("viewer"))).toBe(true);
    expect(canEditItemRecord(makeItem("editor"), makeFolder("viewer"))).toBe(true);
    expect(canEditItemRecord(makeItem("viewer"), makeFolder("owner"))).toBe(false);
  });

  it("falls back to the folder's edit access when the item has no accessRole of its own", () => {
    expect(canEditItemRecord(makeItem(undefined), makeFolder("owner"))).toBe(true);
    expect(canEditItemRecord(makeItem(undefined), makeFolder("editor"))).toBe(true);
    expect(canEditItemRecord(makeItem(undefined), makeFolder("viewer"))).toBe(false);
    expect(canEditItemRecord(makeItem(undefined), undefined)).toBe(true);
  });
});
