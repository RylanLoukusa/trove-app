import type { ListEntry } from "../types/models";

export type StarterLine = Pick<ListEntry, "text"> & Partial<Pick<ListEntry, "kind" | "indentLevel" | "bold">>;
export type StarterTemplate = { id: string; title: string; summary: string; lines: StarterLine[] };

const heading = (text: string): StarterLine => ({ text, kind: "text", bold: true });
const item = (text: string): StarterLine => ({ text });

// Ready-made lists to start from. Each becomes an ordinary list the person
// can change however they like.
export const starterTemplates: StarterTemplate[] = [
  {
    id: "groceries",
    title: "Groceries",
    summary: "Sorted by where things are in the store",
    lines: [
      heading("Produce"),
      item("Bananas"),
      item("Salad greens"),
      item("Onions"),
      heading("Dairy and eggs"),
      item("Milk"),
      item("Eggs"),
      heading("Pantry"),
      item("Bread"),
      item("Pasta"),
      item("Coffee"),
      heading("Household"),
      item("Paper towels"),
    ],
  },
  {
    id: "packing",
    title: "Packing list",
    summary: "For a few days away",
    lines: [
      heading("Documents"),
      item("ID or passport"),
      item("Tickets and bookings"),
      heading("Clothes"),
      item("Tops"),
      item("Trousers"),
      item("Underwear and socks"),
      item("Jacket"),
      item("Shoes"),
      heading("Toiletries"),
      item("Toothbrush and toothpaste"),
      item("Medication"),
      heading("Tech"),
      item("Phone charger"),
      item("Headphones"),
    ],
  },
  {
    id: "chores",
    title: "Weekly chores",
    summary: "Uncheck all to start the week again",
    lines: [
      item("Laundry"),
      item("Vacuum"),
      item("Clean bathroom"),
      item("Take out trash and recycling"),
      item("Change bed sheets"),
      item("Water plants"),
      item("Plan meals for the week"),
    ],
  },
  {
    id: "trip",
    title: "Trip plan",
    summary: "Before you go, while you're there",
    lines: [
      heading("Before"),
      item("Book travel"),
      item("Book a place to stay"),
      item("Arrange pet or plant care"),
      item("Check passport and visas"),
      heading("To see and do"),
      { text: "Walk around the old town", kind: "bullet" },
      heading("Places to eat"),
      { text: "Ask a local for their favorite", kind: "bullet" },
    ],
  },
  {
    id: "party",
    title: "Party planning",
    summary: "Guests, food and the day itself",
    lines: [
      item("Pick a date and place"),
      item("Send invitations"),
      heading("Food and drink"),
      item("Plan the menu"),
      item("Order or bake a cake"),
      item("Buy drinks and ice"),
      heading("On the day"),
      item("Set up and decorate"),
      item("Music"),
    ],
  },
];
