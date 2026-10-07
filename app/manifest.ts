import type { MetadataRoute } from "next";

// Makes the app installable on a phone's home screen. There is no service worker:
// it opens like an app, but analyzing a photo still needs a connection.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Food Analyzer",
    short_name: "Food Analyzer",
    description: "Decode food labels: allergens, additives and nutrition at a glance.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f7fa",
    theme_color: "#f5f7fa",
    categories: ["food", "health"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
