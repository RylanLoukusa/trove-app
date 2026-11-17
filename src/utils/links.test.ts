import { extractLinks } from "./links";

describe("extractLinks", () => {
  it("finds web links and names each by its site", () => {
    expect(extractLinks("Book https://www.example.com/rooms?x=1 and see www.trains.co.uk.")).toEqual([
      { url: "https://www.example.com/rooms?x=1", label: "example.com" },
      { url: "https://www.trains.co.uk", label: "trains.co.uk" },
    ]);
  });

  it("leaves the punctuation around a link out of it", () => {
    expect(extractLinks("(see http://example.com/a, then stop!)").map((link) => link.url)).toEqual(["http://example.com/a"]);
    expect(extractLinks("https://en.wikipedia.org/wiki/Rust_(game)").map((link) => link.url)).toEqual([
      "https://en.wikipedia.org/wiki/Rust_(game)",
    ]);
  });

  it("tells two links to the same site apart by their path", () => {
    expect(extractLinks("https://a.com/one https://a.com/two").map((link) => link.label)).toEqual(["a.com/one", "a.com/two"]);
  });

  it("lists a repeated link once, and at most three", () => {
    expect(extractLinks("https://a.com https://a.com")).toHaveLength(1);
    expect(extractLinks("https://a.com https://b.com https://c.com https://d.com")).toHaveLength(3);
  });

  it("finds nothing in ordinary text", () => {
    expect(extractLinks("Buy milk. Call mum at 3.30pm, e.g. tomorrow")).toEqual([]);
    expect(extractLinks("http://localhost")).toEqual([]);
  });
});
