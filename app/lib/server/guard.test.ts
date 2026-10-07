import { describe, expect, it } from "vitest";
import { crossSite, readText } from "./guard";
import { clientKey } from "./rateLimit";

const req = (headers: Record<string, string>, body?: string) =>
  new Request("http://localhost:3000/api/ask", { method: "POST", headers, body });

describe("crossSite", () => {
  it("lets through a request with no Origin (curl, same-origin GET) and the app's own origin", () => {
    expect(crossSite(req({ host: "app.test" }))).toBe(false);
    expect(crossSite(req({ host: "app.test", origin: "https://app.test" }))).toBe(false);
    expect(crossSite(req({ "x-forwarded-host": "app.test", host: "internal:3000", origin: "https://app.test" }))).toBe(false);
  });
  it("refuses another site's page and a garbled Origin", () => {
    expect(crossSite(req({ host: "app.test", origin: "https://evil.example" }))).toBe(true);
    expect(crossSite(req({ host: "app.test", origin: "not a url" }))).toBe(true);
    expect(crossSite(req({ origin: "https://app.test" }))).toBe(true);
  });
});

describe("readText", () => {
  it("reads a body within the limit", async () => {
    expect(await readText(req({}, "hello"), 10)).toBe("hello");
  });
  it("refuses a body over the limit, whatever Content-Length says", async () => {
    expect(await readText(req({}, "x".repeat(50)), 10)).toBeNull();
    expect(await readText(req({ "content-length": "5000" }, "x"), 10)).toBeNull();
  });
});

describe("clientKey", () => {
  it("trusts what the platform sets over what a client can write", () => {
    expect(clientKey(req({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "6.6.6.6, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientKey(req({ "x-real-ip": "3.3.3.3", "x-forwarded-for": "6.6.6.6" }))).toBe("3.3.3.3");
  });
  it("falls back to the last hop, never the first one a client can forge", () => {
    expect(clientKey(req({ "x-forwarded-for": "6.6.6.6, 7.7.7.7, 2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientKey(req({}))).toBe("local");
  });
});
