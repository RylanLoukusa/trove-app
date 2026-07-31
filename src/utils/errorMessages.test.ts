import { friendlyErrorMessage, isNetworkErrorMessage } from "./errorMessages";

describe("isNetworkErrorMessage", () => {
  it("recognizes common network failure phrasings", () => {
    expect(isNetworkErrorMessage("Network request failed")).toBe(true);
    expect(isNetworkErrorMessage("TypeError: Failed to fetch")).toBe(true);
    expect(isNetworkErrorMessage("The Internet connection appears to be offline.")).toBe(true);
  });

  it("does not flag unrelated errors", () => {
    expect(isNetworkErrorMessage("Invalid login credentials")).toBe(false);
    expect(isNetworkErrorMessage("Row level security violation")).toBe(false);
  });
});

describe("friendlyErrorMessage", () => {
  it("replaces network-shaped messages with a friendly one", () => {
    expect(friendlyErrorMessage("Network request failed")).toBe(
      "You're offline. Check your connection and try again.",
    );
  });

  it("passes through non-network messages unchanged", () => {
    expect(friendlyErrorMessage("Invalid login credentials")).toBe("Invalid login credentials");
  });

  it("falls back when there is no message", () => {
    expect(friendlyErrorMessage(undefined, "Could not save.")).toBe("Could not save.");
    expect(friendlyErrorMessage("   ", "Could not save.")).toBe("Could not save.");
  });

  it("uses the default fallback when none is provided", () => {
    expect(friendlyErrorMessage(null)).toBe("Something went wrong. Please try again.");
  });
});
