import { searchFoldersAndItems } from "./itemFilters";
import type { Folder, SavedItem, TagOption } from "../types/models";

const now = "2026-01-01T00:00:00.000Z";

const folder = (id: string, name: string, parentFolderId: string | null, purpose?: string): Folder => ({
  id,
  name,
  parentFolderId,
  purpose,
  createdAt: now,
  updatedAt: now,
});

const item = (overrides: Partial<SavedItem> & Pick<SavedItem, "id" | "folderId">): SavedItem => ({
  title: "Untitled",
  type: "text",
  tagOptionIds: [],
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const tagOption = (id: string, name: string): TagOption => ({
  id,
  groupId: "tags-group",
  name,
  sortOrder: 0,
  createdAt: now,
  updatedAt: now,
});

const folders: Folder[] = [
  folder("food", "Food", null, "Places to eat"),
  folder("cooking", "Cooking", "food"),
];

const tagOptions: TagOption[] = [tagOption("tag-dinner", "dinner"), tagOption("tag-italian", "italian")];

describe("searchFoldersAndItems", () => {
  const items: SavedItem[] = [
    item({ id: "ramen", folderId: "food", title: "Try the ramen place" }),
    item({ id: "pasta", folderId: "cooking", title: "Homemade pasta", tagOptionIds: ["tag-dinner", "tag-italian"] }),
    item({ id: "unrelated", folderId: "cooking", title: "Fix the bike" }),
  ];

  it("returns nothing for an empty or whitespace-only query", () => {
    expect(searchFoldersAndItems("", folders, items)).toEqual({ folders: [], items: [] });
    expect(searchFoldersAndItems("   ", folders, items)).toEqual({ folders: [], items: [] });
  });

  it("matches items by title, case-insensitively", () => {
    const result = searchFoldersAndItems("RAMEN", folders, items);
    expect(result.items.map((i) => i.id)).toEqual(["ramen"]);
  });

  it("matches items by tag", () => {
    const result = searchFoldersAndItems("italian", folders, items, tagOptions);
    expect(result.items.map((i) => i.id)).toEqual(["pasta"]);
  });

  it("matches items by their folder's path label", () => {
    const result = searchFoldersAndItems("cooking", folders, items);
    expect(result.items.map((i) => i.id).sort()).toEqual(["pasta", "unrelated"].sort());
  });

  it("matches folders by name and by purpose", () => {
    // "cooking" also matches on "food" because its path label ("Food > Cooking") includes it.
    expect(searchFoldersAndItems("food", folders, items).folders.map((f) => f.id).sort()).toEqual(["cooking", "food"]);
    expect(searchFoldersAndItems("places to eat", folders, items).folders.map((f) => f.id)).toEqual(["food"]);
  });

  it("returns empty results when nothing matches", () => {
    const result = searchFoldersAndItems("xyz-no-match", folders, items);
    expect(result).toEqual({ folders: [], items: [] });
  });
});
