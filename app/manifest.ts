import type { MetadataRoute } from "next";

// Makes the app installable on a phone's home screen. There is no service worker:
// it opens like an app, but analyzing a photo still needs a connection.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LabelSight",
    short_name: "LabelSight",
    description: "Understand food labels and medicine boxes: what fits your body, what to watch for.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f4ee",
    theme_color: "#f7f4ee",
    categories: ["food", "health"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
