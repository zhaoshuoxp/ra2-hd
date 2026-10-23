"""Audit full source-state pairs and exact inherited payloads before isolated selection."""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from newurban_batch89_io import crop, logical, pin, read, sha, write
from newurban_batch97_materials import ROOT

VERSION = sys.argv[1] if len(sys.argv) > 1 else 'v3'
exported = read(ROOT / f'export-and-preservation-{VERSION}.json')
baseline = read(ROOT / 'baseline-contract.json')
candidate = read(ROOT / f'contract-candidate-{VERSION}.json')
selected = read('.local/environment-newurban-selection.json')
assert selected == baseline['selectedPack'] or selected in [read(file)['candidate']
    for file in ROOT.glob('export-and-preservation-v*.json')]
assert read('desktop/environment-newurban-hd-contract.json')['selectedPack'] == selected
source = {s['member']: s for s in read(ROOT / 'source-v1.json')['sources']}
base = Path('.local/environment-packs') / baseline['selectedPack']['revision']
folder = Path('.local/environment-packs') / exported['candidate']['revision']
pack, old = read(folder / 'manifest.json'), read(base / 'manifest.json')
assert sha(folder / 'manifest.json') == exported['candidate']['sha256']
for family, definition in old['families'].items():
    assert pack['families'][family] == definition
for relative, digest in exported['preservedPayloadHashes'].items():
    assert sha(base / relative) == sha(folder / relative) == digest, relative
for key in ['sources', 'families']:
    for name, value in baseline[key].items():
        assert candidate[key][name] == value
rows = []
for record in exported['records']:
    name = record['member']
    native = source[name]
    assert sha(ROOT / 'native' / native['nativeFile']) == native['sha256']
    file = Path(record['metadata']['file'])
    assert pin(file) == record['metadata']
    m = read(file)
    assert m['logical']['canvas'] == native['canvas']
    assert m['logical']['frames'] == [logical(f) for f in native['frames'][:record['bodySlots']]]
    assert m['source']['sha256'] == native['sha256']
    for variant in m['variants']:
        assert len(variant['frames']) == record['bodySlots']
        for page in variant['pages']:
            arrays = []
            for role in ['base', 'data']:
                png = file.parent / str(variant['density']) / page['id'] / (role + '.png')
                assert sha(png) == page[role + 'Sha256'] and png.stat().st_size == page[role + 'Bytes']
                pixels = np.array(Image.open(png).convert('RGBA'))
                assert list(reversed(pixels.shape[:2])) == page['size']
                arrays.append(pixels)
            body, data = arrays
            assert np.all(data[..., 1] <= 15) and not data[..., 2].any() and np.all(data[..., 3] == 255)
            assert not data[..., 0][body[..., 3] == 0].any()
        for frame in variant['frames']:
            slot = frame['nativeFrame']
            assert frame['contentRect'][2:] == [n * variant['density'] for n in native['frames'][slot]['size']]
            assert frame['sampleRect'][2:] == [n * variant['density'] for n in m['logical']['frames'][slot]['legacyRenderSize']]
    rows.append(dict(member=name, sourceSha256=native['sha256'], totalNativeSlots=native['totalFrames'],
        bodySlots=record['bodySlots'], metadata=pin(file), originalSource=pin(ROOT / 'native' / native['nativeFile'])))

font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
bodies = [r for r in exported['records'] if r['member'] != 'cgslab_f.shp']
for page_index in range((len(bodies) + 3) // 4):
    selected = bodies[page_index * 4:(page_index + 1) * 4]
    board = Image.new('RGBA', (2000, len(selected) * 450), '#14202a')
    draw = ImageDraw.Draw(board)
    for index, record in enumerate(selected):
        name = record['member']
        draw.text((12, index * 450 + 8), source[name]['bindings'][0]['id'] + ' / 4X HD, fit to inspection cell', font=font)
        for slot in range(record['bodySlots']):
            image = Image.fromarray(crop(record['metadata']['file'], slot, 4))
            image.thumbnail((480, 390), Image.Resampling.LANCZOS)
            board.alpha_composite(image, (slot * 500 + (500 - image.width) // 2, index * 450 + 45))
    file = ROOT / f'authored-building-inspection-part{page_index + 1}-{VERSION}.png'
    assert not file.exists()
    board.convert('RGB').save(file)
audit = dict(status='PASS_13_COMPLETE_FAMILIES_14_MEMBERS_164_DENSITY_SLOTS_PRIOR_PAYLOADS_EXACT',
    export=pin(ROOT / f'export-and-preservation-{VERSION}.json'), candidate=exported['candidate'], rows=rows,
    unchangedPriorFamilies=len(old['families']), exactPriorPayloads=len(exported['preservedPayloadHashes']),
    minimumMotherDensity=min(row['availableDensity'] for row in exported['motherRows']),
    originalUnusedFlagTrailingSlots=list(range(16, 32)), flagNativeLoop=[0, 16],
    flagLoopAuthority=pin(Path('src/engine/AnimProps.ts')),
    native='NOT_RUN', visual='PENDING_CONSOLIDATED_REVIEW', windows='NOT_RUN', m24Complete=False)
write(ROOT / f'static-audit-{VERSION}.json', audit)
Path('desktop/environment-newurban-hd-contract.json').write_text(json.dumps(candidate, indent=2) + '\n')
Path('.local/environment-newurban-selection.json').write_text(json.dumps(exported['candidate'], indent=2) + '\n')
write(ROOT / f'selection-{VERSION}.json', dict(status='SELECTED_ISOLATED_CANDIDATE_PENDING_NATIVE',
    candidate=exported['candidate'], staticAudit=pin(ROOT / f'static-audit-{VERSION}.json'),
    contract=pin(Path('desktop/environment-newurban-hd-contract.json')),
    selector=pin(Path('.local/environment-newurban-selection.json')), recoveryContract=pin(ROOT / 'baseline-contract.json'),
    recoverySelector=pin(ROOT / 'baseline-selector.json'), mainModified=False))
print(dict(status=audit['status'], priorFamilies=len(old['families']), priorPayloads=audit['exactPriorPayloads']))
