const SKIP_KEY = "yaq-notify-skip";

export function canAskNotifications(): boolean {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return false;
  if (Notification.permission === "denied") {
    return typeof window !== "undefined" && !window.isSecureContext;
  }
  return true;
}

export function skippedNotificationsThisSession(): boolean {
  try {
    return sessionStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

export function skipNotificationsThisSession(): void {
  try {
    sessionStorage.setItem(SKIP_KEY, "1");
  } catch {
    /* private mode */
  }
}

export async function askNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (typeof Notification === "undefined") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showQueueNotification(title: string, body: string): boolean {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission !== "granted") return false;
  try {
    new Notification(title, { body, tag: "yaq-turn" });
    return true;
  } catch {
    return false;
  }
}

export const TEST_NOTIFICATION_EVENT = "yaq-test-notification";

export function testNotificationCopy(): { title: string; body: string } {
  return {
    title: "Test notification",
    body: "Queue alerts will look like this on this device.",
  };
}

export async function sendTestNotification(): Promise<{
  os: boolean;
  permission: NotificationPermission | "unsupported";
}> {
  const permission = await askNotificationPermission();
  const copy = testNotificationCopy();
  const os = showQueueNotification(copy.title, copy.body);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(TEST_NOTIFICATION_EVENT, { detail: copy }),
    );
  }
  return { os, permission };
}
