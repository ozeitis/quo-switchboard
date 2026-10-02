# Menu bar

Each workspace gets a separate colored initial icon and optional unread count by default. Clicking it opens a native menu for that workspace: unread activity, current call state, switching, theme, and a test alert. Its actions keep the workspace identity even if another account is selected.

**Settings → Menu bar** switches between **One icon per workspace** and **One combined icon**. Combined mode uses less menu-bar space and lists every workspace in one menu, prioritizing incoming calls. Visibility and count controls apply to either layout. macOS controls final status-item placement and may hide items when space is limited.

Incoming calls use a red phone symbol with a restrained pulse. Active calls are green; hold uses an amber pause; dialing/connecting/transfer use blue symbols; reconnecting/ending use amber. Text labels and distinct glyphs keep meaning independent of color. The native rail uses the same states, including while collapsed. Animation respects both **Animate call activity** and system **Reduce Motion**.

## Observable call states

| State | Evidence from the current call panel |
| --- | --- |
| Incoming | One unique enabled Answer/Accept call control |
| Active | Visible End call/Hang up control, including while disabled |
| Held | Resume/Unhold control or Hold marked pressed |
| Muted | Unmute control or Mute marked pressed |
| Dialing, connecting, reconnecting, transferring, ending | Explicit accessible status inside the current call panel |
| Call waiting | An incoming control alongside an ongoing call |
| Idle | Call controls disappear |

Hold and Mute actions alone do not imply those states. Historical conversation text is excluded. A panel without a recognized accessibility boundary stays generically busy rather than guessing hold or transport state. This is English-language UI observation, not a provider event stream. Ended, rejected, missed, and answered-on-another-device outcomes cannot be distinguished reliably from disappearance; the app does not invent them. Real Quo calls still require field testing.

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
