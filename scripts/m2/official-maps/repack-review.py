"""Add a complete in-page review viewer without changing the accepted R5 package."""
import argparse
import base64
import hashlib
import html
import io
import json
import pathlib
import shutil
import zipfile
from PIL import Image


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--inline', type=pathlib.Path, required=True)
    parser.add_argument('--resume', action='store_true', help='Verify and reuse an incomplete owned copy.')
    args = parser.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    if (output.exists() and not args.resume) or output.is_relative_to(source) or source.is_relative_to(output):
        raise ValueError('Use a new output directory outside the immutable source package.')
    if args.resume and ((output / 'index.html').exists() or (output / 'repack-receipt.json').exists()):
        raise ValueError('Do not resume over a completed review viewer.')
    here = pathlib.Path(__file__).resolve().parent
    manifest_bytes = (source / 'review-manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    pages = list({row['file']: row for row in manifest['pages']}.values())
    assert any(row['file'] == manifest['entry'] for row in pages)
    output.mkdir(parents=True, exist_ok=args.resume)
    for row in pages:
        file = source / row['file']
        if not file.resolve().is_relative_to(source):
            raise ValueError(f'Page outside review directory: {file}')
        data = file.read_bytes()
        if digest(data) != row['sha256']:
            raise ValueError(f'Immutable page hash mismatch: {file}')
        target = output / row['file']
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            if digest(target.read_bytes()) != row['sha256']:
                raise ValueError('Existing partial copy does not match its immutable source.')
        else:
            target.write_bytes(data)
    copied_manifest = output / 'review-manifest.json'
    if copied_manifest.exists():
        assert copied_manifest.read_bytes() == manifest_bytes
    else:
        copied_manifest.write_bytes(manifest_bytes)
    pictures, pixel_checks = {}, []
    for owner in ['red', 'blue']:
        row = next(row for row in manifest['records'] if row['page'] == 'pages/edges-ctairp.shp.html'
                   and row['density'] == 2 and f'-{owner}-' in row['file'])
        original = pathlib.Path(row['file']).read_bytes()
        if digest(original) != row['sha256']:
            raise ValueError('Airport source PNG no longer matches the reviewed bytes.')
        image = Image.open(io.BytesIO(original)).convert('RGBA')
        buffer = io.BytesIO()
        image.save(buffer, format='WEBP', lossless=True, method=6, exact=True)
        encoded = buffer.getvalue()
        decoded = Image.open(io.BytesIO(encoded)).convert('RGBA')
        assert image.size == decoded.size and image.tobytes() == decoded.tobytes()
        pictures[owner] = 'data:image/webp;base64,' + base64.b64encode(encoded).decode('ascii')
        pixel_checks.append({'owner': owner, 'sourceSha256': row['sha256'], 'webpSha256': digest(encoded),
                             'width': image.width, 'height': image.height, 'allRgbaPixelsIdentical': True})

    def populate(template):
        # Store the red picture once: the initially visible image supplies its data URL.
        data = json.dumps({'blue': pictures['blue']}, separators=(',', ':'))
        template = template.replace('__AIRPORT_RED__', pictures['red']).replace('__AIRPORT_PICTURES__', data)
        return template

    options = ['<option value="overview">Airport overview · red and blue · 2X</option>']
    for prefix, label in [('pages/edges-', 'All map-building resources · 2X and 4X'),
                          ('pages/native-', 'Native match states · 2X and 4X')]:
        options.append(f'<optgroup label="{html.escape(label)}">')
        for row in manifest['pages']:
            if not row['file'].startswith(prefix):
                continue
            name = pathlib.Path(row['file']).stem.removeprefix('edges-').removeprefix('native-')
            options.append(f'<option value="{html.escape(row["file"])}">{html.escape(name)}</option>')
        options.append('</optgroup>')
    assert sum('<option ' in option for option in options) == len(pages)
    index = populate((here / 'repack-review-template.html').read_text())
    index = index.replace('__PAGE_OPTIONS__', '\n'.join(options))
    index = index.replace("const pictures = JSON.parse(document.getElementById('airport-pictures').textContent);",
                          "const pictures = JSON.parse(document.getElementById('airport-pictures').textContent);\n"
                          "  pictures.red = image.src;")
    (output / 'index.html').write_text(index)
    fragment = populate((here / 'repack-airport-inline.html').read_text())
    fragment = fragment.replace("const pictures = JSON.parse(root.querySelector('#m23-airport-pictures').textContent);",
                                "const pictures = JSON.parse(root.querySelector('#m23-airport-pictures').textContent);\n"
                                "  pictures.red = image.src;")
    assert len(fragment.encode()) < 1_000_000
    args.inline.parent.mkdir(parents=True, exist_ok=True)
    args.inline.write_text(fragment)
    shutil.copyfile(here / 'serve-repacked-review.py', output / 'serve-review.py')
    launcher = output / 'Open-Review.command'
    launcher.write_text('#!/bin/bash\nset -e\nreview_dir="$(cd "$(dirname "$0")" && pwd)"\n'
                        'exec /usr/bin/env python3 "$review_dir/serve-review.py" --open\n')
    launcher.chmod(0o755)
    (output / 'README.md').write_text('# M2.3 R5 Complete Review\n\n'
        'Double-click `Open-Review.command` on macOS. The review opens in your browser and works '
        'without an internet connection. Keep the launcher window open while reviewing. '
        'Choose a building or native match state in the selector; comparisons open inside the same page. '
        'Large images scroll at their actual pixel size. The complete original static review is also retained.\n\n'
        'All 350 original HTML pages and 1,359 embedded image occurrences are unchanged. '
        'Only the airport overview uses lossless WebP encoding; every decoded RGBA pixel matches '
        'the original PNG. All detailed pages retain the exact original PNG bytes. '
        'Visual acceptance is pending. Python 3 is required for the launcher.\n')
    receipt = {'schema': 'm2-3-r5-repacked-review-v1', 'status': 'PACKAGED_BROWSER_CHECK_PENDING',
               'sourceManifestSha256': digest(manifest_bytes), 'originalPages': len(pages),
               'originalImageOccurrences': manifest['imageInstances'], 'originalUniqueImages': manifest['uniqueImages'],
               'originalPagesByteIdentical': True, 'airportLosslessPixelChecks': pixel_checks,
               'inlineBytes': args.inline.stat().st_size, 'inPageChoices': len(pages),
               'serverBind': '127.0.0.1', 'externalRequestsRequired': False, 'userAcceptance': False}
    (output / 'repack-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt), flush=True)
    archive = output.parent / (output.name + '.zip')
    if archive.exists():
        raise ValueError('Do not overwrite a prior review archive.')
    with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as bundle:
        for file in sorted(output.rglob('*')):
            if file.is_file():
                bundle.write(file, output.name + '/' + file.relative_to(output).as_posix())
    print(json.dumps({'archive': str(archive), 'bytes': archive.stat().st_size}), flush=True)


if __name__ == '__main__':
    main()
