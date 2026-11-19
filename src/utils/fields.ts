// Light fields a line can have, so a list can track a collection or a
// shopping run without becoming a database: how many, what it costs, a
// rating out of five, and a link. Each one is optional.

export const MAX_RATING = 5;

const round2 = (value: number): number => Math.round(value * 100) / 100;

// "2", "1.5", "2x", "x3" -> a number above zero, or null.
export const parseQuantity = (input: string): number | null => {
  const cleaned = input.trim().toLowerCase().replace(/^x\s*|\s*x$/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = round2(Number(cleaned));
  return value > 0 && value < 1_000_000 ? value : null;
};

// "$12.50", "12,50 €", "1,299.99", "1.299,99", "12" -> a number, or null.
export const parsePrice = (input: string): number | null => {
  let cleaned = input.trim().replace(/[^\d.,]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  // Whichever mark comes last with one or two digits after it is the
  // decimal point; the other is a thousands separator.
  const decimalMark = lastComma > lastDot ? "," : ".";
  const decimals = cleaned.length - Math.max(lastComma, lastDot) - 1;
  if (Math.max(lastComma, lastDot) >= 0 && decimals >= 1 && decimals <= 2) {
    const thousands = decimalMark === "," ? /\./g : /,/g;
    cleaned = cleaned.replace(thousands, "").replace(decimalMark, ".");
  } else {
    cleaned = cleaned.replace(/[.,]/g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = round2(Number(cleaned));
  return Number.isFinite(value) && value < 100_000_000 ? value : null;
};

export const isQuantity = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export const isPrice = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export const isRating = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_RATING;

// Quantities show as typed: 2, 1.5.
export const formatQuantity = (value: number): string => String(round2(value));

// Prices show with two decimals in the phone's own style (12.50 or 12,50).
// Trove keeps no currency, so none is shown.
export const formatPrice = (value: number): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatRating = (value: number): string => "★".repeat(value) + "☆".repeat(MAX_RATING - value);

// A link as typed: "example.com/x" becomes "https://example.com/x". Null
// when it doesn't look like a web address.
export const normalizeLink = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return /^https?:\/\/[^/?#\s]+\.[^/?#\s]{2,}/i.test(url) ? url : null;
};

// "https://www.example.com/a/b" -> "example.com".
export const linkHost = (url: string): string =>
  url.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].replace(/^www\./i, "");

// What the priced lines come to: each price times its quantity (one when
// there's none). Null when no line has a price.
export const listTotal = (
  lines: Array<{ price?: number; quantity?: number }>,
): { total: number; priced: number } | null => {
  const priced = lines.filter((line) => isPrice(line.price));
  if (priced.length === 0) return null;
  const total = priced.reduce((sum, line) => sum + line.price! * (isQuantity(line.quantity) ? line.quantity : 1), 0);
  return { total: round2(total), priced: priced.length };
};
