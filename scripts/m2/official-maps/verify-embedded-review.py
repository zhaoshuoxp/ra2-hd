"""Verify embedded PNG bytes, static navigation and immutable source preservation."""
import argparse
import base64
import hashlib
import io
import json
import os
import pathlib
from html.parser import HTMLParser

from PIL import Image


def digest(file):
    result = hashlib.sha256()
    with file.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            result.update(chunk)
    return result.hexdigest()


class Scan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images, self.links, self.ids = [], [], set()
        self.scripts = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'img':
            self.images.append(attrs)
        if tag == 'a':
            self.links.append(attrs['href'])
        if tag == 'script':
            self.scripts += 1
        if 'id' in attrs:
            self.ids.add(attrs['id'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder', type=pathlib.Path, required=True)
    parser.add_argument('--report', type=pathlib.Path, required=True)
    args = parser.parse_args()
    root, report_file = args.folder.resolve(), args.report.resolve()
    final_report = root / 'EMBEDDED-REVIEW-VALIDATION.json'
    if report_file.exists() or final_report.exists():
        raise ValueError('Preserve prior receipts; use a new review version for new validation.')
    manifest_file = root / 'EMBEDDED-REVIEW-MANIFEST.json'
    manifest = json.loads(manifest_file.read_text())
    source = pathlib.Path(manifest['sourcePackage'])
    delivery = source / 'M2.3-DELIVERY-MANIFEST.json'
    assert digest(delivery) == manifest['sourceDeliveryManifestSha256']
    original = json.loads(delivery.read_text())
    pins = {item['file']: item for item in original['files']}
    sources = {row['source']: row for row in manifest['images']}
    for row in sources.values():
        assert row['sha256'] == pins[row['source']]['sha256']
    for item in manifest['files']:
        file = root / item['file']
        assert file.stat().st_size == item['bytes']
        assert digest(file) == item['sha256'], item['file']
    print(json.dumps({'stage': 'Output file hashes verified'}), flush=True)

    seen, pages, occurrences = set(), [], 0
    for page in manifest['htmlPages']:
        file = root / page['file']
        text, scan = file.read_text(), Scan()
        scan.feed(text)
        assert not scan.scripts
        assert 'img{display:block;width:auto;height:auto;max-width:none;max-height:none}' in text
        assert len(scan.images) == len(page['images'])
        for attrs, expected in zip(scan.images, page['images']):
            assert attrs['src'].startswith('data:image/png;base64,')
            assert attrs['data-source'] == expected
            data = base64.b64decode(attrs['src'].split(',', 1)[1], validate=True)
            pin = sources[expected]
            assert hashlib.sha256(data).hexdigest() == pin['sha256'] == attrs['data-sha256']
            assert len(data) == pin['bytes']
            if expected not in seen:
                with Image.open(io.BytesIO(data)) as image:
                    assert image.size == (pin['width'], pin['height'])
                    image.verify()
                with Image.open(io.BytesIO(data)) as image:
                    image.load()
                seen.add(expected)
            assert (int(attrs['width']), int(attrs['height'])) == (pin['width'], pin['height'])
            occurrences += 1
        for href in scan.links:
            if href.startswith('#'):
                assert href[1:] in scan.ids
            else:
                target = (file.parent / href).resolve()
                assert target.is_relative_to(root) and target.is_file(), href
        pages.append({'file': page['file'], 'embeddedImages': len(scan.images),
                      'links': len(scan.links), 'scripts': scan.scripts, 'bytes': file.stat().st_size})
        if len(pages) % 40 == 0:
            print(json.dumps({'stage': 'Embedded PNGs decoded', 'pages': len(pages), 'images': len(seen)}), flush=True)
    assert len(seen) == 631 and occurrences == 634
    print(json.dumps({'stage': 'All embedded images verified; checking original package'}), flush=True)
    preserved, size = 0, 0
    for item in original['files']:
        file = source / item['file']
        if 'link' in item:
            assert file.is_symlink() and os.readlink(file) == item['link']
        else:
            assert file.stat().st_size == item['bytes']
            assert digest(file) == item['sha256'], item['file']
            size += item['bytes']
        preserved += 1
    assert preserved == 8274
    report = {
        'schema': 'm2-3-embedded-review-qa-v2',
        'status': 'PASS_ALL_631_EXACT_EMBEDDED_PNGS_AND_8274_PRESERVED_PACKAGE_FILES',
        'folder': str(root), 'manifestSha256': digest(manifest_file),
        'uniqueEmbeddedImages': len(seen), 'imageOccurrences': occurrences, 'htmlPages': len(pages),
        'pages': pages, 'embeddedByteHashes': 'PASS', 'pngStructureAndPixelDecode': 'PASS',
        'explicitNativeDimensions': 'PASS', 'relativeNavigationTargets': 'PASS',
        'javascriptRequired': False, 'externalImageSources': 0,
        'originalPackageFilesPreserved': preserved, 'originalPackageRegularBytes': size,
        'originalPackageManifestSha256': digest(delivery),
        'browserVisualValidation': 'NOT_RUN_LOCAL_FILE_NAVIGATION_BLOCKED_BY_BROWSER_POLICY',
        'applicationChanged': False, 'artworkChanged': False, 'userVisualAcceptance': 'PENDING',
        'supersedesIncompleteReceipt': '.artifacts/m2-3/embedded-review-qa-v1/report.json',
    }
    report_file.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(report, indent=2) + '\n'
    report_file.write_text(encoded)
    final_report.write_text(encoded)
    print(json.dumps({key: value for key, value in report.items() if key != 'pages'}), flush=True)


if __name__ == '__main__':
    main()
