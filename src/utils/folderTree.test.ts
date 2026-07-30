import {
  MAX_FOLDER_DEPTH,
  canMoveFolder,
  deleteFolderRecursively,
  getDescendantFolderIds,
  getFolderPath,
  getFolderPathLabel,
} from "./folderTree";
import type { Folder, SavedItem } from "../types/models";

const now = "2026-01-01T00:00:00.000Z";

const folder = (id: string, name: string, parentFolderId: string | null): Folder => ({
  id,
  name,
  parentFolderId,
  createdAt: now,
  updatedAt: now,
});

const item = (id: string, folderId: string): SavedItem => ({
  id,
  folderId,
  title: `Item ${id}`,
  type: "text",
  tags: [],
  status: "waiting",
  priority: "medium",
  createdAt: now,
  updatedAt: now,
});

// root1
//   child1
//     grandchild1
//   child2
// root2
// standalone (no children, used as the "folder being moved")
const smallTree: Folder[] = [
  folder("root1", "Root 1", null),
  folder("child1", "Child 1", "root1"),
  folder("grandchild1", "Grandchild 1", "child1"),
  folder("child2", "Child 2", "root1"),
  folder("root2", "Root 2", null),
  folder("standalone", "Standalone", null),
];

describe("getDescendantFolderIds", () => {
  it("returns every folder nested under the given folder, and only those", () => {
    const descendants = getDescendantFolderIds(smallTree, "root1").sort();
    expect(descendants).toEqual(["child1", "child2", "grandchild1"].sort());
  });

  it("returns an empty array for a leaf folder", () => {
    expect(getDescendantFolderIds(smallTree, "grandchild1")).toEqual([]);
  });
});

describe("getFolderPath / getFolderPathLabel", () => {
  it("walks from root to the given folder inclusive", () => {
    const path = getFolderPath(smallTree, "grandchild1").map((f) => f.id);
    expect(path).toEqual(["root1", "child1", "grandchild1"]);
    expect(getFolderPathLabel(smallTree, "grandchild1")).toBe("Root 1 > Child 1 > Grandchild 1");
  });

  it("returns 'Home' for a missing/undefined folderId", () => {
    expect(getFolderPathLabel(smallTree, undefined)).toBe("Home");
    expect(getFolderPathLabel(smallTree, "does-not-exist")).toBe("Home");
  });

  it("terminates instead of looping forever on a corrupt parent cycle", () => {
    const cyclic: Folder[] = [folder("a", "A", "b"), folder("b", "B", "a")];
    const path = getFolderPath(cyclic, "a").map((f) => f.id);
    expect(path).toEqual(["b", "a"]);
  });
});

describe("canMoveFolder", () => {
  it("rejects moving a folder into itself", () => {
    expect(canMoveFolder(smallTree, "child1", "child1")).toBe(false);
  });

  it("rejects moving a folder underneath its own descendant (cycle)", () => {
    expect(canMoveFolder(smallTree, "root1", "grandchild1")).toBe(false);
  });

  it("accepts moving a leaf folder to a valid new parent", () => {
    expect(canMoveFolder(smallTree, "standalone", "root2")).toBe(true);
  });

  it("rejects a move that would push a leaf folder past MAX_FOLDER_DEPTH", () => {
    // Build a straight chain l0 -> l1 -> l2 -> l3 -> l4, where l4 sits at MAX_FOLDER_DEPTH.
    const chain: Folder[] = [
      folder("l0", "L0", null),
      folder("l1", "L1", "l0"),
      folder("l2", "L2", "l1"),
      folder("l3", "L3", "l2"),
      folder("l4", "L4", "l3"),
      folder("leaf", "Leaf", null),
    ];
    expect(MAX_FOLDER_DEPTH).toBe(5);
    expect(canMoveFolder(chain, "leaf", "l4")).toBe(false);
    expect(canMoveFolder(chain, "leaf", "l3")).toBe(true);
  });

  it("accounts for the whole subtree's depth, not just the moved folder itself", () => {
    // root1's subtree is 3 levels deep (root1 -> child1/child2 -> grandchild1).
    const chain: Folder[] = [
      ...smallTree,
      folder("l0", "L0", null),
      folder("l1", "L1", "l0"),
      folder("l2", "L2", "l1"),
    ];
    // Moving root1 under l2 (depth 3) would put grandchild1 at depth 6 -- too deep.
    expect(canMoveFolder(chain, "root1", "l2")).toBe(false);
    // Moving root1 under l0 (depth 1) keeps grandchild1 within the limit.
    expect(canMoveFolder(chain, "root1", "l0")).toBe(true);
  });
});

describe("deleteFolderRecursively", () => {
  it("removes the folder, all of its descendants, and their items, leaving everything else untouched", () => {
    const items: SavedItem[] = [
      item("item-root1", "root1"),
      item("item-child1", "child1"),
      item("item-grandchild1", "grandchild1"),
      item("item-root2", "root2"),
    ];

    const result = deleteFolderRecursively(smallTree, items, "root1");

    expect(result.folders.map((f) => f.id).sort()).toEqual(["root2", "standalone"]);
    expect(result.items.map((i) => i.id)).toEqual(["item-root2"]);
  });
});
