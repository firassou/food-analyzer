// Runs in the browser: turns whatever photo the user picked into a reasonably
// sized, correctly rotated JPEG before upload. Big phone photos (often 5–15 MB)
// become ~300–800 KB, which makes uploads fast and avoids provider size limits.

const MAX_INPUT_BYTES = 40 * 1024 * 1024;
const MAX_SIDE = 2000;

export interface PreparedImage {
  blob: Blob;
  previewUrl: string;
}

export class ImagePrepError extends Error {}

const looksLikeImage = (file: File) =>
  file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?)$/i.test(file.name);

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!looksLikeImage(file)) {
    throw new ImagePrepError("That file isn't an image. Please choose a photo of a food label.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImagePrepError("That photo is too large (over 40 MB). Please choose a smaller one.");
  }

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.fillStyle = "#fff"; // transparent PNGs would otherwise turn black
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("encoding failed");
    return { blob, previewUrl: URL.createObjectURL(blob) };
  } catch {
    // every browser decodes JPEG/PNG/WebP/GIF, so a failure means a damaged file or an unsupported format
    throw new ImagePrepError(
      /\.(heic|heif)$/i.test(file.name) || /hei[cf]/i.test(file.type)
        ? "This browser can't open HEIC photos. Please export it as JPEG (or take a screenshot) and try again."
        : "This image couldn't be opened. It may be damaged. Please try another photo.",
    );
  }
}
