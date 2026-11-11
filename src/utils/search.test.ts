import type { Folder, SavedItem, SavedListItem } from "../types/models";
import { UNTITLED_LIST_TITLE } from "./listEntries";
import { MAX_LINE_MATCHES, searchTrove, splitAtMatch } from "./search";

const stamp = "2026-01-01T00:00:00.000Z";

const folder = (id: string, name: string, overrides: Partial<Folder> = {}): Folder => ({
  id,
  name,
  parentFolderId: null,
  createdAt: stamp,
  updatedAt: stamp,
  ...overrides,
});

const line = (id: string, text: string, overrides: Partial<SavedListItem> = {}): SavedListItem => ({
  id,
  kind: "check",
  text,
  ...overrides,
});

const list = (id: string, title: string, listItems: SavedListItem[] = [], overrides: Partial<SavedItem> = {}): SavedItem => ({
  id,
  folderId: "",
  title,
  type: "list",
  tagOptionIds: [],
  listItems,
  createdAt: stamp,
  updatedAt: stamp,
  ...overrides,
});

const folders = [
  folder("home", "Home", { purpose: "Chores and repairs" }),
  folder("trips", "Trips"),
  folder("garden", "Garden", { purpose: "What to plant, and when" }),
];

const lists = [
  list("groceries", "Groceries", [line("g1", "Milk"), line("g2", "Garden salad kit"), line("g3", "Bread")]),
  list("chores", "Chores", [line("c1", "Mow the lawn"), line("c2", "Water the GARDEN", { kind: "bullet" })]),
  list("untitled", UNTITLED_LIST_TITLE, [line("u1", "Call the plumber"), line("u2", "Chores for Saturday")]),
  list("empty", "Garden plans"),
];

const ids = (found: Array<{ id: string }>) => found.map((candidate) => candidate.id);

describe("searchTrove", () => {
  it("finds nothing until something is typed", () => {
    expect(searchTrove("", folders, lists)).toEqual({ folders: [], lists: [], lines: [] });
    expect(searchTrove("   ", folders, lists)).toEqual({ folders: [], lists: [], lines: [] });
  });

  it("finds folders by name or purpose, whatever the capitals", () => {
    expect(ids(searchTrove("GARDEN", folders, lists).folders)).toEqual(["garden"]);
    expect(ids(searchTrove("chores", folders, lists).folders)).toEqual(["home"]);
    expect(ids(searchTrove("plant", folders, lists).folders)).toEqual(["garden"]);
  });

  it("finds lists by their title", () => {
    expect(ids(searchTrove("garden", folders, lists).lists)).toEqual(["empty"]);
    expect(ids(searchTrove(" Grocer ", folders, lists).lists)).toEqual(["groceries"]);
  });

  it("finds an unnamed list by the line it is shown as, not by its placeholder title", () => {
    expect(ids(searchTrove("plumber", folders, lists).lists)).toEqual(["untitled"]);
    expect(ids(searchTrove("untitled", folders, lists).lists)).toEqual([]);
  });

  it("doesn't find the line an unnamed list is shown as a second time, as a line", () => {
    expect(searchTrove("plumber", folders, lists).lines).toEqual([]);
    const named = list("named", "Repairs", [line("n1", "Call the plumber")]);
    expect(searchTrove("plumber", [], [named]).lines.map((match) => match.line.id)).toEqual(["n1"]);
  });

  it("finds single lines, and says which list each is on", () => {
    const { lines } = searchTrove("garden", folders, lists);
    expect(lines.map((match) => `${match.list.id}:${match.line.id}`)).toEqual(["groceries:g2", "chores:c2"]);
  });

  it("finds a line that also shows on another list once, on its own list", () => {
    const today = list("today", "Today", [line("today>c1", "Mow the lawn"), line("t1", "Mow the verge")]);

    const { lines } = searchTrove("mow", folders, [today, ...lists], new Set(["today>c1"]));

    expect(lines.map((match) => `${match.list.id}:${match.line.id}`)).toEqual(["today:t1", "chores:c1"]);
  });

  it("still shows an unnamed list by a line it has pulled in", () => {
    const later = list("later", UNTITLED_LIST_TITLE, [line("later>c1", "Mow the lawn")]);

    const results = searchTrove("mow", folders, [later, ...lists], new Set(["later>c1"]));

    expect(ids(results.lists)).toEqual(["later"]);
    expect(results.lines.map((match) => `${match.list.id}:${match.line.id}`)).toEqual(["chores:c1"]);
  });

  it("finds a list by its title and by its lines at once", () => {
    const results = searchTrove("chores", folders, lists);
    expect(ids(results.lists)).toEqual(["chores"]);
    expect(results.lines.map((match) => match.line.id)).toEqual(["u2"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchTrove("zebra", folders, lists)).toEqual({ folders: [], lists: [], lines: [] });
  });

  it("stops collecting lines once there are more than anyone would read", () => {
    const long = list(
      "long",
      "Everything",
      Array.from({ length: MAX_LINE_MATCHES + 15 }, (_, index) => line(`l${index}`, `Task ${index}`)),
    );
    const results = searchTrove("task", [], [long, list("more", "More", [line("m1", "Task later")])]);
    expect(results.lines).toHaveLength(MAX_LINE_MATCHES);
    expect(results.lines[0].line.id).toBe("l0");
  });

  it("copes with a list that has no lines loaded", () => {
    const bare = list("bare", "Bare");
    delete bare.listItems;
    expect(searchTrove("bare", [], [bare])).toEqual({ folders: [], lists: [bare], lines: [] });
  });
});

describe("splitAtMatch", () => {
  it("splits the text around the first match, keeping the text's own capitals", () => {
    expect(splitAtMatch("Water the GARDEN in the garden", "garden")).toEqual({
      before: "Water the ",
      match: "GARDEN",
      after: " in the garden",
    });
  });

  it("handles a match at the very start or end", () => {
    expect(splitAtMatch("Milk", "mi")).toEqual({ before: "", match: "Mi", after: "lk" });
    expect(splitAtMatch("Milk", "lk")).toEqual({ before: "Mi", match: "lk", after: "" });
  });

  it("ignores spaces around what was typed", () => {
    expect(splitAtMatch("Buy milk", "  milk ")).toEqual({ before: "Buy ", match: "milk", after: "" });
  });

  it("gives the whole text back when there is no match or nothing typed", () => {
    expect(splitAtMatch("Milk", "eggs")).toEqual({ before: "Milk", match: "", after: "" });
    expect(splitAtMatch("Milk", "")).toEqual({ before: "Milk", match: "", after: "" });
  });
});
