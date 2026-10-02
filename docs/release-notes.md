Switchboard for Quo 0.2.4 — stable Quo navigation and better Mac interaction.

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
- Local page-liveness reports under Help → Connection health. Cookie-store flushes are awaited before quitting.
- Window position, size, and sidebar mode survive relaunch.
- Native notifications labeled by workspace, with click routing back to the source.
- Optional experimental answering through Quo’s existing visible controls.
- Apple Silicon and Intel DMGs, source, checksums, and dependency inventory.

Applications are ad-hoc signed, not Apple-notarized. macOS may require **Privacy & Security → Open Anyway**. This preview does not promise permanent sign-in or verified live-call reliability. Direct answering is off by default. Quo’s session rules still apply.

The test suite uses controlled pages. Complete the real-account checklist in `docs/testing.md` before relying on this app for business calls. No Quo credentials, call recordings, or customer data are included.
