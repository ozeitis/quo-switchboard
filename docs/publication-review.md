# Publication review

Reviewed October 2, 2026. The repository stays private until the maintainer approves publication.

## Scope and results

| Area | Result |
| --- | --- |
| Source and reachable Git history | Gitleaks 8.30.1 found no secrets. A separate content review found no committed account profiles, passwords, API keys, caller details, or private local paths. |
| Internal validation notes | Business names were replaced with neutral labels throughout history. The current verification document contains test coverage and remaining acceptance checks. |
| Images | The only screenshot was an unused, outdated empty welcome screen; it was removed. App icons are generated locally. Their embedded metadata contains pixel dimensions only. |
| Dependencies | `npm audit` reported zero known vulnerabilities. Versions and the lockfile are committed. |
| App boundary | Remote Quo views retain sandboxing, context isolation, disabled Node integration, exact-origin IPC checks, restricted permissions, and guarded external navigation. |
| Packaging | Installers use an explicit source allowlist. Browser profiles, local reports, backups, credentials, test outputs, and build folders are excluded from Git. |
| GitHub attachments | No releases, release assets, Actions artifacts, or issue attachments were present during review. |
| Attribution | Original code uses Oze and the GitHub no-reply author address. Third-party notices remain intact. |

CI now scans complete reachable Git history for secrets using a pinned scanner release and checksum. Scan output is redacted. Contributors must use synthetic fixtures and keep profiles and customer data out of commits, screenshots, logs, and issue attachments.

## Remaining limits

This is a source and publication review, not a penetration test or a guarantee that every unknown vulnerability is absent. Preview binaries remain ad-hoc signed and unnotarized. Live call audio, extended idle reliability, Intel execution, and other [field checks](testing.md) remain separate release criteria. The [iPhone probe](../ios/README.md) does not establish native Quo calling support.

The repository had previously been public. Restricting it now cannot recall copies that another person may already have obtained. The private business labels found during this review were in local, unpushed commits.
