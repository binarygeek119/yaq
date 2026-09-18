import { useState } from "react";
import {
  askNotificationPermission,
  canAskNotifications,
  skipNotificationsThisSession,
  skippedNotificationsThisSession,
} from "./notifications";

export function NotificationPrompt() {
  const [visible, setVisible] = useState(
    () => canAskNotifications() && !skippedNotificationsThisSession(),
  );
  const [busy, setBusy] = useState(false);

  if (!visible) return null;

  const hide = () => setVisible(false);

  return (
    <div className="notify-prompt" role="dialog" aria-label="Notifications">
      <p>Allow notifications so this phone can get YAQ alerts.</p>
      <div className="notify-prompt-actions">
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
