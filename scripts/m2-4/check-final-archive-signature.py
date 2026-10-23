"""Verify the signed app decoded from the final ZIP without another full resource copy."""
import argparse
import json
import shutil
import stat
import subprocess
import tempfile
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('archive', type=Path)
parser.add_argument('receipt', type=Path)
args = parser.parse_args()
assert not args.receipt.exists()
output = Path(tempfile.mkdtemp(prefix='m24-final-clean-extract-', dir='/private/tmp'))
app = output / 'Red Alert 2 HD v0.2.app'
extracted_bytes, count = 0, 0
with zipfile.ZipFile(args.archive) as archive:
    prefix = args.archive.stem + '/Red Alert 2 HD v0.2.app/'
    entries = [entry for entry in archive.infolist() if entry.filename.startswith(prefix)]
    assert len(entries) > 100
    for entry in entries:
        relative = Path(entry.filename[len(prefix):])
        assert not relative.is_absolute() and '..' not in relative.parts
        file = app / relative
        file.parent.mkdir(parents=True, exist_ok=True)
        mode = entry.external_attr >> 16
        if stat.S_ISLNK(mode):
            target = archive.read(entry).decode()
            assert (file.parent / target).resolve().is_relative_to(output)
            file.symlink_to(target)
        else:
            with archive.open(entry) as source, file.open('xb') as destination:
                shutil.copyfileobj(source, destination)
            file.chmod(mode & 0o777)
            extracted_bytes += entry.file_size
        count += 1
check = subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(app)], capture_output=True, text=True)
architecture = subprocess.check_output(['/usr/bin/lipo', '-archs', str(app / 'Contents/MacOS/RA2 HD Editions')], text=True).strip()
receipt = dict(status='PASS_CLEAN_ZIP_EXTRACTED_APP_DEEP_STRICT_SIGNATURE' if check.returncode == 0 and architecture == 'arm64' else 'FAIL',
    archive=str(args.archive.resolve()), extractedEntries=count, extractedRegularBytes=extracted_bytes,
    architecture=architecture, signatureExitCode=check.returncode, signatureOutput=check.stdout + check.stderr,
    method='Decode only the app with original Unix modes and internal framework symlinks; complete ZIP payload hashes/CRC are checked separately.',
    temporaryExtract=str(output), temporaryExtractRemoved=False)
if receipt['status'].startswith('PASS_'):
    shutil.rmtree(output)
    receipt['temporaryExtractRemoved'] = not output.exists()
args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
assert receipt['status'].startswith('PASS_')
