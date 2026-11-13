"""Build a self-contained review without changing selected Snow resources."""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
args = parser.parse_args()
output = args.output.resolve()
output.mkdir(exist_ok=False)
source = ROOT / '.local/source-art/yr-campaign-v1/material-and-snow-quality-r1'
specifications = [('NAPOWR', 'Soviet Power Plant', 'napowr', 1, 'soviet', 'napowr-snow'),
    ('GAPOWR', 'Allied Power Plant', 'gapowr', 2, 'allied', 'gapowr-snow'),
    ('YAPOWR', 'Yuri Bio Reactor', 'yuri-yapowr', 2, 'yuri', 'yuri-yapowr-snow')]
protected, records, buildings = {}, [], []


def protect(file):
    protected[str(file.relative_to(ROOT))] = sha(file)


def encode(image):
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()


def resample(image, size):
    return image.convert('RGBa').resize(size, Image.Resampling.LANCZOS).convert('RGBA')


def member_metadata(member):
    file = ROOT / '.local/hd-packs' / member['packId'] / member['revision'] / 'manifest.json'
    assert sha(file) == member['sha256']
    protect(file)
    metadata = read(file)
    for variant in metadata['variants']:
        for page in variant['pages']:
            for role in ['base', 'data']:
                image = file.parent / page[role]
                assert sha(image) == page[role + 'Sha256']
                protect(image)
    return file, metadata


def crop(file, variant, frame):
    page = next(page for page in variant['pages'] if page['id'] == frame['page'])
    x, y, width, height = frame['contentRect']
    return Image.open(file.parent / page['base']).convert('RGBA').crop((x, y, x + width, y + height))


for identity, title, stem, revision, faction, key in specifications:
    coverage_file = ROOT / f'desktop/{faction}-building-coverage.json'
    protect(coverage_file)
    coverage = read(coverage_file)[key]
    family_file = ROOT / '.local' / coverage['familyPath']
    assert sha(family_file) == coverage['familyHash']
    protect(family_file)
    family = read(family_file)
    metadata = {member['member']: member_metadata(member) for member in family['members']}
    body_file, body = metadata[identity.lower() + '.shp']
    candidate_file = source / f'{stem}-snow-normal-master-r{revision}.png'
    authored = Image.open(candidate_file).convert('RGBA')
    bounds = authored.getchannel('A').point(lambda value: 255 if value >= 4 else 0).getbbox()
    assert bounds
    authored = authored.crop(bounds)
    images, geometry = {}, []
    for density in [2, 4]:
        variants = sorted(body['variants'], key=lambda value: (value['density'] != density, -value['density']))
        variant = variants[0]
        frame = next(frame for frame in variant['frames'] if frame['nativeFrame'] == 0)
        current = crop(body_file, variant, frame)
        size = tuple(round(value * density / variant['density']) for value in current.size)
        if current.size != size:
            current = resample(current, size)
        assert min(authored.width / (size[0] / density), authored.height / (size[1] / density)) >= 4
        candidate = resample(authored, size)
        images[str(density)] = dict(current=encode(current), candidate=encode(candidate), width=size[0], height=size[1])
        geometry.append(dict(density=density, currentPackDensity=variant['density'], size=size,
            currentPngSha256=hashlib.sha256(base64.b64decode(images[str(density)]['current'].split(',')[1])).hexdigest(),
            candidatePngSha256=hashlib.sha256(base64.b64decode(images[str(density)]['candidate'].split(',')[1])).hexdigest()))
    build_file, build = metadata[identity.lower() + 'mk.shp']
    variant, = [variant for variant in build['variants'] if variant['density'] == 2]
    frames = variant['frames']
    assert [frame['nativeFrame'] for frame in frames] == list(range(len(build['logical']['frames'])))
    width, height = [value * 2 for value in build['logical']['canvas']]
    columns = 6
    sheet = Image.new('RGBA', (width * columns, height * ((len(frames) + columns - 1) // columns)))
    completion = build.get('paintedBuildup', {}).get('completionPresentation')
    for ordinal, frame in enumerate(frames):
        logical = build['logical']['frames'][ordinal]
        x, y = [value * 2 for value in logical['trimOrigin']]
        image = crop(build_file, variant, frame)
        if ordinal == len(frames) - 1 and completion == 'retained-idle-v1':
            assert image.getchannel('A').getbbox() is None
            assert body['logical']['canvas'] == build['logical']['canvas']
            image = Image.open(io.BytesIO(base64.b64decode(images['2']['current'].split(',')[1]))).convert('RGBA')
            x, y = [value * 2 for value in body['logical']['frames'][0]['trimOrigin']]
        sheet.alpha_composite(image, (ordinal % columns * width + x, ordinal // columns * height + y))
    buildings.append(dict(identity=identity, title=title, images=images, master=encode(Image.open(candidate_file)),
        animation=dict(sheet=encode(sheet), columns=columns, width=width, height=height, count=len(frames),
            completedBuildingDisplay=completion == 'retained-idle-v1')))
    records.append(dict(identity=identity, coverage=str(coverage_file.relative_to(ROOT)), family=key,
        currentFamilySha256=sha(family_file), currentBodyManifest=str(body_file.relative_to(ROOT)),
        currentConstructionManifest=str(build_file.relative_to(ROOT)), constructionFrames=len(frames),
        originalConstructionGeometry=build['logical'], currentCompletionPresentation=completion,
        candidate=dict(file=str(candidate_file.relative_to(ROOT)),
            sha256=sha(candidate_file), canvas=Image.open(candidate_file).size, registrationBounds=bounds),
        previewGeometry=geometry))
for relative in ['desktop/environment-snow-hd-contract.json', '.local/environment-snow-selection.json']:
    protect(ROOT / relative)
template = (Path(__file__).with_name('snow-material-review.html')).read_text()
html = template.replace('__REVIEW_DATA__', json.dumps(buildings, separators=(',', ':')))
assert '__REVIEW_DATA__' not in html
page = output / 'review.html'
page.write_text(html)
assert all(sha(ROOT / file) == digest for file, digest in protected.items())
receipt = dict(schema='snow-material-desktop-review-v1', status='READY_FOR_USER_REVIEW_NO_SNOW_APPLICATION',
    candidatesRegistered=False, currentResourcesChanged=0, constructionAnimationChanges=0,
    policy='Candidates are normal-state material previews only. Wait for the user decision before application. '
        'Any approved Snow production must preserve source construction/unbuild geometry, frame order, shadows and timing '
        'and pass native Snow 2X/4X construction/unbuild checks. Original campaign production continues independently.',
    buildings=records, protectedFiles=protected, html=dict(file=str(page), bytes=page.stat().st_size, sha256=sha(page)),
    embeddedImages=sum(6 for _ in buildings), userDecision='PENDING')
(output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(page=str(page), bytes=page.stat().st_size, buildings=len(buildings), protectedFiles=len(protected))))
