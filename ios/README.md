# iPhone calling feasibility

The native calling release gate is **not passed**. This directory contains a small SwiftUI/CallKit capability probe, not an iPhone version of Switchboard.

## Results — October 2, 2026

| Check | Result |
| --- | --- |
| Xcode 27 / Swift 6 simulator build | Pass, with complete concurrency checking |
| Unsigned Release build for a physical iPhone | Pass; signing and device execution remain separate |
| Public Quo API fetched from the iPhone app | Four call operations, all `GET`; no call writes |
| iOS 26.5 simulator / local CallKit request | Provider reset before the request completed |
| iOS 27 simulator / local CallKit request | Rejected: `com.apple.CallKit.error`, code `0` |
| Real Quo Answer and two-way audio | Unverified; no supported voice transport is configured |
| PushKit delivery to a locked iPhone | Unverified |

The [captured reports](results/2026-10-02) contain public API operations and local diagnostic state. They contain no accounts, credentials, caller information, or device identifiers. A provider reset or simulator rejection does not establish that CallKit would fail on a physical iPhone.

## What the probe does

- Fetches Quo's current published `2026-03-30` specification without an API key. Network/parse failures produce an unknown result, never a compatibility pass.
- Creates an actual `CXProvider` and calls `reportNewIncomingCall`. It does not paint an imitation system call screen.
- Labels the request as a local test. Answer fails the action and ends the test because no voice transport is configured. Decline ends only the local test. No real call is placed, and no microphone or push permission is requested.
- Saves `Documents/capability-report.json` in its own sandbox. Live audio and PushKit acceptance stay unverified even if CallKit accepts a local request.

There are no third-party iOS dependencies. The probe uses SwiftUI, Observation, Foundation, and CallKit. Its background declaration includes `voip`; it does not register for or send VoIP pushes.

## Run

Open [CallingProbe.xcodeproj](CallingProbe/CallingProbe.xcodeproj) in Xcode 27, select an iPhone simulator, and Run. The app checks the public API at startup. **Test system call screen** requests the local CallKit test.

For an automatic SDK test, pass a booted simulator's UUID to:

```sh
bash ios/test-simulator.sh SIMULATOR_UUID
```

The script builds, installs, and restarts only `com.ozeitis.switchboard.calling-probe`, then prints its local report. It does not touch the Mac application's workspace profiles. A timeout is a failed/incomplete capability check, not proof of native calling support.

## Gate before building the product

1. Obtain a supported Quo voice SDK or documented client signaling/media integration. An API key for call records and webhooks is insufficient by itself. Public SDK access was not found; private partner access remains unknown.
2. Integrate provider-issued client credentials and authenticated real-call signaling. Add a server to deliver legitimate PushKit calls through APNs, report them immediately to CallKit, and reconcile cancellation/answering elsewhere.
3. On a signed physical iPhone build, receive a real call with the app backgrounded and the device locked. Answer must connect two-way audio, select the receiving workspace, and honor speaker/Bluetooth routes.
4. Repeat for both workspaces, competing calls, network transitions, cancellation, stale pushes, and answered-elsewhere calls. An accepted CallKit request alone cannot pass this gate.

Quo's [API specification](https://openphone-public-api-prod.s3.us-west-2.amazonaws.com/public/openphone-public-api-2026-03-30-prod.json) documents call reads. [Call webhooks](https://www.quo.com/docs/2026-03-30/webhooks-event-payloads) report lifecycle events, including ringing; they do not return a media connection. Apple's [PushKit/CallKit architecture](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit) requires the app to connect to its voice service. Apple owns the system call UI; the service supplies the call.
