#!/bin/bash
set -euo pipefail
TASK_REVIEW_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
export RA2_DESKTOP_USER_DATA="$TASK_REVIEW_DIR/Review-Profile"
export RA2_DESKTOP_NO_DISCOVERY=1
mkdir -p -- "$RA2_DESKTOP_USER_DATA"
TASK_REVIEW_REGISTRATION="$RA2_DESKTOP_USER_DATA/resource-registration.json"
/usr/bin/plutil -create xml1 "$TASK_REVIEW_REGISTRATION"
/usr/bin/plutil -insert schemaVersion -integer 1 "$TASK_REVIEW_REGISTRATION"
/usr/bin/plutil -insert directory -string "$TASK_REVIEW_DIR/RA2-HD-Editions-Resources" "$TASK_REVIEW_REGISTRATION"
/usr/bin/plutil -convert json "$TASK_REVIEW_REGISTRATION"
cd /private/tmp
exec "$TASK_REVIEW_DIR/Red Alert 2 HD Dual Edition R5.app/Contents/MacOS/RA2 HD Editions" "$@"
