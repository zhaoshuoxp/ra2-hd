"""Independently verify the R5 inventory, embedded PNGs, navigation and R4 preservation."""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path

from PIL import Image
from importlib import util


def read(file):
    return json.loads(file.read_text())


def digest(file):
    value = hashlib.sha256()
    with file.open('rb') as stream:
        while chunk := stream.read(4 * 1024 * 1024):
            value.update(chunk)
    return value.hexdigest()


def verify_inventory(folder, manifest):
    for row in manifest['files']:
        file = folder / row['file']
        assert file.is_relative_to(folder)
        if row.get('type') == 'symlink' or 'link' in row:
            assert file.is_symlink() and os.readlink(file) == row.get('target', row.get('link'))
        else:
            assert not file.is_symlink() and file.stat().st_size == row['bytes']
            assert digest(file) == row['sha256'], row['file']
    return len(manifest['files'])


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('folder', type=Path)
parser.add_argument('previous', type=Path)
parser.add_argument('report', type=Path)
args = parser.parse_args()
assert not args.report.exists()
folder, previous = args.folder.resolve(), args.previous.resolve()
manifest_file = folder / 'M2.3-R5-DELIVERY-MANIFEST.json'
manifest = read(manifest_file)
verified = verify_inventory(folder, manifest)
inventory = {row['file'] for row in manifest['files']}
actual = {str(file.relative_to(folder)) for file in folder.rglob('*')
          if (file.is_file() or file.is_symlink()) and file != manifest_file}
assert actual == inventory, (actual - inventory, inventory - actual)
print(json.dumps(dict(stage='Complete R5 inventory verified', entries=verified)), flush=True)

module_spec = util.spec_from_file_location('review_scan', Path(__file__).with_name('verify-embedded-review.py'))
module = util.module_from_spec(module_spec)
module_spec.loader.exec_module(module)
review_root = folder / 'M2.3-R5-Feedback-Review'
review = read(review_root / 'review-manifest.json')
seen, occurrences, links = set(), 0, 0
for page in review['pages']:
    file = review_root / page['file']
    assert digest(file) == page['sha256'] and file.stat().st_size == page['bytes']
    scan = module.Scan()
    text = file.read_text()
    scan.feed(text)
    assert not scan.scripts and 'max-width:none' in text
    expected = [row for row in review['records'] if row['page'] == page['file']]
    assert len(scan.images) == page['images'] == len(expected)
    for attrs, pin in zip(scan.images, expected):
        assert attrs['src'].startswith('data:image/png;base64,')
        data = base64.b64decode(attrs['src'].split(',', 1)[1], validate=True)
        sha = hashlib.sha256(data).hexdigest()
        assert sha == pin['sha256'] and len(data) == pin['bytes']
        assert (int(attrs['width']), int(attrs['height'])) == (pin['width'], pin['height'])
        if sha not in seen:
            with Image.open(io.BytesIO(data)) as image:
                assert image.format == 'PNG' and image.size == (pin['width'], pin['height'])
                image.verify()
            with Image.open(io.BytesIO(data)) as image:
                image.load()
            seen.add(sha)
        occurrences += 1
    for href in scan.links:
        target = (file.parent / href).resolve()
        assert target.is_relative_to(review_root) and target.is_file(), href
        links += 1
assert occurrences == review['imageInstances'] and len(seen) == review['uniqueImages']
print(json.dumps(dict(stage='All embedded PNGs independently decoded', images=len(seen))), flush=True)

previous_manifest_file = previous / 'M2.3-R4-DELIVERY-MANIFEST.json'
preserved = verify_inventory(previous, read(previous_manifest_file))
receipt = read(folder / 'M2.3-R5-PACKAGE-RECEIPT.json')
original_package_entries = verify_inventory(folder, receipt)
assert receipt['sourceHead'] == manifest['runtimeSourceCommit']
assert manifest['nativeSessions'] == 30 and not manifest['sourceDirtyAtDelivery']
report = dict(schema='m2-3-r5-independent-delivery-verification-v1',
    status='PASS_ALL_DELIVERY_BYTES_EMBEDDED_PIXELS_NAVIGATION_AND_RETAINED_R4',
    folder=str(folder), manifestSha256=digest(manifest_file), verifiedEntries=verified,
    regularFiles=manifest['ordinaryFiles'], symlinks=manifest['symlinks'], bytes=manifest['bytes'],
    pages=len(review['pages']), uniqueEmbeddedImages=len(seen), imageInstances=occurrences,
    navigationLinks=links, previousDeliveryEntriesPreserved=preserved,
    previousDeliveryManifestSha256=digest(previous_manifest_file), nativeSessions=30,
    originalPackageEntriesPreserved=original_package_entries,
    runtimeSourceCommit=manifest['runtimeSourceCommit'], taskCommit=manifest['taskCommit'],
    userAcceptance=False, windows='NOT_RUN', physicalInput='NOT_RUN', mainIntegration=False)
args.report.parent.mkdir(parents=True, exist_ok=True)
args.report.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report), flush=True)
