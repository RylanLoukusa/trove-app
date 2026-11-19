import type { ListEntry, TagOption } from "../types/models";
import { parsePrice, parseQuantity } from "./fields";
import { toDateKey } from "./listView";
import { parseTimeInput } from "./schedule";

// Quick add with smart text: a line typed as "Call mom tomorrow 6pm !high"
// becomes "Call mom", due tomorrow at 6 PM, high priority. Only words that
// clearly mean a date, time, repeat, priority, tag, price or quantity are
// taken out, and only when some words are left for the line itself.

export type SmartFields = Partial<Pick<ListEntry, "dueDate" | "dueTime" | "repeat" | "price" | "quantity">> & {
  tagOptionIds?: string[];
};

export type SmartResult = { text: string; fields: SmartFields };

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const addDays = (date: Date, days: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

// The next such weekday after today (a week out when it is today).
const nextWeekday = (today: Date, weekday: number): Date => addDays(today, ((weekday - today.getDay() + 7) % 7) || 7);

const weekdayIndex = (word: string): number => WEEKDAYS.findIndex((day) => day.slice(0, 3) === word.slice(0, 3).toLowerCase());

type Rule = { pattern: RegExp; apply: (match: RegExpExecArray, fields: SmartFields, today: Date) => boolean };

const dayWord = "(?:sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)";
const dayFull = "(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)";
const monthWord = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";
const timeWord = "(?:noon|midnight|\\d{1,2}(?:[:.]\\d{2})?\\s?(?:am|pm|a|p)|\\d{1,2}:\\d{2})";

const setDate = (fields: SmartFields, date: Date): boolean => {
  if (fields.dueDate) return false;
  fields.dueDate = toDateKey(date);
  return true;
};

const RULES: Rule[] = [
  // Repeats first, so "every monday" isn't read as a date alone.
  {
    pattern: new RegExp(`\\b(?:every\\s?day|daily)\\b`, "i"),
    apply: (_m, f) => !f.repeat && !!(f.repeat = "daily"),
  },
  {
    pattern: /\b(?:every\s+weekday|weekdays)\b/i,
    apply: (_m, f) => !f.repeat && !!(f.repeat = "weekdays"),
  },
  {
    pattern: new RegExp(`\\bevery\\s+(${dayWord})\\b`, "i"),
    apply: (m, f, today) => {
      if (f.repeat) return false;
      f.repeat = "weekly";
      const index = weekdayIndex(m[1].toLowerCase());
      if (index >= 0 && !f.dueDate) f.dueDate = toDateKey(today.getDay() === index ? today : nextWeekday(today, index));
      return true;
    },
  },
  { pattern: /\b(?:every\s+week|weekly)\b/i, apply: (_m, f) => !f.repeat && !!(f.repeat = "weekly") },
  { pattern: /\b(?:every\s+month|monthly)\b/i, apply: (_m, f) => !f.repeat && !!(f.repeat = "monthly") },
  { pattern: /\b(?:every\s+year|yearly|annually)\b/i, apply: (_m, f) => !f.repeat && !!(f.repeat = "yearly") },
  // A time: "at 6", "6pm", "6:30 pm", "18:00", "noon".
  {
    pattern: new RegExp(`\\b(?:at\\s+)?(${timeWord})(?![\\w:])`, "i"),
    apply: (m, f) => {
      if (f.dueTime) return false;
      const time = parseTimeInput(m[1]);
      if (!time) return false;
      f.dueTime = time;
      return true;
    },
  },
  // Dates.
  { pattern: /\btoday\b/i, apply: (_m, f, today) => setDate(f, today) },
  {
    pattern: /\btonight\b/i,
    apply: (_m, f, today) => {
      if (!setDate(f, today)) return false;
      f.dueTime ??= "19:00";
      return true;
    },
  },
  { pattern: /\b(?:tomorrow|tmrw|tmr)\b/i, apply: (_m, f, today) => setDate(f, addDays(today, 1)) },
  {
    pattern: /\b(?:this\s+)?weekend\b/i,
    apply: (_m, f, today) => {
      const weekday = today.getDay();
      return setDate(f, weekday === 6 || weekday === 0 ? today : addDays(today, 6 - weekday));
    },
  },
  { pattern: /\bnext\s+week\b/i, apply: (_m, f, today) => setDate(f, nextWeekday(today, 1)) },
  {
    pattern: /\bin\s+(\d{1,3})\s+(day|days|week|weeks)\b/i,
    apply: (m, f, today) => setDate(f, addDays(today, Number(m[1]) * (m[2].toLowerCase().startsWith("week") ? 7 : 1))),
  },
  {
    // A whole weekday name, or a short one after "on", "next", "this" or "by".
    pattern: new RegExp(`\\b(?:(?:on|next|this|by)\\s+(${dayWord})|(${dayFull}))\\b`, "i"),
    apply: (m, f, today) => {
      const index = weekdayIndex(m[1] ?? m[2]);
      return index >= 0 && setDate(f, nextWeekday(today, index));
    },
  },
  {
    // "dec 5", "on december 5th", "5 dec".
    pattern: new RegExp(`\\b(?:on\\s+)?(?:(${monthWord})\\s+(\\d{1,2})(?:st|nd|rd|th)?|(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthWord}))\\b`, "i"),
    apply: (m, f, today) => {
      const monthName = (m[1] ?? m[4]).toLowerCase().slice(0, 3);
      const month = MONTHS.indexOf(monthName);
      const day = Number(m[2] ?? m[3]);
      if (month < 0 || day < 1 || day > 31) return false;
      let date = new Date(today.getFullYear(), month, day);
      if (date.getMonth() !== month) return false;
      // A date already past this year means next year's.
      if (toDateKey(date) < toDateKey(today)) date = new Date(today.getFullYear() + 1, month, day);
      return setDate(f, date);
    },
  },
  // A price with a currency sign: "$12.50", "12,50€", "£4".
  {
    pattern: /(?:^|\s)((?:[$€£¥]\s?\d[\d.,]*)|(?:\d[\d.,]*\s?[$€£¥]))(?=\s|$)/,
    apply: (m, f) => {
      if (f.price !== undefined) return false;
      const price = parsePrice(m[1]);
      if (price === null) return false;
      f.price = price;
      return true;
    },
  },
  // A quantity: "x3", "3x".
  {
    pattern: /(?:^|\s)(x\d+(?:\.\d+)?|\d+(?:\.\d+)?x)(?=\s|$)/i,
    apply: (m, f) => {
      if (f.quantity !== undefined) return false;
      const quantity = parseQuantity(m[1]);
      if (quantity === null) return false;
      f.quantity = quantity;
      return true;
    },
  },
  {
    // "at 6" with no am or pm, only at the end of the line (after any date
    // is taken off), so "Chapter 5 at 3 places" stays as it is.
    pattern: /\bat\s+(\d{1,2})\s*$/i,
    apply: (m, f) => {
      if (f.dueTime) return false;
      const hours = Number(m[1]);
      if (hours < 1 || hours > 12) return false;
      // "at 6" means the next 6 people mean: before 7 is evening.
      f.dueTime = parseTimeInput(`${hours}${hours < 7 || hours === 12 ? "pm" : "am"}`) ?? undefined;
      return !!f.dueTime;
    },
  },
];

// "!high", "!!!" (high), "!!" (medium), "!low"; and "#tag" for a tag the
// person has, matched without case or spaces.
const priorityWord = /(?:^|\s)(!{1,3}|!(?:high|hi|h|medium|med|m|low|lo|l))(?=\s|$)/i;
const tagWord = /(?:^|\s)#([\p{L}\p{N}_-]+)(?=\s|$)/u;

const squash = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, "");

const priorityLevel = (token: string): "high" | "medium" | "low" | null => {
  const word = token.slice(1).toLowerCase();
  if (token === "!!!" || ["high", "hi", "h"].includes(word)) return "high";
  if (token === "!!" || ["medium", "med", "m"].includes(word)) return "medium";
  if (token === "!" || ["low", "lo", "l"].includes(word)) return "low";
  return null;
};

export const parseSmartText = (
  input: string,
  {
    today = new Date(),
    priorityOptions = [],
    tagOptions = [],
  }: { today?: Date; priorityOptions?: TagOption[]; tagOptions?: TagOption[] } = {},
): SmartResult => {
  let text = ` ${input} `;
  const fields: SmartFields = {};
  const tagIds: string[] = [];
  const cut = (match: RegExpExecArray) => {
    text = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
  };

  RULES.forEach((rule) => {
    const match = rule.pattern.exec(text);
    if (match && rule.apply(match, fields, today)) cut(match);
  });

  const priorityMatch = priorityWord.exec(text);
  if (priorityMatch) {
    const level = priorityLevel(priorityMatch[1]);
    // Priority options are kept low to high.
    const sorted = [...priorityOptions].sort((a, b) => a.sortOrder - b.sortOrder);
    const option =
      sorted.find((candidate) => candidate.name.toLowerCase() === level) ??
      (level === "high" ? sorted[sorted.length - 1] : level === "low" ? sorted[0] : sorted[Math.floor(sorted.length / 2)]);
    if (level && option) {
      tagIds.push(option.id);
      cut(priorityMatch);
    }
  }

  for (let guard = 0; guard < 10; guard += 1) {
    const match = tagWord.exec(text);
    if (!match) break;
    const option = tagOptions.find((candidate) => squash(candidate.name) === squash(match[1]));
    if (!option) {
      // Not a tag they have: leave the word, and look past it.
      text = `${text.slice(0, match.index)} ${match[0].trim().replace("#", "\u0000")} ${text.slice(match.index + match[0].length)}`;
      continue;
    }
    if (!tagIds.includes(option.id)) tagIds.push(option.id);
    cut(match);
  }
  text = text.replace(/\u0000/g, "#");

  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "")
    .trim();
  if (tagIds.length) fields.tagOptionIds = tagIds;
  // Nothing left to call the line: keep it as typed.
  if (!cleaned || Object.keys(fields).length === 0) return { text: input.trim(), fields: {} };
  return { text: cleaned, fields };
};

export const hasSmartFields = (result: SmartResult): boolean => Object.keys(result.fields).length > 0;
