Switchboard for Quo 0.5.0 — persistent desktop call controls.

- A native floating panel keeps recognized incoming calls visible outside the main window. Answer opens the source workspace; Decline and Dismiss have separate meanings. Settings can disable the panel. Preview privacy and screen lock hide caller details.
- The adapter matches Quo's current labeled Incoming call dialog and Accept button, plus Put call on hold / Take call off hold. Disabled Accept controls still identify ringing without exposing Answer. Ambiguous controls remain unavailable.
- Packaged macOS alerts declare Apple's required alert style. Call alerts have no application timeout. System notification persistence, Focus, and screen-sharing suppression remain user-controlled.
- Notification buttons use the acknowledged source-call coordinator. Explicit native toolbar dragging avoids web-view interception; window movement and resizing are enabled.

Real Quo call delivery and audio after an extended idle period still require field testing. [Research and boundaries](calls.md).

Switchboard for Quo 0.4.1 — one Quo update action for all workspaces.

- A native bottom-left action appears when a Quo web update is waiting. The compact rail keeps it within reach; ⌘⇧U checks all workspaces at any time.
- One click checks every signed-in profile before activating waiting workers. Existing profile IDs, cookies, and local storage remain intact.
- Detected calls, microphone activity, and disconnected/loading workspaces block activation. Answer and End remain responsive during downloads. Failed or incomplete updates retain a retry state.

This updates Quo web pages. Switchboard installer updates remain separate. [Details and compatibility boundaries](updates.md).

Switchboard for Quo 0.4.0 — native activity and shared microphone controls.

- A compact menu-bar icon opens a native popover with all workspaces, observed unread counts, current calls, and recent forwarded Quo alerts. Separate icons and counts remain optional.
- Recognized current calls expose Answer, Decline, Mute/Unmute, Hold/Resume, and End. Actions revalidate their source; another active call blocks Answer.
- Native Settings has General, Audio, and Diagnostics. Preferences apply immediately. Connection health and debug tools are no longer in the activity panel.
- One microphone choice resolves independently in every browser profile. Existing calls keep their microphone; missing or duplicate devices fail visibly. A ten-second local input meter records nothing.
- A labeled local call simulator exercises notification and control routing without placing a phone call or altering Quo state.

Live Quo call controls, physical microphones, Bluetooth recovery, Intel execution, and long-term idle behavior still require field testing. Quo owns session renewal. Installers are ad-hoc signed, not Apple-notarized.

Version 0.3.1 added workspace palettes, a native theme picker, observable call states, and Reduce Motion support.

Switchboard for Quo 0.2.5 — unread badges and a native workspace menu bar.

- Workspace badges now observe Quo's inbox navigation, instead of relying only on its window title. Hovering More does not drop a known inbox count. Missing counts are reported as unavailable.
- A compact SF Symbol and optional total in the menu bar. Native menu rows show colored workspace initials, unread counts, and call state; ringing workspaces come first.
- Quick switching while the window is closed, notification settings and testing, and connection health. Visibility/count preferences survive updates.
- Exact observed counts inside the menu, with a compact total beside the status icon. Settings explain Focus and screen-sharing banner suppression.
- No replay of old unread activity as desktop alerts and no estimated business metrics.

Version 0.2.4 stabilized Quo navigation and improved Mac interaction:

- Quo's own sidebar stays at its full width across window sizes and workspace-sidebar modes.
- Mac system typography in Quo's sidebar and main content. Dyslexia, code, handwriting, and emoji fonts remain intact; View → Use Mac Fonts switches back to Quo's fonts.
- Native text context menus with spelling suggestions, editing, and copying links.
- Per-workspace zoom with ⌘+ / ⌘− / ⌘0, retained across restart. Sign-in pages remain at actual size.

Version 0.2.3 removed the extra content frame:

- Quo extends to the window's right and bottom edges, removing the middle of three nested borders.
- The top-left content curve remains. One masked native glass surface joins the sidebar and toolbar; page controls remain clickable through its cutout.
- Quo's own panel styling remains intact.

Version 0.2.2 tightened spacing and native controls:

- A 56-point compact workspace rail, a 208-point expanded sidebar, and a 52-point single-line toolbar.
- Small SF Symbol buttons with native hover feedback. Healthy workspaces no longer repeat “Workspace loaded” in the toolbar and rows.
- Shared layout metrics keep native controls, rounded Quo views, and loading/error surfaces aligned.

Version 0.2.1 refined the window geometry:

- One native glass surface joins the sidebar and toolbar without a vertical seam.
- Rounded Quo content with a narrow outer gutter. Workspace selections fit within the rail and keep both corners visible.

Version 0.2 introduced native workspace controls and recovery diagnostics:

- Separate persistent browser profiles for each Quo workspace.
- Native AppKit sidebar, compact workspace rail, workspace/settings sheets, semantic colors, and macOS Liquid Glass.
- Collapse with ⌘⇧L; unread and call indicators remain visible. Rename, recolor, and reorder without replacing sessions.
- Bounded recovery after page failures or renderer crashes. Healthy pages stay loaded through idle and wake.
- Local page-liveness reports, now under Settings → Diagnostics → Connection health. Cookie-store flushes are awaited before quitting.
- Window position, size, and sidebar mode survive relaunch.
- Native notifications labeled by workspace, with click routing back to the source.
- Optional experimental answering through Quo’s existing visible controls.
- Apple Silicon and Intel DMGs, source, checksums, and dependency inventory.

Applications are ad-hoc signed, not Apple-notarized. macOS may require **Privacy & Security → Open Anyway**. This preview does not promise permanent sign-in or verified live-call reliability. Answer from notifications is off by default. Quo’s session rules still apply.

The test suite uses controlled pages. Complete the real-account checklist in `docs/testing.md` before relying on this app for business calls. No Quo credentials, call recordings, or customer data are included.
