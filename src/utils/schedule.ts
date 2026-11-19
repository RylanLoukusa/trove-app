import type { RepeatRule, ResetRule } from "../types/models";

// ---------------------------------------------------------------------------
// Times on lines ("HH:MM", 24-hour, local)
// ---------------------------------------------------------------------------

const pad = (value: number): string => String(value).padStart(2, "0");

// The same as listView's date keys, kept here so this file depends on nothing.
const toDateKey = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDateKey = (key: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return toDateKey(date) === key.trim() ? date : null;
};

// Reads what someone types for a time: "9", "9:30", "0930", "21:15",
// "9.30pm", "9 am", "noon". Returns "HH:MM", or null when it isn't a time.
export const parseTimeInput = (input: string): string | null => {
  const text = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return null;
  if (text === "noon" || text === "midday") return "12:00";
  if (text === "midnight") return "00:00";
  const match = /^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/.exec(text);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.[0];
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "a" && hours === 12) hours = 0;
    if (meridiem === "p" && hours !== 12) hours += 12;
  } else if (hours > 23) {
    return null;
  }
  return `${pad(hours)}:${pad(minutes)}`;
};

export const isValidTime = (value: string | undefined): value is string =>
  !!value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

// "09:30" as the device shows times: "9:30 AM" or "09:30".
export const formatTime = (value: string): string => {
  if (!isValidTime(value)) return value;
  const [hours, minutes] = value.split(":").map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

// When a line with a date and a time is due, as a moment.
export const dueMoment = (dueDate: string | undefined, dueTime: string | undefined): Date | null => {
  if (!dueDate || !isValidTime(dueTime)) return null;
  const day = parseDateKey(dueDate);
  if (!day) return null;
  const [hours, minutes] = dueTime.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
};

// Times offered as one tap in a line's details.
export const quickTimes = ["09:00", "12:00", "18:00", "20:00"];

// ---------------------------------------------------------------------------
// Repeating lines
// ---------------------------------------------------------------------------

export const repeatLabels: Record<RepeatRule, string> = {
  daily: "Every day",
  weekdays: "Weekdays",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};

export const REPEAT_RULES = Object.keys(repeatLabels) as RepeatRule[];

export const isRepeatRule = (value: unknown): value is RepeatRule => REPEAT_RULES.includes(value as RepeatRule);

const addDays = (date: Date, days: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

// The same day of the month `months` later, or that month's last day when it
// is shorter (Jan 31 -> Feb 28). `day` is the day the line started on, so a
// line due on the 31st comes back on the 31st where there is one.
const addMonths = (date: Date, months: number, day: number): Date => {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + months + 1, 0).getDate();
  return new Date(date.getFullYear(), date.getMonth() + months, Math.min(day, lastDay));
};

const step = (date: Date, rule: RepeatRule, day: number): Date => {
  switch (rule) {
    case "daily":
      return addDays(date, 1);
    case "weekdays": {
      const next = addDays(date, 1);
      const weekday = next.getDay();
      return weekday === 6 ? addDays(next, 2) : weekday === 0 ? addDays(next, 1) : next;
    }
    case "weekly":
      return addDays(date, 7);
    case "monthly":
      return addMonths(date, 1, day);
    case "yearly":
      return addMonths(date, 12, day);
  }
};

// The due date a repeating line moves to when it is checked off: the next
// time after its due date that is also after today, so a line done late
// doesn't come back already overdue. A line with no date counts from today.
export const nextDueDate = (rule: RepeatRule, dueDate: string | undefined, today: Date = new Date()): string => {
  const todayKey = toDateKey(today);
  const start = (dueDate && parseDateKey(dueDate)) || parseDateKey(todayKey)!;
  const day = start.getDate();
  let next = step(start, rule, day);
  for (let guard = 0; toDateKey(next) <= todayKey && guard < 1000; guard += 1) next = step(next, rule, day);
  return toDateKey(next);
};

// ---------------------------------------------------------------------------
// Lists that uncheck themselves
// ---------------------------------------------------------------------------

export const resetLabels: Record<ResetRule, string> = {
  daily: "Every day",
  weekly: "Every Monday",
  monthly: "On the 1st",
};

export const RESET_RULES = Object.keys(resetLabels) as ResetRule[];

export const isResetRule = (value: unknown): value is ResetRule => RESET_RULES.includes(value as ResetRule);

// The most recent start of a day, week (Monday) or month, at midnight.
export const lastResetBoundary = (rule: ResetRule, now: Date = new Date()): Date => {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (rule === "daily") return midnight;
  if (rule === "weekly") return addDays(midnight, -((midnight.getDay() + 6) % 7));
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

// Whether a list should uncheck its lines now: a new day, week or month has
// begun since it last did (or since the rule was set).
export const isResetDue = (rule: ResetRule, resetAt: string | undefined, now: Date = new Date()): boolean => {
  const last = resetAt ? Date.parse(resetAt) : NaN;
  if (Number.isNaN(last)) return false;
  return last < lastResetBoundary(rule, now).getTime();
};
