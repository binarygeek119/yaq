import { useEffect, useState } from "react";
import { api, type PublicState } from "./api";
import {
  askNotificationPermission,
  canAskNotifications,
  httpsLanOrigin,
  skipNotificationsThisSession,
  skippedNotificationsThisSession,
  toHttpsPageUrl,
} from "./notifications";

export function NotificationPrompt() {
  const [visible, setVisible] = useState(
    () => canAskNotifications() && !skippedNotificationsThisSession(),
  );
  const [busy, setBusy] = useState(false);
  const [httpsOrigin, setHttpsOrigin] = useState<string | undefined>();
  const insecure =
    typeof window !== "undefined" && !window.isSecureContext;
  const httpsHref =
    httpsOrigin && typeof window !== "undefined"
      ? toHttpsPageUrl(httpsOrigin, window.location)
      : undefined;

  useEffect(() => {
    if (!visible || !insecure) return;
    let cancelled = false;
    void api<PublicState>("/api/state")
      .then((state) => {
        if (!cancelled) setHttpsOrigin(httpsLanOrigin(state.lanUrls));
      })
      .catch(() => {
        /* stay on HTTP copy */
      });
    return () => {
      cancelled = true;
    };
  }, [visible, insecure]);

  if (!visible) return null;

  const hide = () => setVisible(false);

  return (
    <div className="notify-prompt" role="dialog" aria-label="Notifications">
      {insecure ? (
        <p>
          Chrome blocks system notifications on HTTP. Open HTTPS (accept the
          certificate warning) so this phone can get YAQ alerts.
        </p>
      ) : (
        <p>Allow notifications so this phone can get YAQ alerts.</p>
      )}
      <div className="notify-prompt-actions">
        {insecure ? (
          <a
            className="primary"
            href={httpsHref || "#"}
            aria-disabled={!httpsHref}
            onClick={(event) => {
              if (!httpsHref) event.preventDefault();
            }}
          >
            Open HTTPS
          </a>
        ) : (
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => {
              const pending = askNotificationPermission();
              setBusy(true);
              void pending.then((permission) => {
                setBusy(false);
                if (permission === "default") return;
                skipNotificationsThisSession();
                hide();
              });
            }}
          >
            Allow
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            skipNotificationsThisSession();
            hide();
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
