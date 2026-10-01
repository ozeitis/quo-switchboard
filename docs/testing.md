# Verification

## Automated

`npm run check` checks strict TypeScript types and runs tests for URL policy, notification input handling, account ID validation, session partition identity, settings persistence, and preserving corrupt settings.

`npm run test:desktop` starts real Electron processes with isolated temporary data directories. A test-only protocol handler serves a controlled page at Quo’s origin. Native notification objects are observed through a test-only display stub. No credentials or real calls are involved.

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

These tests do not certify native notification delivery, Quo’s actual call interface, or a provider’s session policy.

Local packaging checks on macOS 27: both architecture bundles pass strict code-signature verification and both DMGs pass disk-image verification. The Apple Silicon bundle launches and loads Quo's real login page. Intel execution and actual Quo calling remain unverified.

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
