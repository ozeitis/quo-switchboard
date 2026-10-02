# Verification

## Local validation — October 2, 2026

Version 0.4.1 passes strict TypeScript checks, all 16 unit tests, and all 31 desktop tests. Three new cases use real Chromium service workers in two isolated profiles. One action checks a profile with no staged update, activates both workers, confirms page reloads, and retains workspace IDs, cookies, and local storage. An incoming call during downloading can be answered through the same native command path before downloading finishes; activation is deferred until the call ends and the shared action is retried. A failed script check activates neither worker, and a corrected retry succeeds.

A controlled macOS 27 native preview confirms the update action at the bottom-left in expanded and compact sidebars. A physical click updates both fixture profiles from v1 to v2; both reload, retain their identities/storage, and remove the completed action. A subsequent copy-only refinement keeps progress text visible during the coordinator's own reloads rather than displaying the disconnected-workspace hint.

Both 0.4.1 architecture bundles pass strict code-signature verification. Both DMGs and all four archive checksums verify. The package audit confirms the version, native module, expected security fuses, no test fixtures, and a matching CycloneDX dependency inventory. The Apple Silicon package restores both live signed-in workspaces after a normal quit of 0.3.1, preserving their IDs, active workspace, collapsed sidebar, and observed unread counts. Native Settings confirms the compact combined menu-bar layout and System Default microphone for both profiles. The live Workspace → Update all workspaces command completes without a visible error or pending-update action; activation of a new live Quo version was not observed. Future Quo compatibility, Intel execution, physical microphones, real calls, and the idle soak remain field checks.

Version 0.4.0 passes strict TypeScript checks, all 16 unit tests, and all 28 desktop tests. The focused activity/call/audio/animation cases also pass. One earlier run stalled in test teardown after every assertion in the activity case passed. Teardown now performs the normal quit path with the isolated fixture's call guard confirmed; the complete rerun passes. A final microphone cleanup refinement passes the audio regression again.

Both architecture bundles pass strict code-signature verification, both DMGs pass disk-image verification, and all four archive checksums verify. The package audit confirms version 0.4.0, the native module, no test fixtures, encrypted cookies, disabled Node/inspector entry points, and ASAR integrity. A CycloneDX dependency inventory accompanies the installers.

The macOS 27 native preview verifies the activity popover, source workspace controls, recent forwarded alerts, current-workspace checkmark, and the General and Audio settings sections. The Mac locked during the final device-picker check. The earlier controlled preview verified synthetic device selection across both profiles, the input meter, and labeled simulation Answer/Hold/Resume controls. Real status-item pointer clicks, live Quo calls, physical microphones, the complete OS accessibility matrix, and the 24–48-hour soak remain unverified.

Version 0.3.1 adds distinct themed hover/pressed fills and stronger foreground accents. Contrast checks include every solid-control state. The native 0.3.0 package restored both live signed-in workspaces, matching the prior observed counts and retaining the collapsed sidebar. Native Settings confirms separate menu items and activity animation as migrated defaults, without changing notification choices. A live Iris/dark preview opens from Workspace options without a compatibility warning; Cancel restores the original appearance and saves no theme. All profile UUIDs remain unchanged. The initial UI control connection closed once, then reconnected to the running app; no app restart was required.

The final 0.3.1 source passes strict TypeScript checks, all 15 unit tests, and all 25 desktop tests. Both architecture bundles pass strict code-signature verification. Both DMGs and all four archive checksums pass verification. The archive audit excludes test fixtures and confirms encrypted cookies, disabled Node/inspector entry points, and ASAR integrity checks. A CycloneDX dependency inventory accompanies the installers. After a normal quit of 0.3.0, the Apple Silicon 0.3.1 package restores both live signed-in workspaces, their observed counts, and the collapsed sidebar. Intel execution, real Quo calls, native status-item pointer interaction, and the 24–48-hour soak remain unverified.

Version 0.3.0: strict TypeScript checks, 15 unit tests, and all 25 desktop tests pass. New tests cover generated palette contrast in both modes and increased contrast, extreme custom accents, theme input validation, migration, complete contract fingerprints, shared/portal/editor surfaces, white-on-accent controls, preserved warning colors, preview cancellation, saved themes across restart, unknown-contract fallback, and untouched authentication. Notification routing cancels an unfinished native preview. Call cases distinguish actions from held/muted states, exercise all explicit phase markers and call waiting, ignore historical statuses, and keep disabled End controls busy. Separate menu-bar cases verify individual counts, source test alerts, exactly two ringing frames, stable neighboring icons, layout changes, hiding, and cleanup. A controlled system-preference stub verifies Reduce Motion stops the menu timer and page motion without changing the saved animation preference.

A controlled native preview on macOS 27 verifies palette cards, live light/dark appearance, Apply persistence, reopening through the application menu, Escape cancellation, native menu-bar layout selection/save, collapsed incoming/active/held indicators, and the quit guard. The standard color well opens an auxiliary panel; its internal controls were not exposed by the available UI surface. Native status-item pointer interaction and the full OS accessibility matrix remain field checks. Fixtures do not establish real Quo call phases or end-to-end provider delivery.

Version 0.2.5: strict TypeScript checks, 12 unit tests, and all 19 desktop tests pass. The count regression covers Quo-style inbox badges with a plain window title, separate profiles, duplicate conversation/title exclusion, hover replacement, direct-message badges, clearing, and unavailable-source reporting. The menu case verifies Retina avatar sizes, exact large counts, call icon changes, ringing priority, reopening a closed window into the source account, test-alert routing, partial totals, and display/notification preferences across restart. A controlled native preview confirms rail badges, colored menu icons, account selection, and the expanded native settings sheet. The first menu assertion assumed separators had IDs; it now handles their absence. A background-workspace zoom assertion ran before navigation completed; it now waits for that page too. The complete suite passed again after the final count and notification-copy changes.

Both 0.2.5 bundles pass strict code-signature verification; both DMGs and all four archive checksums pass verification. The packages exclude the test bootstrap and retain cookie encryption with Node/inspector entry points disabled. The Apple Silicon upgrade from 0.2.4 preserves both live signed-in workspaces and the collapsed sidebar. Their native rail counts match Quo's observed navigation totals. Native settings expose all six controls. The user reported no banner from the first local test: macOS's notification pipeline accepted it, then resolved its behavior to silence with the reason “display shared.” System Settings confirmed app notifications and Desktop were enabled, while “when mirroring or sharing the display” was Notifications Off. That global setting remains unchanged. Native settings now explain this distinction. A focused menu regression also verifies exact large totals inside the menu while the status-item total remains compact.

The final packaged launch stayed on Opening longer than the earlier launch, then restored both live accounts and counts without a reload or storage changes. The cause is unconfirmed. The Mac locked during the last repeated switching check; the earlier packaged build's two-account switching check passed. This does not establish live-call delivery or long-term session reliability.

Version 0.2.4: strict TypeScript checks, 11 unit tests, and all 17 desktop tests pass. New cases keep Quo's sidebar at 248 CSS pixels at 860, 1,040, and 1,512-point native window widths in both workspace-sidebar modes; preserve dyslexia and monospace fonts; isolate and restore workspace zoom; keep authentication at actual size; and bind native text-menu commands to their source workspace and frame. A controlled Mac preview confirms the real editing menu, Select All, native View → Zoom Out, ⌘0, expanded/compact layout, and physical clicks through the glass cutout. Both bundles pass strict code-signature verification; both DMGs pass checksum verification. The packaged Apple Silicon update restores the signed-in Quo inbox and collapsed sidebar from 0.2.3, and exposes the new native View controls. The first full run had one dialog-visibility timeout; the isolated case and full rerun passed. Its cause remains unconfirmed.

Version 0.2.3: strict TypeScript checks, 10 unit tests, and all 14 desktop tests pass. Both bundles pass strict code-signature verification; both DMGs pass checksum verification. The native integration case verifies full page bounds after resizing and the actual viewport after selecting a background workspace. A controlled native preview confirms the top-left curve in both sidebar modes, removal of the extra right/bottom frame, workspace switching, and physical pointer clicks on a bottom-right page control through the decorative glass layer. The packaged Apple Silicon update restores the signed-in Quo inbox from 0.2.2; expanding and collapsing the sidebar works, with the saved compact mode retained. The initial viewport assertion inspected an inactive Chromium page before it became visible; the check now waits for the selected page's viewport to update.

Version 0.2.2: 10 unit tests and all 14 desktop tests pass. Both bundles pass strict code-signature verification; both DMGs pass checksum verification. Native visual/click checks cover both sidebar modes, simultaneous “99+” and incoming-call indicators, switching, the smaller collapse/New/options controls, and canceling the creation sheet. The packaged Apple Silicon update restores the signed-in Quo inbox and collapsed sidebar from 0.2.1. The first suite run had one background-window visibility failure; an isolated rerun passed. The harness now waits for Electron's initial window to become visible, and a full rerun passed. The original transient failure's cause was not conclusively established.

Version 0.2.1: the same 24 tests pass, including retained-view bounds after expanding and resizing to the minimum window size. Both bundles pass strict code-signature verification; both DMGs pass checksum verification. Native visual checks confirm a continuous sidebar/toolbar surface, rounded content corners, and fully rounded selections in both sidebar modes. Switching, opening the native creation sheet, and canceling remain functional. The packaged Apple Silicon update restores the signed-in Quo inbox and collapsed sidebar from 0.2.0.

Version 0.2.0: 10 unit tests and 14 Electron desktop tests pass. Both architecture bundles pass strict code-signature verification, and both DMGs pass disk-image checksum verification. The Apple Silicon packaged build loads the native module, restores the existing signed-in Quo inbox after upgrading from 0.1.1, and records page heartbeats locally.

Native click checks on macOS 27 covered name validation, create/cancel, edit with name/color prefill, save, switching, reordering, and collapsing the sidebar. The accessibility tree exposes the native controls. Intel execution, a complete accessibility/appearance matrix, real incoming-call delivery, and the 24–48-hour soak remain unverified. Ad-hoc signing does not establish Apple notarization or publisher identity.

## Automated

`npm run check` checks strict TypeScript types and runs tests for URL policy, notification input handling, account ID validation, session partition identity, settings persistence, and preserving corrupt settings.

`npm run test:desktop` starts real Electron processes with isolated temporary data directories. A test-only bootstrap installs protocol handlers before the production entry point creates any views, including restored workspaces. It serves controlled Quo/authentication fixtures without contacting real Quo. Most cases use the explicit HTML test shell; layout and text-menu cases also use the native shell. Native notification objects are observed through a test-only display stub. No credentials or real calls are involved. These tests exercise the shared command/session logic, not AppKit button clicks; native interaction is tested separately below.

Desktop coverage includes:

- Two workspaces keep cookies and local storage separate.
- Persistent cookies, local storage, workspace IDs, and the active workspace survive a clean application restart.
- Remote pages cannot access the shell’s account-management bridge or Node.
- Hidden workspace timers remain unthrottled.
- An inactive workspace’s notification selects the correct account and invokes its original click callback.
- Experimental Answer targets the right renderer and current control.
- An old notification cannot answer a later call.
- Ambiguous controls revoke direct answering.
- A detected active call blocks direct answering in another workspace.
- Both email login routes retain their workspace and session-storage transaction across the authentication origin and callback; the authentication page receives no adapter.
- Opening an external link does not hide the workspace or clear its active-call state.
- A forced renderer crash recovers while retaining its local profile and leaving its neighbor untouched.
- Simulated offline/online transitions and sleep/wake events retain an active-call fixture and probe both workspaces.
- Both page heartbeats continue after closing the main window.
- Canceled creation/removal, renaming, reordering, and confirmed removal keep settings and views consistent.
- A separate native-shell integration case checks compact-rail and resized-content bounds, unread/call state, notification routing while a native sheet is open, profile identity, and collapsed-state restoration. It still does not replace testing native button clicks.
- Quo's navigation retains its full width at smaller native window sizes; Mac fonts can be disabled without affecting that width, and accessibility/code fonts remain intact.
- Zoom is isolated per workspace and survives restart. Sign-in stays at actual size; the saved zoom returns after authentication.
- Native text-menu editing targets its originating view and frame, including after another workspace becomes selected.
- Per-workspace themes cover portal/editor menus, preserve warning colors, restore on cancellation, survive restart, and leave authentication untouched. Unknown theme contracts fall back to original colors.
- Explicit current-call markers drive held/muted/connection/transfer states; disabled End controls remain busy and historical statuses are ignored.
- Separate menu-bar items preserve source-specific counts/actions; ringing animation stops when disabled or under system Reduce Motion.
- Guarded popover call commands answer the originating workspace, operate mute/hold/resume/end, and reject stale tokens or another active call.
- Shared microphone labels resolve to different device IDs in separate profiles, survive restart, preserve existing streams, and reject missing inputs. Local tests stop when switching workspaces and are blocked during captures.
- Diagnostic calls exercise local controls and a notification Answer callback without invoking Quo call buttons or changing unread counts.
- Actual service workers stage and activate independently in two profiles through one shared command; both pages reload without replacing local identities. A call during downloading remains answerable and blocks activation; failed checks retain the current workers and permit a retry.
- Native menu-bar rows follow unread counts and call state, select the source workspace while the window is closed, and retain visibility/count preferences across restart. A partial count is labeled explicitly; desktop alert toggles do not hide unread activity.

These tests do not certify native notification delivery, Quo’s actual call interface, or a provider’s session policy.

Unit tests also verify retry exhaustion/cooling and health-report privacy, bounded history, and sleep-gap accounting. Advancing a fake clock does **not** substitute for an actual 48-hour soak.

## Native workspace acceptance

Use a disposable profile, never a real user's profile, for destructive workflow testing:

```sh
SWITCHBOARD_TEST_DATA=/tmp/switchboard-native-review npm start
```

- Create: empty name disabled; name/color accepted; Enter submits; Escape cancels without creating a profile.
- Open New repeatedly: one sheet, one eventual workspace.
- Edit: rename/recolor retains the same workspace UUID and browser storage.
- Switch by mouse, arrow keys, menu, and ⌘1–9; inactive pages remain alive.
- Context menu and toolbar menu target the intended workspace; move up/down changes shortcut order.
- Remove: Cancel preserves the view; confirmation clears only the selected local profile.
- Open settings and health; controls work through macOS accessibility.
- Resize/relaunch; controls retain position and Quo cannot cover the native sidebar or toolbar.
- Collapse/expand; badges and call indicators remain visible, the page gains space, and the saved mode survives relaunch.
- Resize with Quo's own navigation visible; verify labels remain readable and the conversation controls fit. Test View → Use Mac Fonts and ⌘+ / ⌘− / ⌘0 across workspaces.
- Right-click a disposable draft. Test spelling suggestions, Undo/Redo, Select All, and normal clipboard commands; Quo's own application menus must remain usable.
- Open the menu-bar popover: verify account colors/counts, ringing priority, switching, recent-alert routing, current call controls, and Settings. Test separate/combined layouts and optional counts under Settings → General. Check notification tests and local call simulation under Diagnostics. Compare badge totals with Quo's visible unmuted inboxes; separately inspect muted/overflow direct messages and real macOS delivery.
- Stage a Quo web update. Check the native bottom-left action in both sidebar modes; one click checks all ready profiles, reloads those with waiting updates, preserves sign-ins, and removes the action after completion. Check call/offline blocking, Answer during downloads, partial failure, and retry. This is separate from installing a Switchboard DMG.
- Check light/dark appearance, Reduce Motion, Reduce Transparency, Increase Contrast, and VoiceOver on supported macOS versions.

## 24–48-hour idle acceptance

1. Start the packaged build, sign into both organizations, and verify one incoming call and message per organization.
2. Keep the app running with its window closed. Record whether the Mac remains awake or sleeps; these are different scenarios.
3. After 24 hours, inspect **Settings → Diagnostics → Connection health**. Repeat the incoming call/message checks with the opposite workspace selected.
4. At 48 hours, repeat with the window closed, then after sleep/wake and network reconnection. Confirm the correct workspace opens from each notification.
5. Copy `~/Library/Application Support/Switchboard/health.json` before quitting. Record any reauthentication prompt, missed call/message, page stall, or recovery event.

Passing the fixture suite is not a passing soak test. A page heartbeat proves the page responds, not that Quo is receiving calls or syncing messages.

## Real-account acceptance checklist

Run before depending on Switchboard for business calls. Use consenting test participants.

- [ ] Sign into two organizations independently with the intended login method.
- [ ] Quit and reopen. Verify both organizations retain their valid sessions.
- [ ] Install a newer build. Verify workspace IDs and profiles survive.
- [ ] Enable macOS notifications and microphone access; verify Settings → Diagnostics → Test notification.
- [ ] Receive calls for each organization while the other is selected.
- [ ] Verify caller, receiving line, and organization details when supplied by Quo.
- [ ] Receive calls with the window minimized and closed but the app still running.
- [ ] Verify notification click opens the correct account.
- [ ] Test experimental Answer only after ordinary answering works. Disable it if Quo’s controls are not recognized consistently.
- [ ] Test both accounts ringing together, one active call, and a call answered on another device.
- [ ] Select the shared microphone under Settings → Audio and verify every profile reports Ready. Run the local input test.
- [ ] Place a new call in each workspace and verify the selected physical input. Changes during a call must leave its current microphone intact.
- [ ] Unplug/reconnect the selected microphone; verify missing-device reporting and no silent fallback. Test duplicate device names and Bluetooth transitions.
- [ ] Lose and restore connectivity; sleep and wake the Mac.
- [ ] Test Focus mode, denied notification permission, and denied microphone permission.
- [ ] Observe resource use and session retention for several days; separately test the documented session-expiry boundary.

“Workspace loaded” only reports page state. It does not establish that Quo’s calling connection is ready. Keep a phone fallback during evaluation.
