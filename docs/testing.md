# Verification

## Local validation — October 1, 2026

Version 0.2.0: 10 unit tests and 14 Electron desktop tests pass. Both architecture bundles pass strict code-signature verification, and both DMGs pass disk-image checksum verification. The Apple Silicon packaged build loads the native module, restores the existing signed-in Quo inbox after upgrading from 0.1.1, and records page heartbeats locally.

Native click checks on macOS 27 covered name validation, create/cancel, edit with name/color prefill, save, switching, reordering, and collapsing the sidebar. The accessibility tree exposes the native controls. Intel execution, a complete accessibility/appearance matrix, real incoming-call delivery, and the 24–48-hour soak remain unverified. Ad-hoc signing does not establish Apple notarization or publisher identity.

## Automated

`npm run check` checks strict TypeScript types and runs tests for URL policy, notification input handling, account ID validation, session partition identity, settings persistence, and preserving corrupt settings.

`npm run test:desktop` starts real Electron processes with isolated temporary data directories and the explicit HTML test shell. A test-only protocol handler serves a controlled page at Quo’s origin. Native notification objects are observed through a test-only display stub. No credentials or real calls are involved. These tests exercise the shared command/session logic, not AppKit button clicks; native interaction is tested separately below.

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
- A separate native-shell integration case checks compact-rail bounds, unread/call state, notification routing while a native sheet is open, profile identity, and collapsed-state restoration. It still does not replace testing native button clicks.

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
- Check light/dark appearance, Reduce Motion, Reduce Transparency, Increase Contrast, and VoiceOver on supported macOS versions.

## 24–48-hour idle acceptance

1. Start the packaged build, sign into both organizations, and verify one incoming call and message per organization.
2. Keep the app running with its window closed. Record whether the Mac remains awake or sleeps; these are different scenarios.
3. After 24 hours, inspect **Help → Connection health**. Repeat the incoming call/message checks with the opposite workspace selected.
4. At 48 hours, repeat with the window closed, then after sleep/wake and network reconnection. Confirm the correct workspace opens from each notification.
5. Copy `~/Library/Application Support/Switchboard/health.json` before quitting. Record any reauthentication prompt, missed call/message, page stall, or recovery event.

Passing the fixture suite is not a passing soak test. A page heartbeat proves the page responds, not that Quo is receiving calls or syncing messages.

## Real-account acceptance checklist

Run before depending on Switchboard for business calls. Use consenting test participants.

- [ ] Sign into two organizations independently with the intended login method.
- [ ] Quit and reopen. Verify both organizations retain their valid sessions.
- [ ] Install a newer build. Verify workspace IDs and profiles survive.
- [ ] Enable macOS notifications and microphone access; verify Settings → Test notification.
- [ ] Receive calls for each organization while the other is selected.
- [ ] Verify caller, receiving line, and organization details when supplied by Quo.
- [ ] Receive calls with the window minimized and closed but the app still running.
- [ ] Verify notification click opens the correct account.
- [ ] Test experimental Answer only after ordinary answering works. Disable it if Quo’s controls are not recognized consistently.
- [ ] Test both accounts ringing together, one active call, and a call answered on another device.
- [ ] Change microphone and Bluetooth devices during a test call.
- [ ] Lose and restore connectivity; sleep and wake the Mac.
- [ ] Test Focus mode, denied notification permission, and denied microphone permission.
- [ ] Observe resource use and session retention for several days; separately test the documented session-expiry boundary.

“Workspace loaded” only reports page state. It does not establish that Quo’s calling connection is ready. Keep a phone fallback during evaluation.
