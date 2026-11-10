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
});

// Items as the UI sees them: list items carry their entries as `listItems`.
export const hydrateItemsWithEntries = (items: SavedItem[], entries: ListEntry[]): SavedItem[] => {
  const byList = groupEntriesByList(entries);
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
    const kind: ListEntry["kind"] = listItem?.kind === "bullet" ? "bullet" : "check";
    entries.push({
      id,
      listId: item.id,
      kind,
      text: typeof listItem?.text === "string" ? listItem.text : "",
      checked: kind === "check" && !!listItem?.checked,
      indentLevel: clampIndent(listItem?.indentLevel),
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
    const kind: ListEntry["kind"] = listItem.kind === "bullet" ? "bullet" : "check";
    const checked = kind === "check" && !!listItem.checked;
    const indentLevel = clampIndent(listItem.indentLevel);
    const position = positions.get(id) as string;

    if (existing) {
      const unchanged =
        existing.kind === kind &&
        existing.text === listItem.text &&
        existing.checked === checked &&
        existing.indentLevel === indentLevel &&
        existing.position === position;
      if (unchanged) return existing;

      return {
        ...existing,
        kind,
        text: listItem.text,
        checked,
        indentLevel,
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
