// Expiry reminders: one notification when the app is opened and something on the shelf has
// expired or is about to, at most once a day. There is no server and no push: the app can only
// remind while it is being opened, and says so. Every storage access is guarded.

import { useSyncExternalStore } from "react";

const KEY = "food-analyzer:reminders:v1";

interface Stored {
  enabled: boolean;
  /** the day (YYYY-MM-DD) a reminder was last shown */
  last: string | null;
}

function read(): Stored {
  try {
    const x = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<Stored> | null;
    return { enabled: x?.enabled === true, last: typeof x?.last === "string" ? x.last : null };
  } catch {
    return { enabled: false, last: null };
  }
}

function write(value: Stored) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // storage unavailable: the choice lasts until the page is closed
  }
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((notify) => notify());

/** "unsupported": no Notification API. "blocked": the browser refuses. "on" / "off": the reader's choice. */
export type ReminderState = "unsupported" | "blocked" | "on" | "off";

const state = (): ReminderState =>
  !remindersSupported() ? "unsupported"
  : Notification.permission === "denied" ? "blocked"
  : read().enabled && Notification.permission === "granted" ? "on"
  : "off";

export function useReminderState(): ReminderState {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    state,
    () => "off",
  );
}

export const remindersSupported = () => typeof window !== "undefined" && "Notification" in window;
export const remindersEnabled = () => remindersSupported() && read().enabled && Notification.permission === "granted";

/** asks the browser for permission and turns reminders on; returns what the browser answered */
export async function enableReminders(): Promise<NotificationPermission> {
  if (!remindersSupported()) return "denied";
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  write({ ...read(), enabled: permission === "granted" });
  changed();
  return permission;
}

export const disableReminders = () => {
  write({ ...read(), enabled: false });
  changed();
};

const today = (now: Date) => `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

/** shows the reminder if they are on, something needs attention and today's hasn't been shown */
export async function remindIfDue(count: number, title: string, body: string, now = new Date()): Promise<boolean> {
  if (count <= 0 || !remindersEnabled()) return false;
  const stored = read();
  if (stored.last === today(now)) return false;
  write({ ...stored, last: today(now) });
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.showNotification(title, { body, tag: "expiry", icon: "/icons/icon-192.png" });
    else new Notification(title, { body, tag: "expiry", icon: "/icons/icon-192.png" });
    return true;
  } catch {
    return false;
  }
}
