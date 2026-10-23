"""Build fully decoded, portable feedback review pages with embedded final pictures."""
import argparse
import base64
import hashlib
import html
import io
import json
import re
from pathlib import Path

from PIL import Image


def sha(data):
    return hashlib.sha256(data).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('native', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--supplement', type=Path)
parser.add_argument('--phase', choices=['r4', 'r5'], default='r4')
parser.add_argument('--audit', type=Path)
args = parser.parse_args()
root = Path(f'.artifacts/m2-3/feedback-{args.phase}-v1')
assert json.loads((args.native / 'status.json').read_text())['status'] == (
    'PASS_COPIED_R4_NATIVE_REOPENED_CASES' if args.phase == 'r4' else 'PASS_COPIED_R5_CHANGED_BUILDING_CASES')
completed = json.loads((args.native / 'completed.json').read_text())
if args.supplement:
    status = json.loads((args.supplement / 'status.json').read_text())
    assert status['status'] == 'PASS_COPIED_R4_CIVIL_OWNER_CASES'
    completed.extend(json.loads((args.supplement / 'completed.json').read_text()))
args.output.mkdir(parents=True, exist_ok=False)
(args.output / 'pages').mkdir()
records, pages, sections, previews = [], [], [], []
entry = f'M2.3-{args.phase.upper()}-REVIEW-EMBEDDED.html'
style = ('body{background:#15191d;color:#e9edf0;font:20px/1.5 system-ui;margin:28px;}'
         'h1{font-size:36px}h2{font-size:28px}summary{cursor:pointer;padding:12px;}'
         'details{border:1px solid #48505a;margin:12px 0;border-radius:6px;}'
         'figure{margin:24px 0}figcaption{font-size:20px;margin-bottom:8px;}'
         '.picture{overflow:auto}img{display:block;width:auto;height:auto;max-width:none;}'
         'a{color:#9acaff}li{margin:8px 0}')


def figure(file, title, category, density, page_name):
    data = file.read_bytes()
    picture = Image.open(io.BytesIO(data))
    picture.load()
    assert picture.format == 'PNG'
    width, height = picture.size
    records.append(dict(file=str(file.resolve()), sha256=sha(data), bytes=len(data),
                        width=width, height=height, category=category, density=density, page=page_name))
    encoded = base64.b64encode(data).decode('ascii')
    return (f'<figure><figcaption>{html.escape(title)}</figcaption><div class="picture">'
            f'<img src="data:image/png;base64,{encoded}" width="{width}" height="{height}" '
            f'alt="{html.escape(title)}" loading="lazy"></div></figure>')


def write_page(name, title, content, back=True):
    nav = f'<p><a href="../{entry}">Return to review</a></p>' if back else ''
    document = ('<!doctype html><html lang="en"><meta charset="utf-8">'
                '<meta name="viewport" content="width=device-width,initial-scale=1">'
                f'<title>{html.escape(title)}</title><style>{style}</style>'
                f'{nav}<h1>{html.escape(title)}</h1>{content}</html>')
    file = args.output / name
    file.write_text(document)
    page_records = [record for record in records if record['page'] == name]
    sources = re.findall(r'<img\s[^>]*src="([^"]+)"', document)
    assert len(sources) == len(page_records)
    assert '<script' not in document.lower()
    for source, record in zip(sources, page_records):
        assert source.startswith('data:image/png;base64,')
        data = base64.b64decode(source.split(',', 1)[1], validate=True)
        assert sha(data) == record['sha256']
        decoded = Image.open(io.BytesIO(data))
        decoded.load()
        assert decoded.size == (record['width'], record['height'])
    pages.append(dict(file=name, sha256=sha(file.read_bytes()), bytes=file.stat().st_size,
                      images=len(page_records)))


for slug, title, pattern in ([
    ('owner', 'Owner colors: native and HD', 'owner-review-*-*x-v1'),
    ('material', 'Cleaner building materials: actual 2X and 4X', 'material-review-*x-v3'),
    ('bridge', 'Wood bridges: normal and damaged', 'bridge-review-*x-v1'),
] if args.phase == 'r4' else []):
    groups = {}
    for folder in sorted(root.glob(pattern)):
        index = json.loads((folder / 'index.json').read_text())
        rows = index if isinstance(index, list) else index['records']
        for row in rows:
            color = ('Blue' if row['ownerColor'][2] > row['ownerColor'][0] else 'Red') if row.get('ownerColor') else None
            label = f"{row['member']} / {color + ' owner / ' if color else ''}{row['density']}X"
            groups.setdefault(row['member'], []).append((Path(row['file']), label, row['density']))
    links = []
    for member, pictures in sorted(groups.items()):
        name = f'pages/{slug}-{member}.html'
        content = '<p>All pictures are embedded. Native display dimensions are retained; large pictures scroll horizontally.</p>'
        for file, label, density in pictures:
            content += figure(file, label, title, density, name)
            if (slug, member, density) in [('owner', 'cttexs08.shp', 2), ('material', 'ctairp.shp', 2),
                                          ('material', 'ctbarn02.shp', 2), ('bridge', 'ovrpsb02.tem', 2)]:
                if not any(item[0] == slug + member for item in previews):
                    previews.append((slug + member, file, label, title, density))
        write_page(name, member, content)
        links.append(f'<li><a href="{html.escape(name)}">{html.escape(member)}</a></li>')
    sections.append(f'<section><h2>{title}</h2><ul>{"".join(links)}</ul></section>')

if args.phase == 'r5':
    assert args.audit
    audit = json.loads(args.audit.read_text())
    assert audit['status'] == 'PASS_ALL_NATIVE_BUILDING_STATES_SUBPIXEL_COVERAGE'
    groups = {}
    for row in audit['pictures']:
        groups.setdefault(row['member'], []).append(row)
    links = []
    for member, pictures in sorted(groups.items()):
        name = f'pages/edges-{member}.html'
        content = ('<p>Actual-density Original and HD comparisons. Each owner layer uses the native palette. '
                   'Large pictures scroll without image resizing.</p>')
        for row in pictures:
            file = Path(row['file'])
            assert sha(file.read_bytes()) == row['sha256']
            label = f'{member} / frames {row["frames"]} / {row["ownerColor"]} / {row["density"]}X'
            content += figure(file, label, 'Structural edges and single lettering', row['density'], name)
            if member == 'ctairp.shp' and row['density'] == 2 and row['ownerColor'] == 'red':
                previews.append(('airport', file, label, 'Airport repaired', 2))
        write_page(name, member, content)
        links.append(f'<li><a href="{html.escape(name)}">{html.escape(member)}</a></li>')
    sections.append(f'<section><h2>All changed map-building states</h2><ul>{"".join(links)}</ul></section>')

native_files = set()
for case in completed:
    case_root = Path(case['output'])
    for pattern in ['*-native-detail.png', '*-player-hd.png', '*-enemy-hd.png',
                    '*-player-original.png', '*-enemy-original.png',
                    '*m2-3-r4-set80-framebuffer.png', 'wood-bridge-*-framebuffer.png']:
        native_files.update(case_root.glob(pattern))
assert native_files
case_groups = {}
for file in sorted(native_files):
    label = file.name.replace('-native-detail.png', '').replace('-framebuffer.png', '').replace('.png', '')
    identifier = file.name.split('-', 1)[0] if file.name.endswith('-native-detail.png') or re.match(r'.+-(player|enemy)-(hd|original)\.png$', file.name) else label
    case_groups.setdefault(file.parent.name, {}).setdefault(identifier, []).append((file, label))
links = []
for case, groups in sorted(case_groups.items()):
    children = []
    density = 2 if case.endswith('-2x') else 4
    for identifier, pictures in sorted(groups.items()):
        name = f'pages/native-{case}-{identifier}.html'
        content = ('<p>Copied Mac application evidence. Detail crops retain source pixels; full framebuffers retain '
                   'their recorded size. Controlled legal fixtures and native transitions are disclosed in the handoff.</p>')
        content += ''.join(figure(file, label, 'Copied Mac native evidence', density, name) for file, label in pictures)
        write_page(name, f'{case} / {identifier}', content)
        children.append(f'<li><a href="{html.escape(name)}">{html.escape(identifier)}</a></li>')
    links.append(f'<details><summary>{html.escape(case)}</summary><ul>{"".join(children)}</ul></details>')
sections.append(f'<section><h2>Copied Mac native evidence</h2>{"".join(links)}</section>')
content = (('<p>Review the repaired owner colors, cleaner building materials and wooden bridges at both densities. '
           'Owner comparisons show Original and HD in blue and red, retaining the original colored areas and their width.</p>'
           if args.phase == 'r4' else
           '<p>Airport tower lettering now renders once. Straight and curved structural boundaries use subpixel '
           'coverage instead of enlarged pixel stairs. Owner strips retain native painted area and all sixteen shades. '
           'The original occupied airport state retains its fixed red lettering.</p>') +
           '<p>Every picture is embedded directly in its page. Keep this review directory together for offline navigation. '
           'Pages are separated by building and state so large images load only when opened.</p>'
           '<p>The remaining accepted M2.3 work is retained. The complete copied Mac app includes all selected resources. '
           'Static and copied Mac technical checks pass; your visual acceptance of these repairs is pending. '
           'Windows and physical input remain NOT_RUN. Historical native map availability exceptions are retained.</p>')
if args.phase == 'r5':
    content += ('<section><h2>Airport: repaired lettering and edges</h2>'
                '<p><a href="pages/edges-ctairp.shp.html">Open all airport states in red and blue at 2X and 4X</a></p>')
else:
    content += ''.join(sections) + '<section><h2>Embedded examples at 2X</h2>'
for _, file, label, category, density in previews:
    content += figure(file, label, category, density, entry)
content += '</section>'
if args.phase == 'r5':
    content += ''.join(sections)
write_page(entry, f'M2.3 {args.phase.upper()} Feedback Review', content, back=False)
for page in pages:
    for link in re.findall(r'href="([^"]+)"', (args.output / page['file']).read_text()):
        assert (args.output / page['file']).parent.joinpath(link).resolve().is_file()
manifest = dict(schema='m2-3-feedback-embedded-review-v2',
    status='PASS_ALL_EMBEDDED_PNG_BYTES_DIMENSIONS_AND_FULL_DECODING',
    entry=entry, htmlSha256=sha((args.output / entry).read_bytes()), pages=pages,
    imageInstances=len(records), uniqueImages=len({record['sha256'] for record in records}),
    records=records, maxPageBytes=max(page['bytes'] for page in pages),
    portableReviewDirectory=True, externalImages=False, scripts=False,
    browserRendered=False, userAcceptance=False)
(args.output / 'review-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({key: value for key, value in manifest.items() if key not in ['records', 'pages']}
                 | dict(pageCount=len(pages))))
