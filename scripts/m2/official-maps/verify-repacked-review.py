"""Verify the portable review archive and its allowlisted local HTTP routes."""
import argparse
import hashlib
import json
import pathlib
import urllib.error
import urllib.request
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=pathlib.Path, required=True)
    parser.add_argument('--url', required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    root = args.root.resolve()
    if not args.url.startswith('http://127.0.0.1:'):
        raise ValueError('This verifier accepts only the local review server.')
    manifest = json.loads((root / 'review-manifest.json').read_text())
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for row in manifest['pages']:
        with opener.open(args.url.rstrip('/') + '/' + row['file'], timeout=10) as response:
            assert response.status == 200
            assert int(response.headers['Content-Length']) == (root / row['file']).stat().st_size
    for relative in ['/serve-review.py', '/review-manifest.json', '/../AGENTS.md', '/%2e%2e/AGENTS.md']:
        try:
            opener.open(args.url.rstrip('/') + relative, timeout=5)
        except urllib.error.HTTPError as error:
            assert error.code == 404
        else:
            raise AssertionError(relative)
    archive = root.parent / (root.name + '.zip')
    with zipfile.ZipFile(archive) as bundle:
        for row in manifest['pages']:
            with bundle.open(root.name + '/' + row['file']) as source:
                assert hashlib.file_digest(source, 'sha256').hexdigest() == row['sha256'], row['file']
        for name in ['index.html', 'Open-Review.command', 'serve-review.py', 'README.md',
                     'review-manifest.json', 'repack-receipt.json']:
            assert bundle.read(root.name + '/' + name) == (root / name).read_bytes(), name
        mode = bundle.getinfo(root.name + '/Open-Review.command').external_attr >> 16
        assert mode & 0o111 == 0o111
    with archive.open('rb') as source:
        archive_hash = hashlib.file_digest(source, 'sha256').hexdigest()
    receipt = {'schema': 'm2-3-r5-repack-verification-v1',
               'status': 'PASS_ALL_350_LOCAL_ROUTES_AND_ARCHIVED_ORIGINAL_PAGES',
               'routes': len(manifest['pages']), 'archivedOriginalPages': len(manifest['pages']),
               'imageOccurrences': manifest['imageInstances'], 'uniqueImages': manifest['uniqueImages'],
               'archiveBytes': archive.stat().st_size, 'archiveSha256': archive_hash,
               'limitedServerPaths': True, 'originalPagesByteIdentical': True, 'userAcceptance': False}
    args.output.write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
