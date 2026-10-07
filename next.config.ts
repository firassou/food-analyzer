import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

const dev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  // the version shown in the app is the one in package.json (see CHANGELOG.md)
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // the camera is the app's whole point; nothing else on the device is needed
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
        ],
      },
      {
        // the worker is always fetched fresh, and can only load its own files
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
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
