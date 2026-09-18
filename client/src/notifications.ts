const SKIP_KEY = "yaq-notify-skip";

export function canAskNotifications(): boolean {
  return (
    typeof Notification !== "undefined" && Notification.permission === "default"
  );
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
