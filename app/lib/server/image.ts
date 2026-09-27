import "server-only";
import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const TOO_LARGE_MESSAGE = `The image is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Please use a smaller photo.`;
/** longest side sent to the model: plenty for label text, small enough for every provider */
const MAX_SIDE = 1600;
const MAX_INPUT_PIXELS = 80_000_000;
/** undecodable uploads are forwarded as-is only when small enough for every provider */
const MAX_PASSTHROUGH_BYTES = 4 * 1024 * 1024;

export type ImageFormat = "jpeg" | "png" | "webp" | "gif" | "heic" | "avif" | "bmp" | "tiff";

/** identifies the format from magic bytes; the client-declared MIME type is not trusted */
export function sniffImage(b: Uint8Array): ImageFormat | null {
  if (b.length < 12) return null;
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(0, 4) === "GIF8") return "gif";
  if (ascii(0, 2) === "BM") return "bmp";
  if (ascii(0, 4) === "II*\0" || ascii(0, 4) === "MM\0*") return "tiff";
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (/^(avif|avis)$/.test(brand)) return "avif";
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return "heic";
  }
  return null;
}

export class ImageError extends Error {
  constructor(
    message: string,
    public code: "unsupported_image" | "too_large",
  ) {
    super(message);
  }
}

/**
 * Normalizes any supported upload into a JPEG data URL: honours EXIF rotation,
 * flattens transparency onto white, downsizes large photos and boosts contrast
 * slightly, which helps OCR on dim or washed-out shots.
 */
export async function prepareImage(bytes: Uint8Array): Promise<{ dataUrl: string; width: number; height: number }> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ImageError(TOO_LARGE_MESSAGE, "too_large");
  }
  const format = sniffImage(bytes);
  if (!format) {
    throw new ImageError(
      "This file isn't a supported image. Please upload a JPEG, PNG, WebP or GIF photo.",
      "unsupported_image",
    );
  }

  // the header alone says whether decoding would exceed the pixel limit
  const { width = 0, height = 0 } = await sharp(bytes, { limitInputPixels: false }).metadata().catch(() => ({ width: 0, height: 0 }));
  if (width * height > MAX_INPUT_PIXELS) {
    throw new ImageError("This photo's resolution is too high. Please use a smaller photo.", "too_large");
  }

  try {
    const { data, info } = await sharp(bytes, { failOn: "none", animated: false, limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .normalise({ lower: 1, upper: 99 })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { dataUrl: `data:image/jpeg;base64,${data.toString("base64")}`, width: info.width, height: info.height };
  } catch (error) {
    // e.g. a slightly damaged file sharp won't decode: send formats every provider accepts as-is
    if ((format === "jpeg" || format === "png" || format === "webp") && bytes.byteLength <= MAX_PASSTHROUGH_BYTES) {
      return {
        dataUrl: `data:image/${format};base64,${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64")}`,
        width: 0,
        height: 0,
      };
    }
    console.warn("[analyze] image decode failed:", error);
    throw new ImageError(
      format === "heic"
        ? "HEIC photos aren't supported here. Please export the photo as JPEG and try again."
        : "This image couldn't be read. Please try another photo.",
      "unsupported_image",
    );
  }
}
