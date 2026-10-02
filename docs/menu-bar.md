# Activity in the menu bar

One compact SF Symbol is the default. An unread dot indicates activity without consuming space with large totals. Click it, or use **⌘⇧A**, to open a native AppKit popover. Settings → General offers separate workspace icons, optional unread counts, visibility, and animation. Existing explicit preferences survive an update.

The panel contains each workspace's name, color, full observed unread count, and current call state. Clicking its name selects that workspace. Incoming calls come first. Recognized calls expose Answer, Decline, Mute/Unmute, Hold/Resume, or End as appropriate. Switchboard validates the originating workspace and current control again before acting. Answer is disabled while another recognized call is active; it never automatically holds or ends that call.

Recent activity shows the latest four forwarded Quo page alerts. Clicking one selects its source workspace and invokes Quo's original notification-click handler. The bounded twenty-item history lives only in memory; it is not an inbox archive. Private previews redact it. Debug alerts are excluded. No business metrics are estimated from unread badges.

The footer opens Switchboard or Settings. Notification tests, a local call simulator, and connection health live under **Settings → Diagnostics**. The simulator is clearly labeled, expires after one minute, and does not place or answer a phone call. **Settings → Audio** manages the shared microphone.

## Counts and call states

- Numeric accessibility labels in Quo's inbox and direct-message navigation supply counts. Navigation takes precedence over the window title; sources are never added together.
- A hovered inbox can temporarily replace its badge with More. Its last observed count remains until the badge returns.
- Missing markers mean unavailable, not zero. Partial totals carry `+`; optional status-item totals cap at `99+`. The popover shows full observed totals.
- These are sidebar counters, not delivered-alert totals. Muted or overflow items can be absent, and badges can count different kinds of activity. They are labeled **unread**.
- Counts are not persisted. Offline values can be stale. Existing unread items never generate new desktop alerts.

| State | Evidence from the current call panel |
| --- | --- |
| Incoming | One unique enabled Answer/Accept call control |
| Active | Visible End call/Hang up control, including while disabled |
| Held | Resume/Unhold or Hold marked pressed |
| Muted | Unmute or Mute marked pressed |
| Dialing, connecting, reconnecting, transferring, ending | Explicit accessible status in the current call panel |
| Call waiting | Incoming control alongside an ongoing call |
| Idle | Current call controls disappear |

Hold and Mute buttons alone do not imply those states. Historical text is excluded. An unrecognized panel stays generically busy. Ended, rejected, missed, and answered elsewhere cannot be reliably distinguished from disappearance. The adapter observes English accessible UI; it is not a provider event stream. Real Quo calls still require field testing.

Ringing uses a restrained pulse, active calls green, hold amber, and connection states distinct symbols and semantic colors. Labels and glyphs preserve meaning without color. The native sidebar uses the same presentation. Animation respects both the app preference and macOS Reduce Motion.

macOS controls banner permission, Focus, and screen-sharing suppression. A local alert can reach Notification Center without a visible banner. Check [Apple's notification settings](https://support.apple.com/guide/mac-help/notifications-settings-mh40583/mac). Switchboard does not change global system preferences.

## Design and integration

The panel follows [Apple's popover guidance](https://developer.apple.com/design/human-interface-guidelines/popovers): a small contextual surface, clear actions, and standard dismissal. macOS 27 uses the public status-item expanded-interface lifecycle described in [Modernize your AppKit app](https://developer.apple.com/videos/play/wwdc2026/289/). Earlier systems use the standard status-button action. Compact access across accounts is also the useful pattern in [1Password Quick Access](https://support.1password.com/quick-access/).

Daily missed calls, response times, and unanswered conversations need verified API records, time windows, permissions, and organization mapping. They belong in a separate optional integration. [Quo's current call API](https://www.quo.com/docs/2026-03-30/calls/list-calls) provides call records; it does not expose the live Answer control used here.
