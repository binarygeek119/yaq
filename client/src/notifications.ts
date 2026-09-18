const SKIP_KEY = "yaq-notify-skip";

export function notificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export function canAskNotifications(): boolean {
  const permission = notificationPermission();
  if (permission === "unsupported" || permission === "granted") return false;
  if (permission === "denied") {
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

export function httpsLanOrigin(
  urls: string[] | undefined | null,
): string | undefined {
  for (const raw of urls ?? []) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:") return url.origin;
    } catch {
      continue;
    }
  }
  return undefined;
}

export function toHttpsPageUrl(
  httpsOrigin: string,
  loc: Pick<Location, "pathname" | "search" | "hash">,
): string {
  return `${httpsOrigin.replace(/\/$/, "")}${loc.pathname}${loc.search}${loc.hash}`;
}

export function testNotifyStatus(result: {
  os: boolean;
  permission: NotificationPermission | "unsupported";
  secureContext: boolean;
  httpsUrl?: string;
}): string {
  if (result.os) return "Test notification sent.";
  if (!result.secureContext) {
    const dest = result.httpsUrl
      ? result.httpsUrl
      : "the HTTPS LAN URL (port 3443)";
    return `Open ${dest} for system notifications. Chrome blocks them on plain HTTP. In-app test alert is shown.`;
  }
  if (result.permission === "denied" || result.permission === "unsupported") {
    return "Browser blocked system notifications. Reset the permission for this site, then try again. In-app test alert is shown.";
  }
  return "In-app test alert shown. Allow notifications for the system popup.";
}

export async function askNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (typeof Notification === "undefined") return "unsupported";
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return Notification.permission;
  }
  try {
    const result = Notification.requestPermission();
    if (typeof result === "string") return result;
    return await result;
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
