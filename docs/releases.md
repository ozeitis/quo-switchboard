# Releases and signing

## Preview distribution

The default build produces Apple Silicon and Intel DMGs and ZIPs. Applications are ad-hoc signed (`identity: '-'`) with hardened runtime enabled. No private Apple signing identity is embedded in the repository.

The preview entitlement allows Electron's differently signed libraries to load. When moving to Developer ID, sign nested code consistently, remove the library-validation exception, and test the complete bundle again.

Ad-hoc signing verifies local code integrity but does not prove publisher identity. It is not Apple notarization. A self-signed certificate likewise does not automatically make Gatekeeper trust a downloaded app. Preview installation may require the macOS **Open Anyway** flow.

Current Electron uses macOS UserNotifications and requires signing for native notification delivery. Ad-hoc build behavior still needs verification on each supported macOS release. A real Developer ID identity and notarization are the proper distribution path when broad, frictionless installation is required.

## Build locally

```sh
npm ci
npm run check
npm run test:desktop
npm run dist -- --arm64 --x64
node scripts/checksums.mjs
npm sbom --sbom-format cyclonedx > release/sbom.cdx.json
```

The DMGs, ZIPs, and `SHA256SUMS` are placed in `release/`. On macOS, verify a downloaded file with `shasum -a 256 filename.dmg` and compare it to the published checksum. A checksum confirms file equality; it is not independent proof of a publisher’s identity.

## CI

Pull requests run type, unit, and desktop tests on macOS. Version tags run the same tests, build both architectures, generate an inventory and checksums, and create a **draft prerelease**. Review the artifacts and field-test status before making a release public. Workflow actions are pinned to reviewed commit SHAs. Normal builds do not need release credentials.

GitHub build provenance is generated for the CI-produced DMGs and ZIPs. A binary built locally is not covered by that CI attestation. Build outputs are not claimed to be byte-for-byte reproducible; signing and archive metadata can vary.

## Developer ID distribution later

Supply a Developer ID Application certificate through the build environment, override `mac.identity`, configure notarization credentials using electron-builder’s supported environment variables, and enable `mac.notarize`. Do not commit certificates or credentials. Verify the result with `codesign --verify --deep --strict`, `spctl --assess`, and the notarization ticket before changing the release’s signing claim.

Signed automatic updates are a separate feature. Current releases are installed manually by replacing the app bundle; user profiles are stored outside that bundle.

References: [Electron notifications](https://www.electronjs.org/docs/latest/api/notification), [Electron signing](https://www.electronjs.org/docs/latest/tutorial/code-signing), [Apple Gatekeeper](https://support.apple.com/en-us/102445).
