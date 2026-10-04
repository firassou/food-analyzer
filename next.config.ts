import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

const nextConfig: NextConfig = {
  // the version shown in the app is the one in package.json (see CHANGELOG.md)
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
};

export default nextConfig;
