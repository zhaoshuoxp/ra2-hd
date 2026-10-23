"""Create an additive review with exact PNG bytes embedded in static HTML."""
import argparse
import base64
import hashlib
import html
import json
import pathlib
import re
import struct
from collections import defaultdict


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load(file):
    return json.loads(file.read_text())


def save(file, data):
    file.write_text(json.dumps(data, indent=2) + '\n')


def esc(value):
    return html.escape(str(value), quote=True)


def document(title, body):
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>{esc(title)}</title><style>
body{{margin:24px;background:#17191b;color:#eee;font:20px/1.5 system-ui}}
h1{{font-size:34px;margin:0 0 12px}}h2{{font-size:26px}}a{{color:#b9d8ff}}
p{{max-width:1100px}}nav{{display:flex;gap:20px;flex-wrap:wrap;margin:18px 0}}
article{{border-top:1px solid #555;padding:16px 0}}.image{{overflow:auto;max-height:900px;margin:12px 0;background:#202225}}
img{{display:block;width:auto;height:auto;max-width:none;max-height:none}}
small{{font-size:16px;color:#ccc;overflow-wrap:anywhere}}table{{border-collapse:collapse}}
td,th{{text-align:left;vertical-align:top;padding:10px 18px 10px 0;border-bottom:1px solid #444}}
</style></head><body>{body}</body></html>\n'''


def card(row, source):
    encoded = base64.b64encode((source / row['source']).read_bytes()).decode('ascii')
    receipt = f'<p><a href="{esc(row["receipt"])}">Native receipt</a></p>' if row.get('receipt') else ''
    return f'''<article><h2>{esc(row['label'])} / {row['density']}X</h2>
<small>{row['width']} × {row['height']} pixels; actual display size</small>{receipt}
<div class="image"><img src="data:image/png;base64,{encoded}" width="{row['width']}" height="{row['height']}" alt="{esc(row['label'])} at {row['density']}X" data-source="{esc(row['source'])}" data-sha256="{row['sha256']}" data-density="{row['density']}"></div></article>'''


def chunks(rows):
    current, size, pixels = [], 0, 0
    for row in rows:
        area = row['width'] * row['height']
        if current and (len(current) >= 8 or size + row['bytes'] > 8 * 1024 ** 2 or pixels + area > 16_000_000):
            yield current
            current, size, pixels = [], 0, 0
        current.append(row)
        size += row['bytes']
        pixels += area
    if current:
        yield current


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    if output.exists() or output.is_relative_to(source):
        raise ValueError('Use a new output directory outside the immutable source package.')
    manifest_path = source / 'M2.3-DELIVERY-MANIFEST.json'
    manifest_data = manifest_path.read_bytes()
    manifest = json.loads(manifest_data)
    pins = {item['file']: item for item in manifest['files']}
    inputs, rows = {}, []

    def pinned(relative):
        file = source / relative
        if not file.resolve().is_relative_to(source):
            raise ValueError(f'Source outside package: {relative}')
        data = file.read_bytes()
        if digest(data) != pins[relative]['sha256']:
            raise ValueError(f'Source hash mismatch: {relative}')
        inputs[relative] = {'file': relative, 'sha256': digest(data), 'bytes': len(data)}
        return data

    def image(relative, group, title, label, density, receipt=None):
        data = pinned(relative)
        if data[:8] != b'\x89PNG\r\n\x1a\n':
            raise ValueError(f'Expected original PNG: {relative}')
        width, height = struct.unpack('>II', data[16:24])
        row = {'source': relative, 'group': group, 'groupTitle': title, 'label': label,
               'density': int(density), 'sha256': digest(data), 'bytes': len(data),
               'width': width, 'height': height}
        if receipt:
            row['receipt'] = receipt
        rows.append(row)

    text = pinned('M2.3-Grouped-Review/index.html').decode()
    review = json.loads(text.split('<script>const review=', 1)[1].split(';const kinds=', 1)[0])
    for family in review['families']:
        for member in family['members']:
            for density, item in member['images'].items():
                image('M2.3-Grouped-Review/' + item['file'], 'environment-' + family['kind'],
                      'Environment: ' + family['kind'].title(), member['member'], density)
                assert rows[-1]['sha256'] == item['sha256']
    text = pinned('M2.3-Grouped-Review/terrain.html').decode()
    terrain = json.loads(text.split('<script>const records=', 1)[1].split(';const sets=', 1)[0])
    for item in terrain:
        image('M2.3-Grouped-Review/' + item['file'], f'terrain-{item["setIndex"]:02}',
              f'Terrain {item["setIndex"]}: {item["setName"]}', item['member'], item['density'])
    native = json.loads(pinned('M2.3-NATIVE-REVIEW-INDEX.json'))
    receipts = {}
    for item in native['images']:
        density = re.search(r'-(2|4)x-', item['file']).group(1)
        receipt = 'receipts/' + item['report']
        receipts[receipt] = item['report']
        image(item['file'], 'native-states', 'Native match states',
              pathlib.Path(item['file']).stem.replace('-', ' '), density, receipt)
        assert rows[-1]['sha256'] == item['sha256']
    assert len(rows) == 631 and len({row['source'] for row in rows}) == 631
    output.mkdir(parents=True)
    for target, relative in receipts.items():
        data = pinned(relative)
        file = output / target
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(data)
    for relative in ['M2.3-COVERAGE.json', 'M2.3-PERFORMANCE.json', 'M2.3-HANDOFF.md']:
        (output / relative).write_bytes(pinned(relative))

    groups = defaultdict(list)
    for row in rows:
        groups[row['group']].append(row)
    pages, group_index = [], []
    for group, members in groups.items():
        title = members[0]['groupTitle']
        by_density = {d: list(chunks([row for row in members if row['density'] == d])) for d in [2, 4]}
        files = {d: [f'{group}-{d}x-{i + 1:02}.html' for i in range(len(parts))]
                 for d, parts in by_density.items()}
        group_index.append({'group': group, 'title': title, 'images': len(members), 'files': files})
        for density, parts in by_density.items():
            for i, part in enumerate(parts):
                filename = files[density][i]
                links = ['<a href="M2.3-REVIEW-EMBEDDED.html">Review overview</a>',
                         f'<a href="{files[6 - density][0]}">{6 - density}X</a>']
                if i:
                    links.append(f'<a href="{files[density][i - 1]}">Previous page</a>')
                if i + 1 < len(parts):
                    links.append(f'<a href="{files[density][i + 1]}">Next page</a>')
                body = (f'<h1>{esc(title)} / {density}X</h1><p>Page {i + 1} of {len(parts)}. '
                        'Images retain their original pixels and display size. Scroll inside large images.</p>'
                        '<nav>' + ''.join(links) + '</nav>' + ''.join(card(row, source) for row in part))
                (output / filename).write_text(document(title, body))
                pages.append({'file': filename, 'images': [row['source'] for row in part]})

    examples = [next(row for row in rows if row['source'].endswith(suffix)) for suffix in [
        'native-eb2-states-2x-v1/CANEWY21-occupied-native-detail.png',
        'environment/environment-crater12/crater12.tem-2x.png',
        'terrain-2x/wcave01.tem-2x.png']]
    tables = ''
    for prefix, title in [('environment-', 'Environment families'), ('terrain-', 'Terrain sets'), ('native-', 'Native match evidence')]:
        entries = [item for item in group_index if item['group'].startswith(prefix)]
        lines = ''.join(f'<tr><th>{esc(item["title"])}</th>' + ''.join(
            f'<td><a href="{item["files"][d][0]}">{d}X: {len(item["files"][d])} page(s)</a></td>'
            for d in [2, 4]) + '</tr>' for item in entries)
        tables += f'<section><h2>{title}</h2><table>{lines}</table></section>'
    body = '''<h1>M2.3 Temperate Review</h1>
<p>140 new environment families and 151 new terrain members. Review both densities at their actual display size. User visual acceptance is pending.</p>
<nav><a href="#groups">All review groups</a><a href="environment-building-2x-01.html">Buildings 2X</a><a href="environment-smudge-2x-01.html">Ground decals 2X</a><a href="terrain-80-2x-01.html">Wood bridges 2X</a><a href="M2.3-COVERAGE.json">Coverage and exceptions</a></nav>'''
    body += ''.join(card(row, source) for row in examples) + '<div id="groups">' + tables + '</div>'
    entry = 'M2.3-REVIEW-EMBEDDED.html'
    (output / entry).write_text(document('M2.3 Temperate Embedded Review', body))
    pages.append({'file': entry, 'images': [row['source'] for row in examples]})
    (output / 'START-HERE.md').write_text(
        '# M2.3 embedded review\n\n'
        'Open `M2.3-REVIEW-EMBEDDED.html`. Every review page contains its PNG image bytes directly; '
        'image folders, JavaScript, a local server and a network connection are unnecessary. '
        'Navigation between groups requires keeping these HTML pages together. Each individual '
        'page retains its images if copied alone. Both densities and all 631 original review images '
        'are included without recompression, cropping or resizing. Large images scroll at native size.\n\n'
        f'This additive review accompanies the unchanged application and resources in `{source}`. '
        'It supersedes the external-image review entry for portable viewing only. Runtime validation '
        'and visual acceptance retain their existing separate status. Visual acceptance remains pending.\n')
    files = [{'file': str(file.relative_to(output)), 'bytes': file.stat().st_size,
              'sha256': digest(file.read_bytes())} for file in sorted(output.rglob('*')) if file.is_file()]
    save(output / 'EMBEDDED-REVIEW-MANIFEST.json', {
        'schema': 'm2-3-embedded-review-v1', 'status': 'EMBEDDED_REVIEW_BUILT_VALIDATION_PENDING',
        'sourcePackage': str(source), 'sourceDeliveryManifestSha256': digest(manifest_data),
        'runtimeSourceCommit': manifest['runtimeSourceCommit'], 'originalTaskHead': manifest['taskHead'],
        'entry': entry, 'uniqueImages': len(rows), 'staticImages': 612, 'nativeImages': 19,
        'imageOccurrences': sum(len(page['images']) for page in pages), 'htmlPages': pages,
        'groups': group_index, 'images': rows, 'sourceInputs': list(inputs.values()), 'files': files,
        'sourcePackageModified': False, 'artworkModified': False, 'applicationModified': False,
        'visualAcceptance': 'PENDING', 'manifestSelfExclusion': True})
    print(json.dumps({'folder': str(output), 'uniqueImages': len(rows), 'pages': len(pages),
                      'entry': str(output / entry), 'bytes': sum(item['bytes'] for item in files)}))


if __name__ == '__main__':
    main()
