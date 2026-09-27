import { crc32 } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ImageError, MAX_UPLOAD_BYTES, prepareImage, sniffImage } from "./image";
import { classify, StallError } from "./models";
import { MemoryRateLimiter } from "./rateLimit";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const pad = (b: Uint8Array) => {
  const out = new Uint8Array(16);
  out.set(b);
  return out;
};

describe("sniffImage", () => {
  it("detects formats from magic bytes", () => {
    expect(sniffImage(pad(bytes([0xff, 0xd8, 0xff])))).toBe("jpeg");
    expect(sniffImage(pad(bytes([0x89], "PNG")))).toBe("png");
    expect(sniffImage(pad(bytes("RIFF", [0, 0, 0, 0], "WEBP")))).toBe("webp");
    expect(sniffImage(pad(bytes("GIF89a")))).toBe("gif");
    expect(sniffImage(pad(bytes("BM")))).toBe("bmp");
    expect(sniffImage(pad(bytes("II*\0")))).toBe("tiff");
    expect(sniffImage(pad(bytes([0, 0, 0, 0x18], "ftypheic")))).toBe("heic");
    expect(sniffImage(pad(bytes([0, 0, 0, 0x18], "ftypavif")))).toBe("avif");
  });

  it("rejects non-images and short input whatever the client claims", () => {
    expect(sniffImage(pad(bytes("%PDF-1.7")))).toBeNull();
    expect(sniffImage(pad(bytes([0, 0, 0, 0x18], "ftypmp42")))).toBeNull();
    expect(sniffImage(bytes([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

describe("prepareImage", () => {
  it("re-encodes to a JPEG data URL no larger than 1600 px", async () => {
    const png = await sharp({ create: { width: 3200, height: 800, channels: 4, background: "#0000" } })
      .png()
      .toBuffer();
    const out = await prepareImage(new Uint8Array(png));
    expect(out.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect([out.width, out.height]).toEqual([1600, 400]);
  });

  it("throws friendly errors for unsupported and oversized input", async () => {
    await expect(prepareImage(pad(bytes("%PDF-1.7")))).rejects.toMatchObject({ code: "unsupported_image" });
    await expect(prepareImage(new Uint8Array(MAX_UPLOAD_BYTES + 1))).rejects.toBeInstanceOf(ImageError);
  });

  it("rejects a pixel bomb as too large instead of forwarding it", async () => {
    const png = Buffer.from(
      await sharp({ create: { width: 1, height: 1, channels: 3, background: "#fff" } }).png().toBuffer(),
    );
    // claim 20000 x 20000 px in the IHDR chunk and fix its CRC
    png.writeUInt32BE(20_000, 16);
    png.writeUInt32BE(20_000, 20);
    png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);
    await expect(prepareImage(new Uint8Array(png))).rejects.toMatchObject({ code: "too_large" });
  });

  it("falls back to the original bytes when a JPEG can't be decoded", async () => {
    const broken = pad(bytes([0xff, 0xd8, 0xff, 0xe0]));
    const out = await prepareImage(broken);
    expect(out.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });
});

describe("classify", () => {
  it("maps watchdog stalls to timeout and aborts to aborted", () => {
    expect(classify(new StallError("first_token", 1000))).toBe("timeout");
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(classify(abort)).toBe("aborted");
    expect(classify("weird")).toBe("unavailable");
  });
});

describe("MemoryRateLimiter", () => {
  it("allows up to the limit per key, then blocks", async () => {
    const limiter = new MemoryRateLimiter(2, 60_000);
    expect(await limiter.hit("a")).toBe(false);
    expect(await limiter.hit("a")).toBe(false);
    expect(await limiter.hit("a")).toBe(true);
    expect(await limiter.hit("b")).toBe(false);
  });

  it("evicts the least recently seen keys instead of resetting everyone", async () => {
    const limiter = new MemoryRateLimiter(1, 60_000, 2);
    await limiter.hit("heavy");
    await limiter.hit("a");
    expect(await limiter.hit("heavy")).toBe(true); // over the limit, and now the most recent key
    await limiter.hit("b"); // map full: evicts "a", not "heavy"
    expect(await limiter.hit("heavy")).toBe(true);
    expect(await limiter.hit("a")).toBe(false);
  });
});
