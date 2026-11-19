import {
  formatPrice,
  formatQuantity,
  formatRating,
  isRating,
  linkHost,
  listTotal,
  normalizeLink,
  parsePrice,
  parseQuantity,
} from "./fields";

describe("line fields", () => {
  it("reads a quantity as typed", () => {
    expect(parseQuantity("2")).toBe(2);
    expect(parseQuantity(" 1.5 ")).toBe(1.5);
    expect(parseQuantity("2x")).toBe(2);
    expect(parseQuantity("x3")).toBe(3);
    expect(parseQuantity("1,5")).toBe(1.5);
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("a few")).toBeNull();
    expect(parseQuantity("")).toBeNull();
  });

  it("reads a price with or without a currency, in either decimal style", () => {
    expect(parsePrice("12")).toBe(12);
    expect(parsePrice("$12.50")).toBe(12.5);
    expect(parsePrice("12,50 €")).toBe(12.5);
    expect(parsePrice("1,299.99")).toBe(1299.99);
    expect(parsePrice("1.299,99")).toBe(1299.99);
    expect(parsePrice("1,299")).toBe(1299);
    expect(parsePrice("0")).toBe(0);
    expect(parsePrice("free")).toBeNull();
    expect(parsePrice("")).toBeNull();
  });

  it("takes whole ratings from one to five", () => {
    expect([0, 1, 3.5, 5, 6].map(isRating)).toEqual([false, true, false, true, false]);
    expect(formatRating(3)).toBe("★★★☆☆");
  });

  it("shows quantities as typed and prices with two decimals", () => {
    expect(formatQuantity(1.5)).toBe("1.5");
    expect(formatPrice(12.5)).toBe("12.50");
  });

  it("turns a typed web address into a link, and names its site", () => {
    expect(normalizeLink("example.com/a")).toBe("https://example.com/a");
    expect(normalizeLink("http://shop.example.com")).toBe("http://shop.example.com");
    expect(normalizeLink("not a link")).toBeNull();
    expect(normalizeLink("lamp")).toBeNull();
    expect(linkHost("https://www.example.com/a/b?c")).toBe("example.com");
  });

  it("adds up the priced lines, times how many of each", () => {
    expect(listTotal([{ price: 4, quantity: 3 }, { price: 1.25 }, {}])).toEqual({ total: 13.25, priced: 2 });
    expect(listTotal([{ quantity: 2 }])).toBeNull();
  });
});
