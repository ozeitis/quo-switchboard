#!/bin/bash
set -euo pipefail

probe_device="${1:?Pass a booted iPhone simulator UUID}"
probe_root="$(cd -- "$(dirname -- "$0")" && pwd)"
probe_bundle="com.ozeitis.switchboard.calling-probe"

xcodebuild -quiet \
  -project "$probe_root/CallingProbe/CallingProbe.xcodeproj" \
  -scheme CallingProbe -configuration Debug -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$probe_device" \
  -derivedDataPath "$probe_root/.build" CODE_SIGNING_ALLOWED=NO build

xcrun simctl terminate "$probe_device" "$probe_bundle" >/dev/null 2>&1 || true
xcrun simctl install "$probe_device" "$probe_root/.build/Build/Products/Debug-iphonesimulator/CallingProbe.app"
xcrun simctl launch "$probe_device" "$probe_bundle" --probe-callkit
probe_container="$(xcrun simctl get_app_container "$probe_device" "$probe_bundle" data)"

python3 - "$probe_container/Documents/capability-report.json" <<'PY'
import datetime
import json
from pathlib import Path
import sys
import time

report = Path(sys.argv[1])
started = datetime.datetime.now(datetime.timezone.utc)
for attempt in range(30):
    try:
        result = json.loads(report.read_text())
        checked = datetime.datetime.fromisoformat(result['checkedAt'].replace('Z', '+00:00'))
        current = checked >= started - datetime.timedelta(seconds=3)
        if current and result['callKit']['status'] not in ('Not tested', 'Checking CallKit'):
            print(json.dumps(result, indent=2))
            break
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    time.sleep(1)
else:
    raise SystemExit('The probe did not finish. Native calling support is not established.')
PY
