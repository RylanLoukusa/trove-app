import { Folder, SavedItem, TroveData } from "../types/models";

const now = "2026-05-15T00:00:00.000Z";

const folder = (id: string, name: string, parentFolderId: string | null, icon: string, color: string, purpose?: string): Folder => ({
  id,
  name,
  parentFolderId,
  icon,
  color,
  purpose,
  createdAt: now,
  updatedAt: now,
});

export const seedFolders: Folder[] = [
  folder("food", "Food", null, "🍽️", "#F3B562", "Places to eat, recipes to try, and food ideas worth keeping close."),
  folder("places", "Places", null, "📍", "#7EBEA6", "Spots worth visiting, nearby or far."),
  folder("places-local", "Nearby", "places", "🌿", "#8AC9A7", "Close-by spots you can get to without much planning."),
];

const item = (id: string, folderId: string, title: string, description: string): SavedItem => ({
  id,
  folderId,
  title,
  description,
  type: "text",
  tagOptionIds: [],
  createdAt: now,
  updatedAt: now,
});

export const seedItems: SavedItem[] = [
  item("item-ramen", "food", "Try the new ramen place downtown", "Look for a cozy dinner spot with good broth."),
  item("item-pizza", "food", "Make homemade pizza", "Try a slow-fermented dough and a cast iron pan."),
  item("item-bakery", "food", "Check out the new bakery downtown", "Everyone's been talking about their sourdough."),
  item("item-lake", "places", "Visit a nearby lake", "Pack snacks and make it a low-key afternoon trip."),
  item("item-coast", "places", "Take a weekend trip to the coast", "Look for a spot with tide pools to explore."),
];

export const seedData: TroveData = {
  folders: seedFolders,
  items: seedItems,
  tagGroups: [],
  tagOptions: [],
};
