import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedItem, TagGroup, TagOption } from "../types/models";

const tagBackfillDoneKey = (userKey: string) => `trove:tagBackfillDone:${userKey}`;

export const isTagBackfillDone = async (userKey: string): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(tagBackfillDoneKey(userKey))) === "true";
  } catch {
    return false;
  }
};

export const markTagBackfillDone = async (userKey: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(tagBackfillDoneKey(userKey), "true");
  } catch (error) {
    console.warn("Failed to persist tag backfill flag", error);
  }
};

const STATUS_OPTIONS = [
  { name: "Waiting", color: "#F3B562" },
  { name: "Planned", color: "#8AA8D8" },
  { name: "Done", color: "#8AC9A7" },
  { name: "Skipped", color: "#D8C7AA" },
];
const PRIORITY_OPTIONS = [
  { name: "Low", color: "#8AC9A7" },
  { name: "Medium", color: "#F0A66A" },
  { name: "High", color: "#D98A8A" },
];

type LegacyItemFields = {
  tags: string[];
  status: string;
  priority: string;
};

// Older item shapes carried free-text `tags`/enum `status`/`priority` fields that no
// longer exist on SavedItem. A plain object loaded straight from AsyncStorage JSON
// still has them as untyped extra keys at runtime even though TypeScript no longer
// tracks them, so this reads them back for the one-time local backfill.
const readLegacyFieldsFromLocalItem = (item: SavedItem): LegacyItemFields => {
  const raw = item as SavedItem & Partial<LegacyItemFields>;
  return {
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
    status: typeof raw.status === "string" ? raw.status : "waiting",
    priority: typeof raw.priority === "string" ? raw.priority : "medium",
  };
};

// For a signed-in account, the local cache may already have been overwritten by a
// remote pull under the new mapping (which repurposes the `tags` column and drops
// status/priority entirely). Fetching the raw columns directly is the only reliable
// source in that case. Safe to call at any time this account has never had tag
// groups, since that means nothing has pushed under the new scheme yet.
export const fetchLegacyItemFieldsForUser = async (
  supabase: SupabaseClient,
): Promise<Map<string, LegacyItemFields>> => {
  const { data, error } = await supabase.from("trove_items").select("id, tags, status, priority");
  if (error || !data) return new Map();

  const result = new Map<string, LegacyItemFields>();
  for (const row of data as Array<{ id: string; tags: unknown; status: unknown; priority: unknown }>) {
    result.set(row.id, {
      tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
      status: typeof row.status === "string" ? row.status : "waiting",
      priority: typeof row.priority === "string" ? row.priority : "medium",
    });
  }
  return result;
};

export type SeededTagTaxonomy = {
  statusOptionIdByName: Map<string, string>;
  priorityOptionIdByName: Map<string, string>;
};

type CreateTagGroup = (
  input: Pick<TagGroup, "name"> & Partial<Pick<TagGroup, "selectionMode" | "allowInlineCreate" | "isSystem" | "sortOrder">>,
) => TagGroup;
type CreateTagOption = (input: Pick<TagOption, "groupId" | "name"> & Partial<Pick<TagOption, "color" | "sortOrder">>) => TagOption;

const lowerCaseKey = (name: string): string => name.trim().toLowerCase();

// Creates the two starter groups (Status, Priority) with isSystem: true — a cosmetic
// "this was a default" marker only, never a delete-guard, since nothing in the app
// depends on any specific group or option existing anymore.
export const seedDefaultTagGroups = (createTagGroup: CreateTagGroup, createTagOption: CreateTagOption): SeededTagTaxonomy => {
  const statusGroup = createTagGroup({ name: "Status", selectionMode: "single", allowInlineCreate: true, isSystem: true, sortOrder: 0 });
  const statusOptionIdByName = new Map(
    STATUS_OPTIONS.map(({ name, color }, index) => [
      lowerCaseKey(name),
      createTagOption({ groupId: statusGroup.id, name, color, sortOrder: index }).id,
    ]),
  );

  const priorityGroup = createTagGroup({ name: "Priority", selectionMode: "single", allowInlineCreate: true, isSystem: true, sortOrder: 1 });
  const priorityOptionIdByName = new Map(
    PRIORITY_OPTIONS.map(({ name, color }, index) => [
      lowerCaseKey(name),
      createTagOption({ groupId: priorityGroup.id, name, color, sortOrder: index }).id,
    ]),
  );

  return { statusOptionIdByName, priorityOptionIdByName };
};

// Resolves one item's legacy status/priority into tag-option ids against the seeded
// taxonomy. Legacy free-text tags have no group to attach to anymore and are dropped.
export const resolveLegacyItemTagOptionIds = (legacy: LegacyItemFields, seeded: SeededTagTaxonomy): string[] => {
  const resolvedIds = new Set<string>();

  const statusOptionId = seeded.statusOptionIdByName.get(lowerCaseKey(legacy.status));
  if (statusOptionId) resolvedIds.add(statusOptionId);

  const priorityOptionId = seeded.priorityOptionIdByName.get(lowerCaseKey(legacy.priority));
  if (priorityOptionId) resolvedIds.add(priorityOptionId);

  return Array.from(resolvedIds);
};

export { readLegacyFieldsFromLocalItem };
export type { LegacyItemFields };
