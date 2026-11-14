import { lineImageFrame, nextLineImageSize } from "./LineImages";
import { LINE_HEIGHT } from "./ListMarks";

const wide = { width: 400, height: 300 };
const tall = { width: 300, height: 900 };

describe("photo sizes on a line", () => {
  it("goes thumbnail, bigger, as wide as the line, and back", () => {
    expect(nextLineImageSize("thumb")).toBe("medium");
    expect(nextLineImageSize("medium")).toBe("large");
    expect(nextLineImageSize("large")).toBe("thumb");
  });

  it("starts as a square the height of the text", () => {
    expect(lineImageFrame(wide, "thumb", 330)).toEqual({ width: LINE_HEIGHT, height: LINE_HEIGHT });
    expect(lineImageFrame(tall, "thumb", 330)).toEqual({ width: LINE_HEIGHT, height: LINE_HEIGHT });
  });

  it("grows keeping its shape, then fills the width of the line", () => {
    expect(lineImageFrame(wide, "medium", 330)).toEqual({ width: 200, height: 150 });
    expect(lineImageFrame(wide, "large", 330)).toEqual({ width: 330, height: 248 });
  });

  it("never gets wider than the line or too tall to see at once", () => {
    const panorama = { width: 3000, height: 500 };
    expect(lineImageFrame(panorama, "medium", 330)).toEqual({ width: 330, height: 55 });
    expect(lineImageFrame(tall, "large", 330)).toEqual({ width: 173, height: 520 });
  });

  it("treats a photo with no size as square", () => {
    expect(lineImageFrame({ width: 0, height: 0 }, "medium", 330)).toEqual({ width: 150, height: 150 });
  });
});
