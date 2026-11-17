import { copyTitle, daysUntilPurge, isPastKeeping, purgeLabel, sortByLifecycle } from "./listLifecycle";
import { decodeListTags, encodeListTags } from "./listEntries";
import type { Folder, SavedItem } from "../types/models";

const STAMP = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-05T00:00:00.000Z";
const folder = (id: string, parentFolderId: string | null = null): Folder => ({
  id,
  name: id,
  parentFolderId,
  createdAt: STAMP,
  updatedAt: STAMP,
});
const list = (id: string, folderId = "", extra: Partial<SavedItem> = {}): SavedItem => ({
  id,
  folderId,
  title: id,
  type: "list",
  tagOptionIds: [],
  createdAt: STAMP,
  updatedAt: STAMP,
  ...extra,
});
const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id);

describe("sortByLifecycle", () => {
  const folders = [folder("trips"), folder("japan", "trips"), folder("work"), folder("old")];

  it("keeps everyday lists and folders apart from what is deleted, archived or a template", () => {
    const sorted = sortByLifecycle(
      [
        list("a"),
        list("b", "", { deletedAt: STAMP }),
        list("c", "", { archivedAt: STAMP }),
        list("d", "", { isTemplate: true }),
        list("e", "", { archivedAt: STAMP, deletedAt: LATER }),
        list("f", "", { isTemplate: true, deletedAt: STAMP }),
      ],
      folders,
    );

    expect(ids(sorted.active)).toEqual(["a"]);
    expect(ids(sorted.deleted)).toEqual(["b", "e", "f"]);
    expect(ids(sorted.archived)).toEqual(["c"]);
    expect(ids(sorted.templates)).toEqual(["d"]);
    expect(ids(sorted.folders)).toEqual(["trips", "japan", "work", "old"]);
  });

  it("takes a deleted folder's subfolders and every list in them along, even one added since", () => {
    const sorted = sortByLifecycle(
      [
        list("packing", "trips", { deletedAt: LATER, deletedWithFolderId: "trips" }),
        list("tokyo", "japan"),
        list("early", "trips", { deletedAt: STAMP }),
        list("notes", "work"),
      ],
      folders,
    );

    expect(ids(sorted.folders)).toEqual(["work", "old"]);
    expect(ids(sorted.active)).toEqual(["notes"]);
    expect(sorted.deletedFolders.map(({ folder: gone, at, listCount }) => [gone.id, at, listCount])).toEqual([
      ["trips", LATER, 2],
    ]);
    // The list added since takes the folder's date; the one deleted before keeps its own.
    expect(sorted.deleted.map((item) => [item.id, item.deletedAt, item.deletedWithFolderId])).toEqual([
      ["packing", LATER, "trips"],
      ["tokyo", LATER, "trips"],
      ["early", STAMP, undefined],
    ]);
  });

  it("does the same for an archived folder, and lets deleting win", () => {
    const sorted = sortByLifecycle(
      [
        list("tokyo", "japan", { archivedAt: STAMP, archivedWithFolderId: "japan" }),
        list("plan", "old", { archivedAt: STAMP, archivedWithFolderId: "old" }),
        list("gone", "old", { deletedAt: LATER, deletedWithFolderId: "old" }),
        list("packing", "trips"),
      ],
      folders,
    );

    expect(sorted.archivedFolders.map(({ folder: kept }) => kept.id)).toEqual(["japan"]);
    expect(sorted.deletedFolders.map(({ folder: gone }) => gone.id)).toEqual(["old"]);
    expect(ids(sorted.folders)).toEqual(["trips", "work"]);
    expect(ids(sorted.archived)).toEqual(["tokyo"]);
    expect(ids(sorted.deleted)).toEqual(["plan", "gone"]);
    expect(ids(sorted.active)).toEqual(["packing"]);
  });

  it("ignores a mark that names a folder that no longer exists", () => {
    const sorted = sortByLifecycle([list("a", "", { deletedAt: STAMP, deletedWithFolderId: "nowhere" })], folders);

    expect(sorted.deletedFolders).toEqual([]);
    expect(ids(sorted.deleted)).toEqual(["a"]);
  });
});

describe("how long a deleted list is kept", () => {
  const now = new Date("2026-01-31T12:00:00.000Z");

  it("counts down the days and says so", () => {
    expect(daysUntilPurge("2026-01-30T12:00:00.000Z", now)).toBe(29);
    expect(purgeLabel("2026-01-30T12:00:00.000Z", now)).toBe("29 days left");
    expect(purgeLabel("2026-01-02T09:00:00.000Z", now)).toBe("Deleted for good tomorrow");
  });

  it("is over after 30 days", () => {
    expect(isPastKeeping("2026-01-01T12:00:00.000Z", now)).toBe(true);
    expect(isPastKeeping("2026-01-02T12:00:00.000Z", now)).toBe(false);
    expect(isPastKeeping("not a date", now)).toBe(false);
  });
});

describe("copyTitle", () => {
  it("names each copy apart", () => {
    expect(copyTitle("Packing", ["Packing"])).toBe("Packing copy");
    expect(copyTitle("Packing", ["Packing", "packing copy"])).toBe("Packing copy 2");
    expect(copyTitle("Packing copy", ["Packing", "Packing copy", "Packing copy 2"])).toBe("Packing copy 3");
  });
});

describe("list marks in sync", () => {
  it("travel as tags and come back as they were", () => {
    const marks = {
      tagOptionIds: ["tag-1"],
      pinned: true,
      deletedAt: LATER,
      deletedWithFolderId: "trips",
      archivedAt: STAMP,
      archivedWithFolderId: "japan",
      isTemplate: true,
    };
    const tags = encodeListTags(marks);

    expect(tags).toEqual([
      "tag-1",
      "fmt:pinned",
      `fmt:deleted:${LATER}`,
      "fmt:delfolder:trips",
      `fmt:archived:${STAMP}`,
      "fmt:arcfolder:japan",
      "fmt:template",
    ]);
    expect(decodeListTags(tags)).toEqual(marks);
  });

  it("leave an ordinary list with only its own tags", () => {
    expect(encodeListTags({ tagOptionIds: ["tag-1"], deletedWithFolderId: "trips" })).toEqual(["tag-1"]);
    expect(decodeListTags(["tag-1"])).toEqual({ tagOptionIds: ["tag-1"] });
  });
});
