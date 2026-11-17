import { MAX_REMINDERS, planReminders, reminderChanges } from "./reminderPlan";
import type { ListEntry, SavedItem } from "../types/models";

const STAMP = "2026-01-01T00:00:00.000Z";
const list = (id: string, title: string): SavedItem => ({
  id,
  folderId: "",
  title,
  type: "list",
  tagOptionIds: [],
  createdAt: STAMP,
  updatedAt: STAMP,
});
const entry = (id: string, extra: Partial<ListEntry> = {}): ListEntry => ({
  id,
  listId: "chores",
  kind: "check",
  text: id,
  checked: false,
  indentLevel: 0,
  position: "a0",
  tagOptionIds: [],
  createdAt: STAMP,
  updatedAt: STAMP,
  ...extra,
});

const now = new Date(2026, 2, 4, 12, 0);

describe("planReminders", () => {
  it("reminds about open lines with a date and a time still to come, soonest first", () => {
    const plan = planReminders(
      [list("chores", "Chores")],
      [
        entry("Later", { dueDate: "2026-03-05", dueTime: "09:00" }),
        entry("Soon", { dueDate: "2026-03-04", dueTime: "18:00" }),
        entry("Past", { dueDate: "2026-03-04", dueTime: "08:00" }),
        entry("No time", { dueDate: "2026-03-05" }),
        entry("Done", { dueDate: "2026-03-05", dueTime: "09:00", checked: true }),
        entry("Elsewhere", { listId: "archived", dueDate: "2026-03-05", dueTime: "09:00" }),
        entry("Shown here", { dueDate: "2026-03-05", dueTime: "09:00", refEntryId: "Later" }),
      ],
      now,
    );

    expect(plan.map((reminder) => [reminder.title, reminder.body, reminder.at])).toEqual([
      ["Soon", "Chores", new Date(2026, 2, 4, 18, 0)],
      ["Later", "Chores", new Date(2026, 2, 5, 9, 0)],
    ]);
  });

  it("gives a reminder a new key when the line changes", () => {
    const lists = [list("chores", "Chores")];
    const before = planReminders(lists, [entry("a", { text: "Bins", dueDate: "2026-03-05", dueTime: "09:00" })], now);
    const renamed = planReminders(lists, [entry("a", { text: "Bins out", dueDate: "2026-03-05", dueTime: "09:00" })], now);
    const moved = planReminders(lists, [entry("a", { text: "Bins", dueDate: "2026-03-05", dueTime: "10:00" })], now);

    expect(new Set([before[0].key, renamed[0].key, moved[0].key]).size).toBe(3);
    expect(before[0].key.startsWith("trove-a-")).toBe(true);
  });

  it("keeps to what a phone allows", () => {
    const many = Array.from({ length: 80 }, (_, index) =>
      entry(`e${index}`, { dueDate: "2026-03-05", dueTime: `${String(index % 24).padStart(2, "0")}:00` }),
    );
    expect(planReminders([list("chores", "Chores")], many, now)).toHaveLength(MAX_REMINDERS);
  });
});

describe("reminderChanges", () => {
  it("cancels what is no longer planned and adds what is new, leaving others' notifications alone", () => {
    const plan = planReminders(
      [list("chores", "Chores")],
      [entry("a", { dueDate: "2026-03-05", dueTime: "09:00" }), entry("b", { dueDate: "2026-03-05", dueTime: "10:00" })],
      now,
    );

    const { cancel, add } = reminderChanges([plan[0].key, "trove-old-1-x", "someone-else"], plan);

    expect(cancel).toEqual(["trove-old-1-x"]);
    expect(add.map((reminder) => reminder.entryId)).toEqual(["b"]);
  });
});
