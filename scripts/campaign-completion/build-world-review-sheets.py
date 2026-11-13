"""Inspect current formal artwork and assemble lossless, explicitly labeled review sheets."""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
CONFIG = json.loads(Path(sys.argv[1]).read_text())
OUTPUT = Path(sys.argv[2]).resolve()
OUTPUT.mkdir()
BACKGROUND = (31, 39, 44)


def font(size):
    for name in ['/System/Library/Fonts/Supplemental/Arial.ttf', 'Arial.ttf', 'DejaVuSans.ttf']:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    raise RuntimeError('A readable Arial or DejaVu Sans font is required')


FONT, TITLE = font(26), font(34)


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def pin(file):
    return {'path': str(file), 'bytes': file.stat().st_size, 'sha256': digest(file)}


def verified(file, expected, size=None):
    assert digest(file) == expected, f'Identity mismatch: {file}'
    assert size is None or file.stat().st_size == size, f'Size mismatch: {file}'
    return file


def campaign_payload(campaign, name, expected, size):
    declarations = [item for item in campaign['files'] if item['name'] == name
                    and item['sha256'] == expected and item['bytes'] == size]
    assert len(declarations) == 1, f'A unique source-pinned campaign route is required: {name}'
    route = declarations[0]['route']
    assert route.startswith('/local-campaign/ra2/')
    file = (ROOT / ('.local/campaign/' + route.removeprefix('/local-campaign/'))).resolve()
    assert file.is_relative_to(ROOT / '.local/campaign/ra2')
    return verified(file, expected, size)


def assemble(name, sections):
    cell_width = lambda label, image: max(image.width, int(FONT.getlength(label)) + 8)
    width = max(max(int(TITLE.getlength(heading)) + 48,
                    max(sum(cell_width(label, image) + 24 for label, image in row) + 24 for row in rows))
                for heading, rows in sections)
    height = 24 + sum(64 + sum(max(image.height for _, image in row) + 66 for row in rows)
                            for _, rows in sections)
    sheet = Image.new('RGB', (width, height), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    top = 24
    for heading, rows in sections:
        draw.text((24, top), heading, font=TITLE, fill='white')
        top += 64
        for row in rows:
            left = 24
            for label, image in row:
                draw.text((left, top), label, font=FONT, fill='white')
                sheet.paste(image.convert('RGBA'), (left, top + 44), image.convert('RGBA'))
                left += cell_width(label, image) + 24
            top += max(image.height for _, image in row) + 66
    file = OUTPUT / name
    sheet.save(file)
    return pin(file)


def rows(items, columns):
    return [items[index:index + columns] for index in range(0, len(items), columns)]


def canonical_shp(spec):
    return {key: spec[key] for key in ['schemaVersion', 'source', 'logical', 'color']} | {
        'variants': [{'density': variant['density'], 'frames': variant['frames'],
                      'pages': [{key: value for key, value in page.items() if key not in ['base', 'data']}
                                for page in variant['pages']]} for variant in spec['variants']]}


def native_section(target, density, expected_hash):
    declaration = target['native'][str(density)]
    file = verified(ROOT / declaration['report'], declaration['sha256'])
    report = json.loads(file.read_text())
    assert report['status'].startswith('PASS'), file
    assert expected_hash in json.dumps(report), f'Native evidence does not bind the selected member: {file}'
    items, sources = [], [pin(file)]
    if 'files' in declaration:
        entries = [{'file': name, 'label': name.removesuffix('.png')} for name in declaration['files']]
    else:
        entries = [frame for frame in report['frames']
                   if not target.get('nativeActor') or frame.get('name') == target['nativeActor']]
        for frame in entries:
            frame['label'] = (f"{frame['state']} {frame['heading']} deg" if 'heading' in frame
                              else f"Display {frame['frame']}")
    assert entries, file
    for entry in entries:
        picture = file.parent / entry['file']
        items.append((entry.get('label', entry['file']), Image.open(picture).convert('RGBA')))
        sources.append(pin(picture))
    for name in declaration.get('ownerFiles', []):
        picture = file.parent / name
        items.append((name.removesuffix('.png').replace('diagnostic-owner-', 'Owner '),
                      Image.open(picture).convert('RGBA')))
        sources.append(pin(picture))
    return (f'{density}X retained native diagnostic captures', rows(items, 4)), sources


records = []
for target in CONFIG['targets']:
    receipt_file = ROOT / target['receipt']
    receipt = json.loads(receipt_file.read_text())
    resource = receipt[target['receiptKey']] if target.get('receiptKey') else receipt
    formal, exports, native, inputs = [], [], [], [pin(receipt_file)]
    if target['kind'] == 'shp':
        bundle = resource['bundle']
        assert len(bundle['members']) == 1
        member = bundle['members'][0]
        mission = bundle['mission'].removesuffix('.map')
        directory = ROOT / '.local/campaign/ra2' / mission
        campaign = json.loads((directory / 'manifest.json').read_text())
        for file in resource['files'] + resource.get('reusedImageFiles', []):
            declaration = next(item for item in campaign['files'] if item['route'] == file['route'])
            assert declaration['sha256'] == file['sha256'] and declaration['bytes'] == file['bytes']
            actual = ROOT / ('.local/campaign/' + file['route'].removeprefix('/local-campaign/'))
            verified(actual, file['sha256'], file['bytes'])
            formal.append(pin(actual))
        file = verified(directory / member['manifest'], member['sha256'])
        spec = json.loads(file.read_text())
        native_hash = member['sha256']
        if target.get('equivalentActiveMember'):
            declaration = target['equivalentActiveMember']
            active = verified(ROOT / declaration['path'], declaration['sha256'])
            active_spec = json.loads(active.read_text())
            # A complete active family can wrap the same body with its cloth.
            # Require exact source, geometry, color policy, frame placement and
            # both base/control payload identities; filenames alone do not qualify.
            assert canonical_shp(spec) == canonical_shp(active_spec), 'Active body differs from reviewed member'
            active_campaign = json.loads((active.parent / 'manifest.json').read_text())
            assert any(item['name'] == active.name and item['sha256'] == declaration['sha256']
                       for item in active_campaign['files'])
            formal.append(pin(active))
            for variant in active_spec['variants']:
                source_variant = next(item for item in spec['variants'] if item['density'] == variant['density'])
                for page in variant['pages']:
                    source_page = next(item for item in source_variant['pages'] if item['id'] == page['id'])
                    for channel in ['base', 'data']:
                        # The complete family delegates the unchanged body pages
                        # to the original source campaign; it adds no image copy.
                        payload = campaign_payload(campaign, source_page[channel], page[channel + 'Sha256'], page[channel + 'Bytes'])
                        formal.append(pin(payload))
            native_hash = declaration['sha256']
            inputs.append({'equivalentActiveMember': pin(active), 'canonicalBodyExact': True,
                           'qualification': 'Only pack identity/revision and resource filenames differ. '
                                            'Source, logical geometry, color policy, complete frame layout '
                                            'and both densities of albedo/control data remain exact.'})
        assert sorted(variant['density'] for variant in spec['variants']) == [2, 4]
        for variant in spec['variants']:
            density, items = variant['density'], []
            pages = {page['id']: page for page in variant['pages']}
            assert len(variant['frames']) == len(spec['logical']['frames'])
            for frame in variant['frames']:
                page = pages[frame['page']]
                for channel in ['base', 'data']:
                    actual = campaign_payload(campaign, page[channel], page[channel + 'Sha256'], page[channel + 'Bytes'])
                    assert any(record['sha256'] == digest(actual) for record in formal), f'Undeclared page: {actual}'
                x, y, width, height = frame['sampleRect']
                image = Image.open(campaign_payload(campaign, page['base'], page['baseSha256'], page['baseBytes'])).convert('RGBA')
                assert x >= 0 and y >= 0 and width > 0 and height > 0
                assert x + width <= image.width and y + height <= image.height
                crop = image.crop((x, y, x + width, y + height))
                items.append((f"Display {frame['nativeFrame']}", crop))
            exports.append((f'{density}X formal base RGBA - native pixels, no resize', rows(items, 4)))
            section, sources = native_section(target, density, native_hash)
            native.append(section)
            inputs.extend(sources)
    else:
        assert target['kind'] == 'vxl'
        for variant in resource['variants']:
            density = variant['density']
            file = verified(ROOT / '.local' / variant['path'], variant['hash'])
            formal.append(pin(file))
            spec = json.loads(file.read_text())
            assert spec['density'] == density and spec['identity'] == target['nativeActor']
            items = []
            for part in spec['parts']:
                for channel in part['files'].values():
                    actual = verified(file.parent / channel['file'], channel['sha256'], channel['bytes'])
                    formal.append(pin(actual))
                if part['member'] not in ['cdest.vxl', 'cdestwo.vxl']:
                    continue
                assert len(part['frames']) == 8
                atlas = Image.open(file.parent / part['files']['base']['file']).convert('RGBA')
                for frame in part['frames']:
                    x, y, width, height = frame['rect']
                    label = f"{'Loaded' if part['member'] == 'cdest.vxl' else 'Empty'} {frame['heading']} deg"
                    items.append((label, atlas.crop((x, y, x + width, y + height))))
            assert len(items) == 16
            exports.append((f'{density}X formal hull base RGBA - native pixels, no resize', rows(items, 4)))
            section, sources = native_section(target, density, variant['hash'])
            native.append(section)
            inputs.extend(sources)
    records.append({'id': target['id'], 'title': target['title'], 'formalPayloads': formal,
                    'nativeInputs': inputs, 'exports': assemble(target['id'] + '-exports.png', exports),
                    'native': assemble(target['id'] + '-native.png', native)})

report = {'status': 'PASS_CURRENT_FORMAL_IDENTITY_AND_LOSSLESS_REVIEW_ASSEMBLY', 'families': records,
          'scope': 'Current formal base RGBA crops and retained native diagnostic captures, without image resizing. '
                   'Native source bindings are rechecked by manifest identity. No new simulation, mission victory, '
                   'fresh platform verification or user visual acceptance is inferred. Original shadows, lighting '
                   'and owner remapping are assessed in the separately labeled native captures.'}
(OUTPUT / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'status': report['status'], 'families': len(records), 'sheets': len(records) * 2}))
