import type { ListEntry, SavedItem } from "../types/models";
import { normalizeTroveData } from "./itemTypes";
import {
  parsePastedLines,
  splitEnteredText,
  applyListItemsToEntries,
  focusReferenceId,
  groupResolvedEntriesByList,
  pruneReferencesToRemoved,
  resolveReference,
  assignPositions,
  entriesFromLegacyListItems,
  generatePositionBetween,
  generatePositionsBetween,
  hydrateItemsWithEntries,
  isValidPosition,
  legacyEntryPosition,
  sortEntries,
} from "./listEntries";

const listItem = (overrides: Partial<SavedItem> = {}): SavedItem => ({
  id: "list-1",
  folderId: "folder-1",
  title: "Wedding",
  type: "list",
  tagOptionIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  ...overrides,
});

const entry = (id: string, position: string, overrides: Partial<ListEntry> = {}): ListEntry => ({
  id,
  listId: "list-1",
  kind: "check",
  text: id,
  checked: false,
  indentLevel: 0,
  position,
  tagOptionIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("position keys", () => {
  it("generates a key strictly between two keys", () => {
    const pairs: Array<[string | null, string | null]> = [
      [null, null],
      [null, "V"],
      ["V", null],
      ["V", "W"],
      ["V", "V1"],
      ["Vz", "W"],
      [legacyEntryPosition(0), legacyEntryPosition(1)],
    ];

    pairs.forEach(([before, after]) => {
      const key = generatePositionBetween(before, after);
      expect(isValidPosition(key)).toBe(true);
      if (before !== null) expect(before < key).toBe(true);
      if (after !== null) expect(key < after).toBe(true);
    });
  });

  it("keeps finding room when inserting repeatedly at the same spot", () => {
    let low = "V";
    const high = "W";
    for (let i = 0; i < 200; i += 1) {
      const key = generatePositionBetween(low, high);
      expect(low < key && key < high).toBe(true);
      low = key;
    }
  });

  it("generates many ordered keys at once", () => {
    const keys = generatePositionsBetween(null, null, 50);
    expect(keys).toHaveLength(50);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(50);
    keys.forEach((key) => expect(isValidPosition(key)).toBe(true));
  });

  it("legacy positions sort in list order", () => {
    const keys = Array.from({ length: 12 }, (_, index) => legacyEntryPosition(index));
    expect([...keys].sort()).toEqual(keys);
    expect(keys[0]).toBe("V000001V");
  });
});

describe("assignPositions", () => {
  it("only repositions the entry that moved", () => {
    const existing = new Map([
      ["a", "V1"],
      ["b", "V2"],
      ["c", "V3"],
      ["d", "V4"],
    ]);

    const next = assignPositions(["a", "c", "d", "b"], existing);

    expect(next.get("a")).toBe("V1");
    expect(next.get("c")).toBe("V3");
    expect(next.get("d")).toBe("V4");
    expect(next.get("b")! > "V4").toBe(true);
  });

  it("places new ids between their neighbours", () => {
    const next = assignPositions(["a", "new", "b"], new Map([["a", "V1"], ["b", "V2"]]));
    expect(next.get("a")).toBe("V1");
    expect(next.get("b")).toBe("V2");
    expect("V1" < next.get("new")! && next.get("new")! < "V2").toBe(true);
  });
});

describe("applyListItemsToEntries", () => {
  let idCounter = 0;
  const createId = jest.fn((): string => `entry-${++idCounter}`);
  const timestamp = "2026-02-01T00:00:00.000Z";

  beforeEach(() => {
    idCounter = 0;
    createId.mockClear();
  });

  it("keeps untouched entries as they were and only updates what changed", () => {
    const a = entry("a", "V1");
    const b = entry("b", "V2");
    const other = entry("x", "V1", { listId: "list-2" });

    const result = applyListItemsToEntries({
      listId: "list-1",
      listItems: [
        { id: "a", kind: "check", text: "a", checked: false, indentLevel: 0 },
        { id: "b", kind: "check", text: "b", checked: true, indentLevel: 0 },
        { id: "c", kind: "check", text: "new line" },
      ],
      entries: [a, b, other],
      timestamp,
      userId: "user-1",
      createId,
    });

    expect(result.find((candidate) => candidate.id === "a")).toBe(a);
    expect(result.find((candidate) => candidate.id === "x")).toBe(other);
    expect(result.find((candidate) => candidate.id === "b")).toMatchObject({
      checked: true,
      completedAt: timestamp,
      updatedAt: timestamp,
      position: "V2",
    });
    const created = result.find((candidate) => candidate.id === "c")!;
    expect(created).toMatchObject({ listId: "list-1", text: "new line", createdBy: "user-1", createdAt: timestamp });
    expect(created.position > "V2").toBe(true);
  });

  it("removes entries that are no longer in the list", () => {
    const result = applyListItemsToEntries({
      listId: "list-1",
      listItems: [{ id: "b", kind: "check", text: "b" }],
      entries: [entry("a", "V1"), entry("b", "V2")],
      timestamp,
      createId,
    });

    expect(result.map((candidate) => candidate.id)).toEqual(["b"]);
  });

  it("gives a fresh id to a line whose id belongs to another list", () => {
    const result = applyListItemsToEntries({
      listId: "list-1",
      listItems: [{ id: "x", kind: "check", text: "copied" }],
      entries: [entry("x", "V1", { listId: "list-2" })],
      timestamp,
      createId,
    });

    expect(result.filter((candidate) => candidate.listId === "list-1").map((candidate) => candidate.id)).toEqual(["entry-1"]);
  });

  it("clears completedAt when a line is unchecked and never checks bullets", () => {
    const result = applyListItemsToEntries({
      listId: "list-1",
      listItems: [
        { id: "a", kind: "check", text: "a", checked: false },
        { id: "b", kind: "bullet", text: "b", checked: true },
      ],
      entries: [entry("a", "V1", { checked: true, completedAt: "2026-01-05T00:00:00.000Z" }), entry("b", "V2")],
      timestamp,
      createId,
    });

    expect(result.find((candidate) => candidate.id === "a")).toMatchObject({ checked: false, completedAt: undefined });
    expect(result.find((candidate) => candidate.id === "b")).toMatchObject({ kind: "bullet", checked: false });
  });
});

describe("legacy migration", () => {
  it("matches the Supabase backfill's ids, positions and values", () => {
    // Same fixture as the SQL backfill check: a missing id falls back to the
    // 1-based index and a repeated id keeps only its first line.
    const item = listItem({
      id: "i1",
      listItems: [
        { id: "a", kind: "check", text: "Book florist", checked: true },
        { id: "b", kind: "check", text: "Cake", indentLevel: 1 },
        { kind: "bullet", text: "note", checked: true } as never,
        { id: "a", kind: "check", text: "dup" },
      ],
    });

    expect(
      entriesFromLegacyListItems(item).map(({ id, kind, text, checked, indentLevel, position, updatedAt }) => ({
        id,
        kind,
        text,
        checked,
        indentLevel,
        position,
        updatedAt,
      })),
    ).toEqual([
      { id: "i1~a", kind: "check", text: "Book florist", checked: true, indentLevel: 0, position: "V000001V", updatedAt: item.updatedAt },
      { id: "i1~b", kind: "check", text: "Cake", checked: false, indentLevel: 1, position: "V000002V", updatedAt: item.updatedAt },
      { id: "i1~3", kind: "bullet", text: "note", checked: false, indentLevel: 0, position: "V000003V", updatedAt: item.updatedAt },
    ]);
  });

  it("normalizeTroveData moves embedded lines into entries and strips them from items", () => {
    const data = normalizeTroveData({
      folders: [],
      items: [listItem({ listItems: [{ id: "a", kind: "check", text: "Eggs" }] })],
      tagGroups: [],
      tagOptions: [],
    } as never);

    expect(data.items[0]).not.toHaveProperty("listItems");
    expect(data.listEntries.map((candidate) => candidate.id)).toEqual(["list-1~a"]);
    expect(normalizeTroveData(data)).toEqual(data);
  });

  it("keeps existing entries over a stale embedded snapshot", () => {
    const data = normalizeTroveData({
      folders: [],
      items: [listItem({ listItems: [{ id: "old", kind: "check", text: "Stale" }] })],
      listEntries: [entry("real", "V1")],
      tagGroups: [],
      tagOptions: [],
    });

    expect(data.listEntries.map((candidate) => candidate.id)).toEqual(["real"]);
  });

  it("drops entries whose list no longer exists", () => {
    const data = normalizeTroveData({
      folders: [],
      items: [],
      listEntries: [entry("orphan", "V1")],
      tagGroups: [],
      tagOptions: [],
    });

    expect(data.listEntries).toEqual([]);
  });
});

describe("hydrateItemsWithEntries", () => {
  it("exposes entries in position order as listItems", () => {
    const [hydrated] = hydrateItemsWithEntries([listItem()], [entry("b", "W"), entry("a", "V")]);
    expect(hydrated.listItems?.map((line) => line.id)).toEqual(["a", "b"]);
  });

  it("gives an empty list item an empty array and leaves other items alone", () => {
    const note = listItem({ id: "note", type: "text" });
    const [list, untouched] = hydrateItemsWithEntries([listItem(), note], []);
    expect(list.listItems).toEqual([]);
    expect(untouched).toBe(note);
  });

  it("sortEntries breaks position ties by id", () => {
    expect(sortEntries([entry("b", "V"), entry("a", "V")]).map((candidate) => candidate.id)).toEqual(["a", "b"]);
  });
});

describe("focus list references", () => {
  const base = {
    kind: "check" as const,
    checked: false,
    indentLevel: 0,
    tagOptionIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const source = { ...base, id: "a", listId: "wedding", text: "Florist", position: "V", dueDate: "2026-12-01", indentLevel: 2 };
  const reference = { ...base, id: focusReferenceId("today", "a"), listId: "today", text: "", position: "B", refEntryId: "a" };
  const own = { ...base, id: "own", listId: "today", text: "Call mom", position: "C" };

  it("reads a reference's content from the original line", () => {
    const byId = new Map([source, reference].map((entry) => [entry.id, entry]));
    expect(resolveReference(reference, byId)).toMatchObject({
      id: "today>a",
      listId: "today",
      position: "B",
      text: "Florist",
      dueDate: "2026-12-01",
      indentLevel: 0,
      refEntryId: "a",
    });
    expect(resolveReference(reference, new Map())).toBeNull();
  });

  it("groups lists with references resolved and missing ones left out", () => {
    const grouped = groupResolvedEntriesByList([own, reference, source, { ...reference, id: "today>gone", refEntryId: "gone" }]);
    expect(grouped.get("today")?.map((entry) => entry.text)).toEqual(["Florist", "Call mom"]);
    expect(grouped.get("wedding")?.map((entry) => entry.text)).toEqual(["Florist"]);
  });

  it("drops references to removed lines but keeps ones it can't see", () => {
    const hidden = { ...reference, id: "today>hidden", refEntryId: "hidden" };
    expect(pruneReferencesToRemoved([source, reference, hidden, own], [reference, hidden, own])).toEqual([hidden, own]);
    const unchanged = [source, reference];
    expect(pruneReferencesToRemoved(unchanged, unchanged)).toBe(unchanged);
  });
});

describe("parsePastedLines", () => {
  it("cleans bullets, numbers and checkboxes and skips blank rows", () => {
    expect(parsePastedLines("- Milk\n\n* Eggs\n• Bread\n1. Butter\n2) Jam\n[ ] Rice\n- [x] Beans\n☑ Salt")).toEqual([
      { text: "Milk", checked: false, indentLevel: 0 },
      { text: "Eggs", checked: false, indentLevel: 0 },
      { text: "Bread", checked: false, indentLevel: 0 },
      { text: "Butter", checked: false, indentLevel: 0 },
      { text: "Jam", checked: false, indentLevel: 0 },
      { text: "Rice", checked: false, indentLevel: 0 },
      { text: "Beans", checked: true, indentLevel: 0 },
      { text: "Salt", checked: true, indentLevel: 0 },
    ]);
  });

  it("reads leading tabs and spaces as indents, up to the limit", () => {
    expect(parsePastedLines("Trip\r\n  Passport\n\tTickets\n          Deep").map((line) => line.indentLevel)).toEqual([0, 1, 1, 3]);
  });

  it("keeps text that only looks like a marker", () => {
    expect(parsePastedLines("-5 degrees\n2024 taxes")).toEqual([
      { text: "-5 degrees", checked: false, indentLevel: 0 },
      { text: "2024 taxes", checked: false, indentLevel: 0 },
    ]);
  });
});

describe("splitEnteredText", () => {
  it("treats Return at the end as a new empty line", () => {
    expect(splitEnteredText("Milk", "Milk\n")).toEqual({
      keep: "Milk",
      added: [{ text: "", checked: false, indentLevel: 0 }],
      isPaste: false,
    });
  });

  it("splits a line at the cursor on Return", () => {
    expect(splitEnteredText("Milkeggs", "Milk\neggs").added[0].text).toBe("eggs");
  });

  it("still starts a new line when autocorrect changes the word as Return is pressed", () => {
    const result = splitEnteredText("Mlik", "Milk \n");
    expect(result.isPaste).toBe(false);
    expect(result.keep).toBe("Milk ");
  });

  it("turns a paste into an empty line into one line per row", () => {
    expect(splitEnteredText("", "- Milk\n- Eggs\n- Bread")).toEqual({
      keep: "Milk",
      added: [
        { text: "Eggs", checked: false, indentLevel: 0 },
        { text: "Bread", checked: false, indentLevel: 0 },
      ],
      isPaste: true,
    });
  });

  it("keeps a line's own text when lines are pasted after it", () => {
    const result = splitEnteredText("Party: ", "Party: cake\nballoons\ncandles");
    expect(result.keep).toBe("Party: cake");
    expect(result.added.map((line) => line.text)).toEqual(["balloons", "candles"]);
  });
});
