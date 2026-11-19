import type { TagOption } from "../types/models";
import { parseSmartText } from "./smartText";

// Wednesday 18 November 2026.
const today = new Date(2026, 10, 18);
const option = (id: string, name: string, sortOrder: number): TagOption => ({
  id,
  groupId: "g",
  name,
  sortOrder,
  createdAt: "",
  updatedAt: "",
});
const priorityOptions = [option("low", "Low", 0), option("medium", "Medium", 1), option("high", "High", 2)];
const tagOptions = [option("store", "Store", 0), option("costco", "Costco Run", 1)];
const parse = (text: string) => parseSmartText(text, { today, priorityOptions, tagOptions });

describe("smart text in quick add", () => {
  it("takes a date, a time and a priority out of the words", () => {
    expect(parse("Call mom tomorrow 6pm !high")).toEqual({
      text: "Call mom",
      fields: { dueDate: "2026-11-19", dueTime: "18:00", tagOptionIds: ["high"] },
    });
  });

  it("reads the ways people say a day", () => {
    expect(parse("Dentist today").fields.dueDate).toBe("2026-11-18");
    expect(parse("Groceries on fri").fields.dueDate).toBe("2026-11-20");
    expect(parse("Groceries friday").fields.dueDate).toBe("2026-11-20");
    expect(parse("Plan trip next week").fields.dueDate).toBe("2026-11-23");
    expect(parse("Hike this weekend").fields.dueDate).toBe("2026-11-21");
    expect(parse("Renew in 3 days").fields.dueDate).toBe("2026-11-21");
    expect(parse("Party dec 5").fields.dueDate).toBe("2026-12-05");
    expect(parse("Taxes 15th april").fields.dueDate).toBe("2027-04-15");
    // Today's weekday means a week from today.
    expect(parse("Standup wednesday").fields.dueDate).toBe("2026-11-25");
  });

  it("reads times, and tonight as the evening", () => {
    expect(parse("Run at 7:30am").fields.dueTime).toBe("07:30");
    expect(parse("Lunch noon").fields.dueTime).toBe("12:00");
    expect(parse("Call at 6").fields.dueTime).toBe("18:00");
    expect(parse("Meds 21:15").fields.dueTime).toBe("21:15");
    expect(parse("Movie tonight").fields).toEqual({ dueDate: "2026-11-18", dueTime: "19:00" });
    expect(parse("Movie tonight at 9pm").fields).toEqual({ dueDate: "2026-11-18", dueTime: "21:00" });
  });

  it("reads repeats", () => {
    expect(parse("Water plants every day").fields).toEqual({ repeat: "daily" });
    expect(parse("Trash every monday").fields).toEqual({ repeat: "weekly", dueDate: "2026-11-23" });
    expect(parse("Rent monthly").fields).toEqual({ repeat: "monthly" });
  });

  it("takes tags the person has, a price and how many", () => {
    expect(parse("Paper towels #costcorun x2 $12.50")).toEqual({
      text: "Paper towels",
      fields: { price: 12.5, quantity: 2, tagOptionIds: ["costco"] },
    });
    expect(parse("Eggs #store !!")).toEqual({ text: "Eggs", fields: { tagOptionIds: ["medium", "store"] } });
  });

  it("leaves alone words that only look like something", () => {
    expect(parse("Read #hashtags article")).toEqual({ text: "Read #hashtags article", fields: {} });
    expect(parse("Buy 2x4 lumber")).toEqual({ text: "Buy 2x4 lumber", fields: {} });
    expect(parse("C'mon get the mail")).toEqual({ text: "C'mon get the mail", fields: {} });
    expect(parse("Wow!")).toEqual({ text: "Wow!", fields: {} });
    expect(parse("Today")).toEqual({ text: "Today", fields: {} });
    expect(parse("Chapter 5 at 3 places")).toEqual({ text: "Chapter 5 at 3 places", fields: {} });
  });
});
