import type { ListEntry, SavedItem } from "../types/models";
import { listDisplayTitle } from "../utils/listEntries";
import { dueMoment } from "../utils/schedule";

// iOS keeps at most 64 scheduled notifications for an app; leave room.
export const MAX_REMINDERS = 60;

export type Reminder = {
  // Changes whenever what the reminder says or when it fires changes, so an
  // edited line gets its old reminder replaced.
  key: string;
  entryId: string;
  listId: string;
  at: Date;
  title: string;
  body: string;
};

const hash = (text: string): string => {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) value = (value * 31 + text.charCodeAt(index)) | 0;
  return (value >>> 0).toString(36);
};

// The reminders this device should have scheduled: one for each open line
// that has a date and a time still to come, soonest first. `lists` are the
// lists in everyday use, so archived, deleted and template lines are left out.
export const planReminders = (lists: SavedItem[], entries: ListEntry[], now: Date = new Date()): Reminder[] => {
  const listsById = new Map(lists.map((list) => [list.id, list]));
  const reminders: Reminder[] = [];
  entries.forEach((entry) => {
    if (entry.refEntryId || entry.checked || !entry.text.trim()) return;
    const list = listsById.get(entry.listId);
    if (!list) return;
    const at = dueMoment(entry.dueDate, entry.dueTime);
    if (!at || at.getTime() <= now.getTime()) return;
    const title = entry.text.trim();
    const body = listDisplayTitle(list, list.listItems);
    reminders.push({
      key: `trove-${entry.id}-${at.getTime()}-${hash(`${title}\n${body}`)}`,
      entryId: entry.id,
      listId: list.id,
      at,
      title,
      body,
    });
  });
  return reminders.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_REMINDERS);
};

// What to change so that what is scheduled matches the plan: reminders to
// cancel (by key) and reminders to add. Only Trove's own keys are touched.
export const reminderChanges = (
  scheduledKeys: string[],
  plan: Reminder[],
): { cancel: string[]; add: Reminder[] } => {
  const planned = new Set(plan.map((reminder) => reminder.key));
  const scheduled = new Set(scheduledKeys);
  return {
    cancel: scheduledKeys.filter((key) => key.startsWith("trove-") && !planned.has(key)),
    add: plan.filter((reminder) => !scheduled.has(reminder.key)),
  };
};
