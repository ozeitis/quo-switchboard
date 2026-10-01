# Contributing

Use Node.js 24 LTS or newer on macOS. Install with `npm ci` and run `npm run check` and `npm run test:desktop` before opening a pull request.

Keep changes focused. Explain the user problem, the behavior after the change, and what was tested. Include a screenshot for shell changes and regression coverage for session isolation, IPC, notification routing, or call handling.

Never commit credentials, Quo profile data, customer content, signing certificates, or private call recordings. Desktop tests use local fixtures, not real Quo accounts or real phone calls.

Preserve the security boundary between remote Quo pages and the main process. Do not disable the sandbox, allow Node in a remote page, introduce broad IPC bridges, or silently extend Quo’s session lifetimes.

The latest stable runtime is preferred, with a committed lockfile and tests against the actual Electron version. Dependencies should solve a concrete problem. New backend services, telemetry, or automatic updates require an architecture discussion first.
