import type { SavedItem } from "../types/models";
import { listDisplayTitle } from "../utils/listEntries";

// Siri and Shortcuts. Two ways in:
// - Links, from a Shortcuts "Open URL" step or anywhere else:
//     trove://add?text=Milk&list=Groceries   adds lines ("text" may hold
//                                             several, one per line)
//     trove://open?list=Groceries            opens a list
//   (also https://trovecollections.app/add and /open).
// - On iOS 16 and later, the app's own "Add to Trove" and "Open a Trove list"
//   actions, which Siri runs by voice. Siri asks which list, from the lists
//   the app last told it about (see shortcutListIndex). They leave the
//   command for the app, which carries it out the next time it is active.

// `listId` is the list Siri picked, when it picked one; `list` is its name.
export type ShortcutCommand =
  | { id?: string; action: "add"; text: string; list?: string; listId?: string }
  | { id?: string; action: "open"; list: string; listId?: string };

// What stands for the Inbox in Siri's choice of lists when there's no Inbox
// list yet: adding to it makes one.
export const SHORTCUT_INBOX_ID = "inbox";
export const SHORTCUT_LIST_COUNT = 200;

export type ShortcutListChoice = { id: string; title: string };

// The lists Siri offers: the ones this person can add to, pinned first and
// then the ones changed most recently, with the Inbox always there.
export const shortcutListIndex = (
  items: SavedItem[],
  canEditItem: (itemId: string) => boolean,
  inboxTitle: string,
): ShortcutListChoice[] => {
  const lists = items
    .filter((item) => item.type === "list" && !item.isTemplate && canEditItem(item.id))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
    .map((item) => ({
      id: item.id,
      title: listDisplayTitle(item, item.listItems).trim(),
    }))
    .filter((choice) => !!choice.title);
  const hasInbox = items.some(
    (item) => item.type === "list" && !item.folderId && item.title === inboxTitle && canEditItem(item.id),
  );
  return [...lists.slice(0, SHORTCUT_LIST_COUNT), ...(hasInbox ? [] : [{ id: SHORTCUT_INBOX_ID, title: inboxTitle }])];
};

const LINK_HOSTS = new Set(["trovecollections.app", "www.trovecollections.app"]);

// The command in a link, or null when the link is for something else.
export const parseShortcutUrl = (url: string): ShortcutCommand | null => {
  const match = /^(?:trove:\/\/|https:\/\/([^/?#]+)\/)(add|open)\/?(?:\?(.*))?$/i.exec(url.trim());
  if (!match) return null;
  if (match[1] && !LINK_HOSTS.has(match[1].toLowerCase())) return null;
  const params = new Map<string, string>();
  (match[3] ?? "").split("&").forEach((pair) => {
    if (!pair) return;
    const [key, ...rest] = pair.split("=");
    try {
      params.set(decodeURIComponent(key).toLowerCase(), decodeURIComponent(rest.join("=").replace(/\+/g, " ")));
    } catch {
      // A badly encoded value is left out.
    }
  });
  const list = params.get("list")?.trim() || undefined;
  if (match[2].toLowerCase() === "open") return list ? { action: "open", list } : null;
  const text = params.get("text")?.trim();
  return text ? { action: "add", text, ...(list ? { list } : {}) } : null;
};

// Whether a link is one of these commands, so navigation leaves it alone.
export const isShortcutUrl = (url: string): boolean => parseShortcutUrl(url) !== null;

// The lines to add: one per line of the text, without list markers.
export const shortcutLines = (text: string): string[] =>
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d{1,3}[.)])\s+/, "").trim())
    .filter(Boolean);

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(?:my|the)\s+/, "")
    .replace(/\s+list$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// The list a spoken or typed name means: the same name, then one that starts
// with it, then one that contains it. Pinned lists win a tie, then the one
// changed most recently. Templates and lists that can't be changed are left
// out when adding.
export const findListByName = (
  lists: SavedItem[],
  name: string,
  canUse: (list: SavedItem) => boolean = () => true,
): SavedItem | null => {
  const wanted = normalize(name);
  if (!wanted) return null;
  const candidates = lists
    .filter((list) => list.type === "list" && !list.isTemplate && canUse(list))
    .map((list) => ({
      list,
      title: normalize(listDisplayTitle(list, list.listItems)),
    }))
    .sort(
      (a, b) => Number(!!b.list.pinned) - Number(!!a.list.pinned) || b.list.updatedAt.localeCompare(a.list.updatedAt),
    );
  return (
    candidates.find((candidate) => candidate.title === wanted)?.list ??
    candidates.find((candidate) => candidate.title.startsWith(wanted))?.list ??
    candidates.find((candidate) => candidate.title.includes(wanted))?.list ??
    null
  );
};

export type ShortcutDeps = {
  items: SavedItem[];
  canEditItem: (itemId: string) => boolean;
  // Makes a list with these lines on it.
  createList: (title: string, lines: string[]) => SavedItem | null;
  addLines: (listId: string, lines: string[]) => number;
  // The list things go to when no list is named.
  inboxTitle: string;
};

export type ShortcutOutcome =
  | { ok: true; listId: string; added: number; created: boolean }
  | { ok: false; error: string };

// Carries out a command against the person's lists.
export const runShortcutCommand = (command: ShortcutCommand, deps: ShortcutDeps): ShortcutOutcome => {
  const canUse = (list: SavedItem) => deps.canEditItem(list.id);
  // The list Siri picked, if it's still there (and can be added to).
  const picked = (usable: (list: SavedItem) => boolean) =>
    command.listId && command.listId !== SHORTCUT_INBOX_ID
      ? (deps.items.find((item) => item.id === command.listId && item.type === "list" && usable(item)) ?? null)
      : null;
  if (command.action === "open") {
    const list = picked(() => true) ?? findListByName(deps.items, command.list);
    return list
      ? { ok: true, listId: list.id, added: 0, created: false }
      : { ok: false, error: `There's no list called "${command.list}".` };
  }
  const lines = shortcutLines(command.text);
  if (lines.length === 0) return { ok: false, error: "There was nothing to add." };
  const toInbox = !command.list || command.listId === SHORTCUT_INBOX_ID;
  const name = toInbox ? deps.inboxTitle : command.list!;
  // The Inbox is the top-level one; a named list can be anywhere.
  const existing =
    picked(canUse) ??
    (!toInbox
      ? findListByName(deps.items, name, canUse)
      : (deps.items.find(
          (list) => list.type === "list" && !list.folderId && list.title === deps.inboxTitle && canUse(list),
        ) ?? null));
  if (!existing) {
    const created = deps.createList(name.trim(), lines);
    return created
      ? { ok: true, listId: created.id, added: lines.length, created: true }
      : { ok: false, error: `Couldn't make a list called "${name}".` };
  }
  const added = deps.addLines(existing.id, lines);
  return added > 0
    ? { ok: true, listId: existing.id, added, created: false }
    : { ok: false, error: "Couldn't add to that list." };
};
