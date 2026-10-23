"""Verify the unchanged app payload separately from Desktop Finder metadata."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

folder, package_file, output = map(Path, sys.argv[1:4])
package = json.loads(package_file.read_text())
name = sys.argv[4] if len(sys.argv) > 4 else 'Red Alert 2 HD v0.2 R1.app'
source = folder / name
desktop = subprocess.run(['codesign', '--verify', '--deep', '--strict', str(source)], capture_output=True, text=True)
attributes = subprocess.run(['xattr', '-r', str(source)], capture_output=True, text=True, check=True).stdout
root_attributes = [line for line in attributes.splitlines() if 'FinderInfo' in line or 'ResourceFork' in line]
if desktop.returncode:
    assert 'resource fork, Finder information' in desktop.stderr
    assert root_attributes == [f'{source}: com.apple.FinderInfo'], root_attributes
temp = Path(tempfile.mkdtemp(prefix='ra2-m24-signature-', dir='/private/tmp'))
try:
    app = temp / name
    subprocess.run(['ditto', '--norsrc', '--noextattr', str(source), str(app)], check=True)
    verified = 0
    for row in package['files']:
        if not row['file'].startswith(name + '/'):
            continue
        file = temp / row['file']
        if 'link' in row:
            assert file.is_symlink() and str(file.readlink()) == row['link']
        else:
            assert hashlib.sha256(file.read_bytes()).hexdigest() == row['sha256'], row['file']
        verified += 1
    subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
    architecture = subprocess.check_output(['lipo', '-archs', str(app / 'Contents/MacOS/RA2 HD Editions')], text=True).strip()
    assert architecture == 'arm64'
    output.write_text(json.dumps(dict(status='PASS_CLEAN_COPY_DEEP_STRICT_SIGNATURE_AND_EXACT_APP_HASHES',
        checkedEntries=verified, architecture=architecture, desktopStrictReturnCode=desktop.returncode,
        desktopDiagnostic=desktop.stderr.strip(), desktopMetadata=root_attributes,
        explanation='Desktop immediately reattaches FinderInfo to the app root after removal. The exact decoded payload passes strict validation without that metadata; actual Desktop launches also pass. No app/resource bytes are changed.'), indent=2) + '\n')
finally:
    shutil.rmtree(temp)
