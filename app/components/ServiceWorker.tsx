"use client";
import { useEffect } from "react";

/** registers the offline shell (`public/sw.js`); only in a production build, where it can't get in the way of hot reload */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // no offline shell: the app works the same online
    });
  }, []);
  return null;
}
