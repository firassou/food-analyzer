import { NextResponse, type NextRequest } from "next/server";

/**
 * A fresh nonce for every page request, so only the scripts Next itself renders can run:
 * an injected `<script>` has no nonce and is refused, and 'strict-dynamic' lets those
 * trusted scripts load their chunks. Pages are rendered per request (the layout reads
 * cookies), which nonces need. See node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md
 *
 * Styles keep 'unsafe-inline': React sets `style` attributes all over, and a nonce can't
 * cover those. A style can't run code, so that is the smaller risk.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // pages only: the API answers JSON, and static files carry no markup
  matcher: [{ source: "/((?!api|_next/static|_next/image|icons|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|sw.js).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }],
};
