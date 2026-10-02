# Verification

## Version 0.5.2 — October 2, 2026

Strict TypeScript checks, 17 unit tests, and 37 desktop tests pass. Desktop tests use isolated synthetic profiles and local pages, without Quo credentials or real calls.

| Coverage | What the tests establish |
| --- | --- |
| Workspaces | Profile isolation, persistence, migration, selection, compact navigation, and removal |
| Security | Exact-origin IPC, main-frame identity, guarded navigation, notification normalization, and stale-action rejection |
| Calls | Native sheet/panel ownership, source-specific Answer/Decline routing, pending actions, competing calls, privacy, screen lock, and shutdown |
| Mac interactions | Close/reopen, minimize/zoom commands, native Settings, keyboard workspace selection, and unchanged Quo viewport geometry |
| Themes and activity | Palette contrast, compatibility fallback, preview cancellation, unread counting, menu-bar layouts, and Reduce Motion |
| Shared settings | Microphone selection across synthetic profiles, local input-meter cleanup, and call-safe web updates across service workers |

Both architecture packages passed strict code-signature checks. Both DMGs and all four archive checksums verified. Package inspection confirmed matching application sources, security fuses, universal native controls, test-fixture exclusion, and a matching dependency inventory. These checks establish package structure and integrity, not Apple notarization or real calling reliability.

## Field acceptance before relying on calls

- Receive a real call in each workspace while another workspace is selected. Repeat with the main window closed and the app backgrounded. Answer must select the source and connect two-way audio.
- Verify cancellation, answered-elsewhere calls, stale alerts, competing calls, mute, hold/resume, and end against Quo's live controls.
- Check native notifications under normal settings, Focus, screen sharing, lock/unlock, and fullscreen Spaces. Verify caller-preview privacy.
- Test actual microphone selection, unavailable/duplicate device names, Bluetooth, permission denial, and input changes between calls.
- Leave the Mac awake for 24–48 hours. Test sleep/wake, network loss/reconnection, restart, and installer upgrades. Confirm sessions and real message/call delivery independently of page heartbeats.
- Verify physical title-bar dragging, edge resizing, native menu-bar interaction, keyboard navigation, VoiceOver, Reduce Motion, and Increase Contrast.
- Run the Intel package on an Intel Mac. Building a universal module does not establish Intel runtime behavior.

Do not attach real account data to a public issue. Use synthetic screenshots and minimal reproduction steps. Saved sign-ins and page heartbeats do not prove provider call transport health. Quo retains control of session expiry and calling.

The iPhone experiment has its own [capability results and release gate](../ios/README.md).
