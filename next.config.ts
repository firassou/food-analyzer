import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

const dev = process.env.NODE_ENV !== "production";

// Everything the app loads comes from its own origin (fonts are self-hosted by next/font),
// and it only talks to its own API: the product databases are queried server-side.
// Next's own bootstrap scripts are inline, so script-src needs 'unsafe-inline' without a
// per-request nonce (see node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md);
// the rest of the policy still shuts off framing, plugins, foreign connections and base-tag tricks.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
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

const nextConfig: NextConfig = {
  // the version shown in the app is the one in package.json (see CHANGELOG.md)
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // the camera is the app's whole point; nothing else on the device is needed
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
        ],
      },
      {
        // answers hold a person's scan: never kept by a shared cache
        source: "/api/(.*)",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
