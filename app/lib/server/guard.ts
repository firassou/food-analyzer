import "server-only";

/**
 * Cheap request guards shared by the API routes. None of them replaces authentication:
 * they keep a browser on another site, a spoofed header or an oversized body from burning
 * the AI credits behind these endpoints.
 */

/**
 * A browser always sends `Origin` on a cross-site POST. When it is present it must be this
 * site; a missing header (curl, server-to-server, same-origin GET) is let through.
 */
export function crossSite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return !host || new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/**
 * Reads a JSON-ish body of at most `max` bytes without trusting `Content-Length`
 * (a chunked body has none). Returns null when it is bigger.
 */
export async function readText(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
