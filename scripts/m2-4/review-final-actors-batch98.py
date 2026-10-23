"""Create an offline embedded review of only the two newly authored actor families."""
import base64
import io
import json
from pathlib import Path
import numpy as np
from PIL import Image
from final_actor_materials_batch98 import ROOT
from newurban_batch89_io import pin, read, sha, write

contract = read(ROOT / 'final-actors-contract-selected-v4.json')
folder = Path('.local/environment-packs') / contract['selectedPack']['revision']
pack = read(folder / 'manifest.json')
sources = {s['member']: s for s in read(ROOT / 'source-v1.json')['sources']}
sequence_audit = read(ROOT / 'original-sequences-and-smudges-v1.json')
native_reports = {2: ROOT / 'native-2x-v1/report.json', 4: ROOT / 'native-4x-v5/report.json'}
reports = {density: read(file) for density, file in native_reports.items()}
for density, report in reports.items():
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and report['requestedDensity'] == density
    assert report['candidate'] == contract['selectedPack']
    for case in ['manhattan', 'dinosaur', 'groundZero']:
        allocation = report[case]['before']
        assert allocation['total'] <= allocation['limit']
        assert all(row['density'] == density for row in allocation['environment']['families'].values())
    assert report['reentry']['allocation']['total'] <= report['reentry']['allocation']['limit']
assert reports[2]['crossTheater']['allocation']['environment']['density'] == 2

review = ROOT / 'Review-v3'
review.mkdir()
data = dict(actors={}, native=[], clips=[], lighting=[], candidate=contract['selectedPack'])
page_cache = {}
image_pins = []


def encoded_image(pixels):
    stream = io.BytesIO()
    Image.fromarray(pixels).save(stream, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode()


def density_frame(metadata_file, metadata, density, number):
    variant, = [v for v in metadata['variants'] if v['density'] == density]
    frame, = [f for f in variant['frames'] if f['nativeFrame'] == number]
    page, = [p for p in variant['pages'] if p['id'] == frame['page']]
    file = metadata_file.parent / str(density) / page['id'] / 'base.png'
    if file not in page_cache:
        assert sha(file) == page['baseSha256']
        page_cache[file] = np.asarray(Image.open(file).convert('RGBA'))
    x, y, w, h = frame['sampleRect']
    return page_cache[file][y:y + h, x:x + w].copy()


for name, count in [('CIV1', 238), ('DNOA', 212)]:
    family = contract['identities']['yr'][name]
    member, = pack['families'][family]['members']
    source = sources[member['member']]
    metadata_file = folder / member['path']
    assert sha(metadata_file) == member['sha256']
    metadata = read(metadata_file)
    actor = next(a for a in sequence_audit['actors'] if a['id'] == name)
    palette = np.fromfile(ROOT / 'native' / (source['palette']['sha256'] + '.pal'), np.uint8).reshape(256, 3).astype(np.uint16) * 4
    output = dict(name=name, canvas=source['canvas'], count=count, sequences=actor['sequences'], frames=[])
    for number in range(count):
        frame = source['frames'][number]
        ix_file = ROOT / 'native' / frame['indexFile']
        assert sha(ix_file) == frame['indexSha256']
        indices = np.fromfile(ix_file, np.uint8).reshape(frame['size'][::-1])
        native = np.dstack((palette[indices].astype(np.uint8), np.uint8((indices != 0) & (indices != 12)) * 255))
        images = {'1': encoded_image(native)}
        for density in [2, 4]:
            base = density_frame(metadata_file, metadata, density, number)
            # This artwork comparison omits the untouched native contact shadow
            # in every column. Actual game captures and clips include it.
            shadow = (indices == 12).repeat(density, 0).repeat(density, 1)
            h, w = shadow.shape
            base[:h, :w, 3][shadow] = 0
            images[str(density)] = encoded_image(base)
        output['frames'].append(dict(slot=number, origin=frame['origin'], size=frame['size'], images=images))
    data['actors'][name] = output
    image_pins.append(pin(metadata_file))

for density, report in reports.items():
    parent = native_reports[density].parent
    for case, label in [('manhattan', 'CIV1 / original Manhattan placement'), ('dinosaur', 'DNOA / original Rush Hour placement')]:
        file = parent / report[case]['originalPlacement']['file']
        data['native'].append(dict(title=f'{density}X / {label}', image='data:image/png;base64,' + base64.b64encode(file.read_bytes()).decode()))
        image_pins.append(pin(file))
    for case, label in [('originalCivilian', 'CIV1 / Original'), ('originalDinosaur', 'DNOA / Original')]:
        file = parent / report[case]['capture']['file']
        data['native'].append(dict(title=f'{label} / matched {density}X session', image='data:image/png;base64,' + base64.b64encode(file.read_bytes()).decode()))
        image_pins.append(pin(file))
    for case in ['manhattan', 'dinosaur']:
        actor, = report[case]['nativeStates']['actors']
        file = Path(actor['clip'])
        data['clips'].append(dict(title=f'{actor["name"]} / {density}X / native orders, damage and death',
            video='data:video/webm;base64,' + base64.b64encode(file.read_bytes()).decode()))
        image_pins.append(pin(file))

lamp_report = ROOT / 'lamp-color-native-v1/report.json'
lamps = read(lamp_report)
assert lamps['status'] == 'PASS_SELECTED_NATIVE_CASES'
for field, label in [('allLights', 'Unchanged source lamps'), ('noLights', 'Diagnostic: lamps temporarily hidden'),
        ('blueOnly', 'Diagnostic: original blue lamps only')]:
    for row in lamps['cases']:
        file = lamp_report.parent / row[field]['file']
        density = row['density']
        data['lighting'].append(dict(title=f'{"Original" if density == 1 else str(density) + "X"} / {label}',
            image='data:image/png;base64,' + base64.b64encode(file.read_bytes()).decode()))
        image_pins.append(pin(file))
html = Path('scripts/m2-4/final-actors-review-batch98.html').read_text()
html = html.replace('__SCRIPT__', Path('scripts/m2-4/final-actors-review-batch98.js').read_text())
file = review / 'M2.4-NewUrban-Final-Actors-Batch98-Embedded.html'
file.write_text(html.replace('__DATA__', json.dumps(data, separators=(',', ':'))))
write(ROOT / 'review-receipt-v3.json', dict(status='GENERATED_EMBEDDED_REVIEW_VALIDATION_PENDING',
    html=pin(file), candidate=contract['selectedPack'], nativeReports=[pin(f) for f in native_reports.values()],
    reviewedNewFamilies=['CIV1', 'DNOA'], newAuthoredPoses=450, nativeClips=len(data['clips']),
    reusedWall='EXACT_ACCEPTED_GAFWLL_NO_NEW_ART_REVIEW', metadataAndCapturePins=image_pins,
    visual='PENDING', windows='NOT_RUN', m24Complete=False))
print(dict(html=pin(file), actors=2, poses=450, nativeImages=len(data['native']), clips=len(data['clips'])))
