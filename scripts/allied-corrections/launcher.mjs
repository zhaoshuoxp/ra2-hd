import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export async function writeLauncher(folder) {
    const file=path.join(folder,'Launch Allied Corrections.command');
    await fs.writeFile(file,`#!/bin/bash
set -euo pipefail
review_folder="$(cd -- "$(dirname -- "$0")" && pwd)"
review_profile="$review_folder/Trainer-Review-Profile"
mkdir -p "$review_profile"
registration_tmp="$(/usr/bin/mktemp "$review_profile/resource-registration.XXXXXX")"
trap '/bin/rm -f "$registration_tmp"' EXIT
/usr/bin/printf '%s\\n' '{"schemaVersion":1}' > "$registration_tmp"
/usr/bin/plutil -insert directory -string "$review_folder/RA2-HD-Editions-Resources" "$registration_tmp"
/usr/bin/plutil -convert json "$registration_tmp"
/bin/mv -f "$registration_tmp" "$review_profile/resource-registration.json"
export RA2_DESKTOP_USER_DATA="$review_profile"
export RA2_DESKTOP_NO_DISCOVERY=1
exec "$review_folder/RA2 HD Allied Corrections.app/Contents/MacOS/RA2 HD Editions" "$@"
`);
    await fs.chmod(file,0o755);
    execFileSync('/bin/bash',['-n',file]);
    return file;
}
