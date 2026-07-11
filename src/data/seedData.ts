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
  folder("food-cooking", "Cooking", "food", "🍳", "#F7C978"),
  folder("food-eating-out", "Eating Out", "food", "🍜", "#F0A66A"),
  folder("food-fast-food", "Fast Food", "food-eating-out", "🍔", "#EFA06A"),
  folder("food-sit-down", "Sit Down", "food-eating-out", "🍲", "#E7B07B"),
  folder("books", "Books", null, "📚", "#8AA8D8"),
  folder("books-read", "Read", "books", "✅", "#A9BCD8"),
  folder("books-reading", "Reading", "books", "📖", "#92A8D1"),
  folder("books-to-be-read", "To Be Read", "books", "🔖", "#7E9BC8"),
  folder("movies", "Movies", null, "🎬", "#A48AD8"),
  folder("movies-to-watch", "To Watch", "movies", "🍿", "#B399D8"),
  folder("movies-watched", "Watched", "movies", "✨", "#9E89C7"),
  folder("places", "Places", null, "📍", "#7EBEA6"),
  folder("places-travel", "Travel", "places", "✈️", "#7FB7AE"),
  folder("places-local", "Local", "places", "🌿", "#8AC9A7"),
  folder("things-to-buy", "Things To Buy", null, "🛍️", "#D98A8A", "A buffer for purchases before they turn into decisions."),
  folder("weekend-ideas", "Weekend Ideas", null, "☀️", "#E4C45E", "Low-pressure options for free Saturdays, loose plans, and local wandering."),
];

const item = (
  id: string,
  folderId: string,
  title: string,
  description: string,
  tags: string[],
  priority: SavedItem["priority"] = "medium",
): SavedItem => ({
  id,
  folderId,
  title,
  description,
  type: "text",
  tags,
  status: "waiting",
  priority,
  createdAt: now,
  updatedAt: now,
});

export const seedItems: SavedItem[] = [
  item("item-ramen", "food-sit-down", "Try the new ramen place downtown", "Look for a cozy dinner spot with good broth.", ["ramen", "restaurant", "dinner"], "high"),
  item("item-pizza", "food-cooking", "Make homemade pizza", "Try a slow-fermented dough and a cast iron pan.", ["recipe", "cooking", "weekend"]),
  item("item-atomic-habits", "books-to-be-read", "Read Atomic Habits", "Add to the next nonfiction reading batch.", ["book", "habits", "reading"], "high"),
  item("item-interstellar", "movies-to-watch", "Watch Interstellar", "Save for a night with time for a long movie.", ["movie", "sci-fi", "watch"]),
  item("item-lake", "places-local", "Visit a nearby lake", "Pack snacks and make it a low-key afternoon trip.", ["local", "nature", "weekend"]),
  item("item-backpack", "things-to-buy", "Buy a new backpack", "Find a durable everyday backpack with a laptop sleeve.", ["buy", "gear", "shopping"], "low"),
];

export const seedData: TroveData = {
  folders: seedFolders,
  items: seedItems,
};
