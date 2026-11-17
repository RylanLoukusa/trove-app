import { dueMoment, isResetDue, lastResetBoundary, nextDueDate, parseTimeInput } from "./schedule";
import { decodeEntryFormat, decodeListTags, encodeEntryFormat, encodeListTags } from "./listEntries";

describe("parseTimeInput", () => {
  it.each([
    ["9", "09:00"],
    ["9:30", "09:30"],
    ["0930", "09:30"],
    ["21:15", "21:15"],
    ["9.30pm", "21:30"],
    ["9 am", "09:00"],
    ["12am", "00:00"],
    ["12 PM", "12:00"],
    ["7p", "19:00"],
    ["noon", "12:00"],
  ])("reads %p as %p", (input, expected) => {
    expect(parseTimeInput(input)).toBe(expected);
  });

  it.each(["", "25:00", "9:75", "13pm", "soon", "0pm"])("doesn't take %p as a time", (input) => {
    expect(parseTimeInput(input)).toBeNull();
  });
});

describe("dueMoment", () => {
  it("is the date at the time, in local time", () => {
    expect(dueMoment("2026-03-04", "18:30")).toEqual(new Date(2026, 2, 4, 18, 30));
    expect(dueMoment("2026-03-04", undefined)).toBeNull();
    expect(dueMoment(undefined, "18:30")).toBeNull();
  });
});

describe("nextDueDate", () => {
  // Wednesday 4 March 2026.
  const today = new Date(2026, 2, 4, 15, 0);

  it("moves a line done on time to its next date", () => {
    expect(nextDueDate("daily", "2026-03-04", today)).toBe("2026-03-05");
    expect(nextDueDate("weekly", "2026-03-04", today)).toBe("2026-03-11");
    expect(nextDueDate("monthly", "2026-03-04", today)).toBe("2026-04-04");
    expect(nextDueDate("yearly", "2026-03-04", today)).toBe("2027-03-04");
  });

  it("skips the weekend for weekdays", () => {
    const friday = new Date(2026, 2, 6);
    expect(nextDueDate("weekdays", "2026-03-06", friday)).toBe("2026-03-09");
  });

  it("brings a late line back after today, on its own schedule", () => {
    expect(nextDueDate("weekly", "2026-02-18", today)).toBe("2026-03-11");
    expect(nextDueDate("daily", "2026-02-01", today)).toBe("2026-03-05");
  });

  it("counts from today when the line has no date", () => {
    expect(nextDueDate("weekly", undefined, today)).toBe("2026-03-11");
  });

  it("keeps the day of the month where the month has it", () => {
    const jan31 = new Date(2026, 0, 31);
    expect(nextDueDate("monthly", "2026-01-31", jan31)).toBe("2026-02-28");
    expect(nextDueDate("yearly", "2028-02-29", new Date(2028, 1, 29))).toBe("2029-02-28");
  });
});

describe("lists that uncheck themselves", () => {
  // Wednesday 4 March 2026, mid-afternoon.
  const now = new Date(2026, 2, 4, 15, 0);

  it("start over at midnight, on Monday or on the 1st", () => {
    expect(lastResetBoundary("daily", now)).toEqual(new Date(2026, 2, 4));
    expect(lastResetBoundary("weekly", now)).toEqual(new Date(2026, 2, 2));
    expect(lastResetBoundary("weekly", new Date(2026, 2, 8))).toEqual(new Date(2026, 2, 2));
    expect(lastResetBoundary("monthly", now)).toEqual(new Date(2026, 2, 1));
  });

  it("are due once a new day, week or month has begun since they last did", () => {
    expect(isResetDue("daily", new Date(2026, 2, 3, 22).toISOString(), now)).toBe(true);
    expect(isResetDue("daily", new Date(2026, 2, 4, 1).toISOString(), now)).toBe(false);
    expect(isResetDue("weekly", new Date(2026, 2, 1, 12).toISOString(), now)).toBe(true);
    expect(isResetDue("weekly", new Date(2026, 2, 2, 9).toISOString(), now)).toBe(false);
    expect(isResetDue("monthly", undefined, now)).toBe(false);
  });
});

describe("time, repeat and reset in sync", () => {
  it("travel as tags on a line and come back", () => {
    const line = { kind: "check" as const, tagOptionIds: ["t1"], dueTime: "07:30", repeat: "weekdays" as const };
    const { kind, tags } = encodeEntryFormat(line);

    expect(tags).toEqual(["t1", "fmt:time:07:30", "fmt:repeat:weekdays"]);
    expect(decodeEntryFormat(kind, tags)).toEqual(line);
    expect(decodeEntryFormat("check", ["fmt:time:7am", "fmt:repeat:hourly"])).toEqual({ kind: "check", tagOptionIds: [] });
  });

  it("travel as tags on a list and come back", () => {
    const list = { tagOptionIds: [], resetRule: "weekly" as const, resetAt: "2026-03-02T07:00:00.000Z" };
    const tags = encodeListTags(list);

    expect(tags).toEqual(["fmt:reset:weekly", "fmt:resetat:2026-03-02T07:00:00.000Z"]);
    expect(decodeListTags(tags)).toEqual(list);
  });
});
