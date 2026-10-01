Switchboard for Quo 0.2.1 — continuous window chrome and rounded content.

- One native glass surface joins the sidebar and toolbar without a vertical seam.
- Rounded Quo content with a narrow outer gutter. Workspace selections fit within the rail and keep both corners visible.

Version 0.2 introduced native workspace controls and recovery diagnostics:

- Separate persistent browser profiles for each Quo workspace.
- Native AppKit sidebar, compact workspace rail, workspace/settings sheets, semantic colors, and macOS Liquid Glass.
- Collapse with ⌘⇧L; unread and call indicators remain visible. Rename, recolor, and reorder without replacing sessions.
- Bounded recovery after page failures or renderer crashes. Healthy pages stay loaded through idle and wake.
- Local page-liveness reports under Help → Connection health. Cookie-store flushes are awaited before quitting.
- Window position, size, and sidebar mode survive relaunch.
- Native notifications labeled by workspace, with click routing back to the source.
- Optional experimental answering through Quo’s existing visible controls.
- Apple Silicon and Intel DMGs, source, checksums, and dependency inventory.

Applications are ad-hoc signed, not Apple-notarized. macOS may require **Privacy & Security → Open Anyway**. This preview does not promise permanent sign-in or verified live-call reliability. Direct answering is off by default. Quo’s session rules still apply.

The test suite uses controlled pages. Complete the real-account checklist in `docs/testing.md` before relying on this app for business calls. No Quo credentials, call recordings, or customer data are included.
