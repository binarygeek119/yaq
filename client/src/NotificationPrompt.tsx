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

  if (!visible) return null;

  const hide = () => setVisible(false);

  return (
    <div className="notify-prompt" role="dialog" aria-label="Notifications">
      <p>Allow notifications so this phone can get YAQ alerts.</p>
      <div className="notify-prompt-actions">
        <button
          type="button"
          className="primary"
          onClick={() => {
            skipNotificationsThisSession();
            hide();
            void askNotificationPermission();
          }}
        >
          Allow
        </button>
        <button
          type="button"
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
