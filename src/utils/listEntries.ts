import type { ListEntry, SavedItem, SavedListItem } from "../types/models";

// ---------------------------------------------------------------------------
// Position keys (fractional indexing)
//
// Entries are ordered by a string key compared with plain `<` (code-unit
// order). A new key can always be generated between any two existing keys, so
// moving one entry only rewrites that entry's position.
// ---------------------------------------------------------------------------

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = DIGITS.length;

const digitValue = (char: string): number => {
  const value = DIGITS.indexOf(char);
  if (value < 0) throw new Error(`Invalid position character: ${char}`);
  return value;
};

// Midpoint of a and b where a < b. `a` may be "" (lowest); `b` null means no
// upper bound. Keys never end in "0" so there is always room below them.
const midpoint = (a: string, b: string | null): string => {
  if (b !== null) {
    let shared = 0;
    while ((a[shared] ?? "0") === b[shared]) shared += 1;
    if (shared > 0) return b.slice(0, shared) + midpoint(a.slice(shared), b.slice(shared));
  }

  const lower = a ? digitValue(a[0]) : 0;
  const upper = b !== null ? digitValue(b[0]) : BASE;

  if (upper - lower > 1) return DIGITS[Math.round((lower + upper) / 2)];
  if (b !== null && b.length > 1) return b[0];
  return DIGITS[lower] + midpoint(a.slice(1), null);
};

export const isValidPosition = (key: string): boolean =>
  key.length > 0 && !key.endsWith("0") && [...key].every((char) => DIGITS.includes(char));

export const comparePositions = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const generatePositionBetween = (before: string | null, after: string | null): string => {
  if (before !== null && after !== null && before >= after) {
    throw new Error(`Position ${before} must sort before ${after}`);
  }
  return midpoint(before ?? "", after);
};

export const generatePositionsBetween = (before: string | null, after: string | null, count: number): string[] => {
  if (count <= 0) return [];
  if (count === 1) return [generatePositionBetween(before, after)];
  const middleIndex = Math.floor(count / 2);
  const middle = generatePositionBetween(before, after);
  return [
    ...generatePositionsBetween(before, middle, middleIndex),
    middle,
    ...generatePositionsBetween(middle, after, count - middleIndex - 1),
  ];
};

// Positions for entries migrated from the old `list_items` array. The Supabase
// backfill (20261110120000_list_entries.sql) uses the same formula so a device
// migrating locally and the server produce identical rows.
export const legacyEntryPosition = (index: number): string => `V${String(index + 1).padStart(6, "0")}V`;

export const legacyEntryId = (listId: string, listItemId: string | undefined, index: number): string =>
  `${listId}~${listItemId || String(index + 1)}`;

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export const sortEntries = (entries: ListEntry[]): ListEntry[] =>
  [...entries].sort((a, b) => comparePositions(a.position, b.position) || comparePositions(a.id, b.id));

export const groupEntriesByList = (entries: ListEntry[]): Map<string, ListEntry[]> => {
  const grouped = new Map<string, ListEntry[]>();
  entries.forEach((entry) => {
    const bucket = grouped.get(entry.listId);
    if (bucket) bucket.push(entry);
    else grouped.set(entry.listId, [entry]);
  });
  grouped.forEach((bucket, listId) => grouped.set(listId, sortEntries(bucket)));
  return grouped;
};

export const entryToListItem = (entry: ListEntry): SavedListItem => ({
  id: entry.id,
  kind: entry.kind,
  text: entry.text,
  checked: entry.checked,
  indentLevel: entry.indentLevel,
  ...(entry.bold ? { bold: true } : {}),
});

// A line as saved in the `list_items` snapshot on the list's own row, which
// older app versions and the public-link page read. They only know "check"
// and "bullet", so a plain line is written as a bullet marked `plain`.
export type SnapshotListItem = Omit<SavedListItem, "kind"> & { kind: "check" | "bullet"; plain?: boolean };

export const entryToSnapshotItem = (entry: ListEntry): SnapshotListItem => ({
  id: entry.id,
  kind: entry.kind === "check" ? "check" : "bullet",
  text: entry.text,
  checked: entry.checked,
  indentLevel: entry.indentLevel,
  ...(entry.kind === "text" ? { plain: true } : {}),
  ...(entry.bold ? { bold: true } : {}),
});

export const listItemKindFromSnapshot = (listItem: { kind?: unknown; plain?: unknown } | undefined): ListEntry["kind"] => {
  if (listItem?.kind === "text" || (listItem?.kind === "bullet" && listItem.plain === true)) return "text";
  return listItem?.kind === "bullet" ? "bullet" : "check";
};

// ---------------------------------------------------------------------------
// Formatting that syncs inside an entry's tags
//
// The server stores an entry's kind as "check" or "bullet" and has no column
// for bold. A plain line is therefore synced as a bullet tagged "fmt:text",
// and a bold line carries "fmt:bold". App versions that don't know these tags
// keep them as they are, so they show a plain line as a bullet and lose
// nothing when they save it.
// ---------------------------------------------------------------------------

const FORMAT_TAG_PREFIX = "fmt:";
const PLAIN_LINE_TAG = `${FORMAT_TAG_PREFIX}text`;
const BOLD_LINE_TAG = `${FORMAT_TAG_PREFIX}bold`;

export const encodeEntryFormat = (
  entry: Pick<ListEntry, "kind" | "bold" | "tagOptionIds">,
): { kind: "check" | "bullet"; tags: string[] } => ({
  kind: entry.kind === "check" ? "check" : "bullet",
  tags: [
    ...(entry.tagOptionIds ?? []).filter((tag) => !tag.startsWith(FORMAT_TAG_PREFIX)),
    ...(entry.kind === "text" ? [PLAIN_LINE_TAG] : []),
    ...(entry.bold ? [BOLD_LINE_TAG] : []),
  ],
});

export const decodeEntryFormat = (
  kind: unknown,
  tags: string[],
): Pick<ListEntry, "kind" | "tagOptionIds"> & { bold?: true } => ({
  kind: kind === "bullet" ? (tags.includes(PLAIN_LINE_TAG) ? "text" : "bullet") : "check",
  tagOptionIds: tags.filter((tag) => !tag.startsWith(FORMAT_TAG_PREFIX)),
  ...(tags.includes(BOLD_LINE_TAG) ? { bold: true as const } : {}),
});

// ---------------------------------------------------------------------------
// Lines pulled in from other lists
//
// Any list can show lines from other lists. Such a line is a reference: it
// stays in its own list and is shown, checked off and edited in both places.
// A list that has pulled lines in is stored with listMode "focus" (the name
// of the older feature this grew out of). The server only lets focus lists
// hold references and never lets one point at a line of another focus list,
// so a list either lends lines or borrows them, not both.
// ---------------------------------------------------------------------------

export const isFocusList = (item: Pick<SavedItem, "type" | "listMode"> | undefined): boolean =>
  !!item && item.type === "list" && item.listMode === "focus";

// Ids of lists with at least one line that another list shows.
export const listIdsLendingLines = (entries: ListEntry[]): Set<string> => {
  const referenced = new Set(entries.map((entry) => entry.refEntryId).filter((id): id is string => !!id));
  const lending = new Set<string>();
  if (referenced.size === 0) return lending;
  entries.forEach((entry) => {
    if (referenced.has(entry.id)) lending.add(entry.listId);
  });
  return lending;
};

// Whether `list` can show lines from other lists: it already does, or none
// of its own lines are shown elsewhere.
export const canListBorrowLines = (
  list: Pick<SavedItem, "id" | "type" | "listMode"> | undefined,
  lendingListIds: Set<string>,
): boolean => !!list && list.type === "list" && (isFocusList(list) || !lendingListIds.has(list.id));

// One id per (focus list, line), so adding the same line twice, or from two
// devices, lands on the same row.
export const focusReferenceId = (focusListId: string, entryId: string): string => `${focusListId}>${entryId}`;

// A focus-list line as the UI sees it: the referenced line's content with the
// reference's own id, list and position. `null` when the referenced line isn't
// on this device (deleted, or in a list this person can't open).
export const resolveReference = (reference: ListEntry, entriesById: Map<string, ListEntry>): ListEntry | null => {
  if (!reference.refEntryId) return reference;
  const source = entriesById.get(reference.refEntryId);
  if (!source || source.refEntryId) return null;
  return {
    ...source,
    id: reference.id,
    listId: reference.listId,
    position: reference.position,
    indentLevel: reference.indentLevel ?? 0,
    refEntryId: source.id,
  };
};

export const resolveEntries = (entries: ListEntry[], entriesById: Map<string, ListEntry>): ListEntry[] =>
  entries.flatMap((entry) => {
    const resolved = resolveReference(entry, entriesById);
    return resolved ? [resolved] : [];
  });

// Lines grouped by list with references replaced by what they point at.
export const groupResolvedEntriesByList = (entries: ListEntry[]): Map<string, ListEntry[]> => {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const grouped = groupEntriesByList(entries);
  grouped.forEach((bucket, listId) => {
    if (bucket.some((entry) => entry.refEntryId)) grouped.set(listId, resolveEntries(bucket, byId));
  });
  return grouped;
};

// When lines are removed from this device's data, references to them in focus
// lists go too (the server does the same with a cascading delete). References
// whose line simply isn't on this device are left alone.
export const pruneReferencesToRemoved = (previous: ListEntry[], next: ListEntry[]): ListEntry[] => {
  if (!next.some((entry) => entry.refEntryId)) return next;
  const nextIds = new Set(next.map((entry) => entry.id));
  const removed = new Set(previous.filter((entry) => !nextIds.has(entry.id)).map((entry) => entry.id));
  if (removed.size === 0) return next;
  const pruned = next.filter((entry) => !entry.refEntryId || !removed.has(entry.refEntryId));
  return pruned.length === next.length ? next : pruned;
};

// Items as the UI sees them: list items carry their entries as `listItems`.
export const hydrateItemsWithEntries = (items: SavedItem[], entries: ListEntry[]): SavedItem[] => {
  const byList = groupResolvedEntriesByList(entries);
  return items.map((item) => {
    const listEntries = byList.get(item.id);
    if (!listEntries && item.type !== "list") return item;
    return { ...item, listItems: (listEntries ?? []).map(entryToListItem) };
  });
};

export const stripListItems = (item: SavedItem): SavedItem => {
  if (!("listItems" in item)) return item;
  const { listItems: _listItems, ...rest } = item;
  return rest;
};

// ---------------------------------------------------------------------------
// Migration from the embedded `listItems` array
// ---------------------------------------------------------------------------

const clampIndent = (value: unknown): number => {
  const numeric = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
  return Math.min(Math.max(numeric, 0), 10);
};

export const entriesFromLegacyListItems = (item: SavedItem): ListEntry[] => {
  const seen = new Set<string>();
  const entries: ListEntry[] = [];

  (item.listItems ?? []).forEach((listItem, index) => {
    const id = legacyEntryId(item.id, listItem?.id, index);
    if (seen.has(id)) return;
    seen.add(id);
    const kind = listItemKindFromSnapshot(listItem);
    entries.push({
      id,
      listId: item.id,
      kind,
      text: typeof listItem?.text === "string" ? listItem.text : "",
      checked: kind === "check" && !!listItem?.checked,
      indentLevel: clampIndent(listItem?.indentLevel),
      ...(listItem?.bold ? { bold: true } : {}),
      position: legacyEntryPosition(index),
      tagOptionIds: [],
      ownerId: item.ownerId,
      createdBy: item.createdBy,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
  });

  return entries;
};

// Moves any embedded `listItems` into entries. Items that already have entries
// keep them (the embedded copy is a compatibility snapshot); either way the
// embedded array is dropped from the stored item.
export const migrateEmbeddedListItems = (
  items: SavedItem[],
  entries: ListEntry[],
): { items: SavedItem[]; listEntries: ListEntry[] } => {
  const listIdsWithEntries = new Set(entries.map((entry) => entry.listId));
  const migrated: ListEntry[] = [];

  const nextItems = items.map((item) => {
    if (!("listItems" in item)) return item;
    if (!listIdsWithEntries.has(item.id)) migrated.push(...entriesFromLegacyListItems(item));
    return stripListItems(item);
  });

  return { items: nextItems, listEntries: migrated.length ? [...entries, ...migrated] : entries };
};

// ---------------------------------------------------------------------------
// Writing: apply an edited `listItems` array to a list's entries
// ---------------------------------------------------------------------------

// Indices (into `positions`) of a longest strictly increasing subsequence.
const longestIncreasingRun = (positions: Array<string | null>): Set<number> => {
  const tails: number[] = [];
  const previous = new Array<number>(positions.length).fill(-1);

  positions.forEach((position, index) => {
    if (position === null) return;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((positions[tails[mid]] as string) < position) low = mid + 1;
      else high = mid;
    }
    if (low > 0) previous[index] = tails[low - 1];
    tails[low] = index;
  });

  const kept = new Set<number>();
  let cursor = tails.length ? tails[tails.length - 1] : -1;
  while (cursor >= 0) {
    kept.add(cursor);
    cursor = previous[cursor];
  }
  return kept;
};

// Assigns positions for `orderedIds`, keeping as many existing positions as
// possible so a single move only changes the moved entry.
export const assignPositions = (
  orderedIds: string[],
  existingPositions: Map<string, string>,
): Map<string, string> => {
  const current = orderedIds.map((id) => existingPositions.get(id) ?? null);
  const kept = longestIncreasingRun(current);
  const result = new Map<string, string>();

  let index = 0;
  while (index < orderedIds.length) {
    if (kept.has(index)) {
      result.set(orderedIds[index], current[index] as string);
      index += 1;
      continue;
    }

    const runStart = index;
    while (index < orderedIds.length && !kept.has(index)) index += 1;
    const before = runStart > 0 ? result.get(orderedIds[runStart - 1]) ?? null : null;
    const after = index < orderedIds.length ? (current[index] as string) : null;
    generatePositionsBetween(before, after, index - runStart).forEach((position, offset) => {
      result.set(orderedIds[runStart + offset], position);
    });
  }

  return result;
};

type ApplyListItemsInput = {
  listId: string;
  listItems: SavedListItem[];
  entries: ListEntry[];
  timestamp: string;
  ownerId?: string;
  userId?: string;
  createId: () => string;
};

// Returns the full entry array with the given list's entries replaced to match
// `listItems`. Unchanged entries keep their object identity and updatedAt.
export const applyListItemsToEntries = ({
  listId,
  listItems,
  entries,
  timestamp,
  ownerId,
  userId,
  createId,
}: ApplyListItemsInput): ListEntry[] => {
  const otherEntries = entries.filter((entry) => entry.listId !== listId);
  const existingById = new Map(entries.filter((entry) => entry.listId === listId).map((entry) => [entry.id, entry]));
  const takenIds = new Set(otherEntries.map((entry) => entry.id));
  const resolvedIds = new Set<string>();

  const resolved = listItems.map((listItem) => {
    let id = listItem.id;
    if (!id || takenIds.has(id) || resolvedIds.has(id)) id = createId();
    resolvedIds.add(id);
    return { id, listItem };
  });

  const positions = assignPositions(
    resolved.map(({ id }) => id),
    new Map([...existingById.values()].map((entry) => [entry.id, entry.position])),
  );

  const nextListEntries = resolved.map(({ id, listItem }) => {
    const existing = existingById.get(id);
    const kind = listItemKindFromSnapshot(listItem);
    const checked = kind === "check" && !!listItem.checked;
    const indentLevel = clampIndent(listItem.indentLevel);
    const bold = listItem.bold ? true : undefined;
    const position = positions.get(id) as string;

    if (existing) {
      const unchanged =
        existing.kind === kind &&
        existing.text === listItem.text &&
        existing.checked === checked &&
        existing.indentLevel === indentLevel &&
        !!existing.bold === !!bold &&
        existing.position === position;
      if (unchanged) return existing;

      return {
        ...existing,
        kind,
        text: listItem.text,
        checked,
        indentLevel,
        bold,
        position,
        completedAt: checked ? (existing.checked ? existing.completedAt : timestamp) : undefined,
        updatedAt: timestamp,
      };
    }

    const entry: ListEntry = {
      id,
      listId,
      kind,
      text: listItem.text,
      checked,
      indentLevel,
      ...(bold ? { bold } : {}),
      position,
      completedAt: checked ? timestamp : undefined,
      tagOptionIds: [],
      ownerId,
      createdBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return entry;
  });

  return [...otherEntries, ...nextListEntries];
};

export const MAX_ENTRY_INDENT = 5;

// ---------------------------------------------------------------------------
// Titles and previews
// ---------------------------------------------------------------------------

// A list always has a title on the server. One the person hasn't named yet
// carries this placeholder and is shown by its first line instead.
export const UNTITLED_LIST_TITLE = "Untitled list";

export const isUntitledList = (item: Pick<SavedItem, "title">): boolean => {
  const title = item.title.trim();
  return !title || title === UNTITLED_LIST_TITLE;
};

type LineText = Pick<SavedListItem, "text">;

const nonEmptyLines = (lines: LineText[] | undefined): string[] =>
  (lines ?? []).map((line) => line.text.trim()).filter((text) => text.length > 0);

export const listDisplayTitle = (item: Pick<SavedItem, "title">, lines?: LineText[]): string =>
  isUntitledList(item) ? nonEmptyLines(lines)[0] ?? "New list" : item.title.trim();

// The first few lines, for the row under a list's title. An untitled list
// already shows its first line as the title, so the preview starts after it.
export const listPreviewText = (item: Pick<SavedItem, "title">, lines?: LineText[], maxLines = 4): string =>
  nonEmptyLines(lines)
    .slice(isUntitledList(item) ? 1 : 0)
    .slice(0, maxLines)
    .join(", ");

// When each list last changed, counting edits to its lines, and the lists
// sorted with the most recently changed first.
export const listActivityTimes = (lists: SavedItem[], entries: ListEntry[]): Map<string, string> => {
  const times = new Map(lists.map((list) => [list.id, list.updatedAt]));
  entries.forEach((entry) => {
    const current = times.get(entry.listId);
    if (current !== undefined && Date.parse(entry.updatedAt) > Date.parse(current)) times.set(entry.listId, entry.updatedAt);
  });
  return times;
};

export const sortListsByActivity = (lists: SavedItem[], times: Map<string, string>): SavedItem[] =>
  [...lists].sort(
    (a, b) =>
      Date.parse(times.get(b.id) ?? b.updatedAt) - Date.parse(times.get(a.id) ?? a.updatedAt) ||
      comparePositions(a.id, b.id),
  );

export type PastedLine = { text: string; checked: boolean; indentLevel: number };

// Leading list markers people paste in from Notes, Reminders, messages or
// Markdown: bullets, numbers, and [ ] / [x] checkboxes.
const bulletMarker = /^(?:[-*+•◦▪‣–—]|\d{1,3}[.)])\s+/;
const checkboxMarker = /^(?:\[( |x|X)\]|([☐□])|([☑☒✓✔✅]))\s*/;

// Turns pasted text into list lines: one per non-blank row, markers removed,
// leading tabs or pairs of spaces as indents, and [x] lines already checked.
export const parsePastedLines = (raw: string): PastedLine[] =>
  raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((row) => {
      const leading = row.match(/^[ \t]*/)?.[0] ?? "";
      const width = [...leading].reduce((sum, char) => sum + (char === "\t" ? 2 : 1), 0);
      let text = row.slice(leading.length).trimEnd();
      let checked = false;
      text = text.replace(bulletMarker, "");
      const box = text.match(checkboxMarker);
      if (box) {
        checked = (!!box[1] && box[1].toLowerCase() === "x") || !!box[3];
        text = text.slice(box[0].length);
      }
      return { text: text.trim(), checked, indentLevel: Math.min(Math.floor(width / 2), MAX_ENTRY_INDENT) };
    })
    .filter((line) => line.text.length > 0);

// What a line's text box should do with new text that contains line breaks:
// either Return was pressed (split the line at the cursor, like a notes app,
// and always start a new line), or several lines were pasted (one new line
// per pasted row, markers cleaned off).
export const splitEnteredText = (
  previous: string,
  next: string,
): { keep: string; added: PastedLine[]; isPaste: boolean } => {
  const normalized = next.replace(/\r\n?/g, "\n");
  const [head, ...rest] = normalized.split("\n");
  const tail = rest.join("\n");
  const isPaste = rest.length > 1 || (!!tail.trim() && normalized.length - previous.length > 1);
  if (!isPaste) {
    return { keep: head, added: [{ text: tail.trim(), checked: false, indentLevel: 0 }], isPaste };
  }
  if (!previous.trim()) {
    const lines = parsePastedLines(normalized);
    return { keep: lines[0]?.text ?? "", added: lines.slice(1), isPaste };
  }
  return { keep: head, added: parsePastedLines(tail), isPaste };
};
