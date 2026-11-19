import type { SavedItem } from "../types/models";
import { listDisplayTitle } from "../utils/listEntries";

// Siri and Shortcuts. Two ways in:
// - Links, from a Shortcuts "Open URL" step or anywhere else:
//     trove://add?text=Milk&list=Groceries   adds lines ("text" may hold
//                                             several, one per line)
//     trove://open?list=Groceries            opens a list
//   (also https://trovecollections.app/add and /open).
// - On iOS 16 and later, the app's own "Add to Trove" and "Open a Trove list"
//   actions, which Siri runs by voice. They leave the command for the app,
//   which carries it out the next time it is active.

export type ShortcutCommand =
  | { id?: string; action: "add"; text: string; list?: string }
  | { id?: string; action: "open"; list: string };

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
    .map((list) => ({ list, title: normalize(listDisplayTitle(list, list.listItems)) }))
    .sort(
      (a, b) =>
        Number(!!b.list.pinned) - Number(!!a.list.pinned) || b.list.updatedAt.localeCompare(a.list.updatedAt),
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
  if (command.action === "open") {
    const list = findListByName(deps.items, command.list);
    return list ? { ok: true, listId: list.id, added: 0, created: false } : { ok: false, error: `There's no list called "${command.list}".` };
  }
  const lines = shortcutLines(command.text);
  if (lines.length === 0) return { ok: false, error: "There was nothing to add." };
  const name = command.list ?? deps.inboxTitle;
  const canUse = (list: SavedItem) => deps.canEditItem(list.id);
  // The Inbox is the top-level one; a named list can be anywhere.
  const existing = command.list
    ? findListByName(deps.items, name, canUse)
    : deps.items.find((list) => list.type === "list" && !list.folderId && list.title === deps.inboxTitle && canUse(list)) ?? null;
  if (!existing) {
    const created = deps.createList(name.trim(), lines);
    return created
      ? { ok: true, listId: created.id, added: lines.length, created: true }
      : { ok: false, error: `Couldn't make a list called "${name}".` };
  }
  const added = deps.addLines(existing.id, lines);
  return added > 0 ? { ok: true, listId: existing.id, added, created: false } : { ok: false, error: "Couldn't add to that list." };
};
