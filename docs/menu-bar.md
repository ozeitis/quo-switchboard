# Menu bar

One monochrome SF Symbol and an optional unread total keep the menu bar compact. Colored workspace initials live inside the native menu. Incoming calls move to the top; opening their workspace leaves answering to Quo. An active call changes the status icon too. Account names are the local labels chosen in Switchboard.

The menu answers three questions: which workspace needs attention, which has a call, and how to open it. It also exposes notification settings, a test alert, and connection health. Settings can hide the icon or its total; other switching controls remain available.

“Desktop alerts: On” describes Switchboard's preference. macOS still controls permission, Focus, and suppression during screen sharing. A test alert can reach macOS without a visible banner. Check [macOS Notifications settings](https://support.apple.com/guide/mac-help/notifications-settings-mh40583/mac), including “when mirroring or sharing the display.” That control affects other applications too; Switchboard does not change it.

## What the count means

- The adapter reads numeric accessibility labels in Quo's inbox and direct-message navigation. It does not read phone numbers, conversation previews, or message bodies for counting.
- Navigation takes precedence over a `(number)` window title. These sources are never added together.
- Quo replaces a hovered inbox's badge with its More button. The adapter retains that row's last observed count until the badge returns.
- Missing markers produce an unavailable state, not a claim that the account has zero unread activity. A partial aggregate has a `+` suffix. `99+` keeps large totals compact beside the menu-bar icon; the menu shows full observed totals.
- These are observed sidebar counters, not a history of delivered desktop alerts. Muted inboxes and direct messages hidden behind overflow may be absent. Inbox badges count conversations; direct-message badges can count messages. The menu therefore labels the sum **unread**, not messages or missed calls.
- Counts are not persisted. A new page must supply them again. Offline counts can be stale; the menu labels that state.
- Existing unread items do not generate new desktop alerts. Quo's new-notification and incoming-call events still drive alerts.

Daily missed calls, response times, and unanswered conversations need verified API data, time windows, permissions, and account mapping. They should be a separate optional integration. The current menu does not estimate business metrics from badges.

## Design basis

[Apple's menu-bar guidance](https://developer.apple.com/kr/design/human-interface-guidelines/the-menu-bar) recommends template symbols, user control over visibility, and native menus for simple actions. [Slack's notification controls](https://slack.com/help/articles/201355156-Configure-your-Slack-notifications) distinguish badge activity from banner delivery and provide workspace-aware controls. [Electron's Tray API](https://www.electronjs.org/docs/latest/api/tray) supplies the native status item, stable identity, template image, and menu. [Quo's API](https://www.quo.com/docs/2026-03-30/introduction) is the potential source for a later business-metrics integration.
