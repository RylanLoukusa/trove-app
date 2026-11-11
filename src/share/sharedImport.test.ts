import { lineFromSharedImport, SHARED_INBOX_TITLE } from "./sharedImport";

describe("lineFromSharedImport", () => {
  it("puts a shared page's title and link on one line", () => {
    expect(lineFromSharedImport({ title: "Best pizza dough", sourceUrl: "https://example.com/dough" })).toBe(
      "Best pizza dough https://example.com/dough",
    );
  });

  it("uses the shared words when there is no title", () => {
    expect(lineFromSharedImport({ sharedText: "Pick up dry cleaning" })).toBe("Pick up dry cleaning");
    expect(lineFromSharedImport({ title: "  ", sharedText: "Pick up dry cleaning" })).toBe("Pick up dry cleaning");
  });

  it("prefers the title over the longer shared text", () => {
    expect(lineFromSharedImport({ title: "Dough", sharedText: "A very long description of dough" })).toBe("Dough");
  });

  it("doesn't repeat a link the words already contain", () => {
    expect(
      lineFromSharedImport({ sharedText: "Look at this https://example.com/dough", sourceUrl: "https://example.com/dough" }),
    ).toBe("Look at this https://example.com/dough");
  });

  it("keeps just the link when nothing else was shared", () => {
    expect(lineFromSharedImport({ sourceUrl: " https://example.com/dough " })).toBe("https://example.com/dough");
  });

  it("flattens line breaks and extra spaces so the share stays one line", () => {
    expect(lineFromSharedImport({ sharedText: "Milk\n\nEggs\t and   bread\r\n" })).toBe("Milk Eggs and bread");
  });

  it("gives nothing for a share with no words or link, such as only photos", () => {
    expect(lineFromSharedImport({})).toBe("");
    expect(lineFromSharedImport({ title: " ", sharedText: "\n", sourceUrl: "" })).toBe("");
  });

  it("cuts a very long share down to a line's length", () => {
    const line = lineFromSharedImport({ sharedText: "word ".repeat(400) });
    expect(line.length).toBeLessThanOrEqual(500);
    expect(line.endsWith(" ")).toBe(false);
  });

  it("collects shares on a list called Inbox", () => {
    expect(SHARED_INBOX_TITLE).toBe("Inbox");
  });
});
