# Security

Switchboard loads remote code from Quo. That code is necessary to use Quo, but it does not receive access to Node, shell commands, local account settings, or filesystem APIs.

## Boundaries

- Remote views use Chromium sandboxing, context isolation, and web security. Node integration is disabled.
- Packaged builds disable Electron's Node execution and inspection environment switches and require an integrity-checked ASAR archive.
- The local shell has a restrictive Content Security Policy and no network access.
- Every shell IPC handler verifies the exact web contents, main frame, and local document URL.
- Account events must come from that account’s main frame on `https://my.quo.com` or `https://my.openphone.com`. The main process supplies account identity; it ignores page-supplied identity.
- Notification data is length-limited, normalized, rate-limited, and inserted as text. No remote HTML is rendered in the shell.
- Native permission handlers allow a narrow set of browser capabilities on exact Quo origins. Microphone requests also require macOS permission. Camera and arbitrary device permissions are denied in this release.
- External URLs are restricted to HTTPS. File, JavaScript, custom executable protocols, and credential-bearing URLs are rejected.
- Workspace removal closes its view and clears its local browser storage, HTTP cache, HTTP authentication, and network connections.

## Local data

The app stores workspace names, IDs, colors, and preferences in `workspaces.json`. Quo’s browser profiles contain normal web application data, including session material. The app does not export, synchronize, inspect, or log authentication tokens and does not collect passwords separately.

Browser-managed storage is not uniformly encrypted. Do not treat a browser profile as a dedicated encrypted vault. A compromised OS account or unlocked device is outside this application’s protection boundary. Never attach a profile directory, cookie database, or complete network trace to a public issue.

Packaged builds enable Electron's OS-backed cookie encryption. This does not encrypt local storage, IndexedDB, or all cached website data. Do not disable the cookie-encryption fuse in later releases: Electron documents the transition as one-way. Development runs use a separate `Switchboard Development` data directory to avoid opening production profiles with a different runtime configuration. Signing changes can also affect macOS Keychain access and must be tested during upgrades.

The page adapter is not a security boundary against compromised Quo code: code already running in the authenticated Quo origin can operate that Quo session and spoof its own notifications. It still cannot select a different local workspace through the shell bridge.

## Releases

Preview binaries are ad-hoc signed and are not notarized by Apple. That is not publisher identity verification. Verify release hashes and the source revision, or build from source. Automatic updates are intentionally absent until authenticated distribution is in place.

Ad-hoc previews retain hardened runtime with the library-validation exception required to load Electron's frameworks. This exception should be removed and re-tested when all nested code uses the same Developer ID identity.

## Reporting

Use the repository’s private vulnerability reporting feature when available. Otherwise contact the maintainer privately through the contact details on [Oze’s GitHub profile](https://github.com/ozeitis). Please do not publish session data or exploit details in a public issue before a fix is available.
