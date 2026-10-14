import { describe, expect, it } from "vitest";
import { systemPrompt } from "./prompt";

describe("systemPrompt", () => {
  it("tells the model a photo from Medicine Mode is probably a medicine, and nothing otherwise", () => {
    expect(systemPrompt("en", "medicine")).toMatch(/took this photo in Medicine Mode: it is most likely a medicine .* If it clearly shows something else, say what it really is/);
    expect(systemPrompt("en")).not.toMatch(/Medicine Mode/);
  });

  it("walks through the pen marks before giving a dose, and sets prices aside", () => {
    const p = systemPrompt("ar");
    expect(p).toMatch(/Set aside what is not a dose: a price/);
    expect(p).toMatch(/"seen": \[\{"what": string, "where": string, "length": "long"\|"short"\}\]/);
  });
});
