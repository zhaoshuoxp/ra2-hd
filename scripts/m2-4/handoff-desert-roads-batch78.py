"""Verify embedded review and hash complete versioned road dependencies in place."""
import base64
import hashlib
import io
import json
import re
from pathlib import Path

from PIL import Image

root = Path('.artifacts/m2-4/desert-roads-batch78-20261019')
review = root/'review-v5'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
write = lambda p, d: p.write_text(json.dumps(d, indent=2)+'\n')
html_file = review/'M2.4-Desert-Roads-Batch78-Embedded.html'
metadata = read(html_file.with_suffix('.json'))
page = html_file.read_text()
blocks = re.findall(r'src="data:image/png;base64,([^"]+)"', page)
assert len(blocks) == len(metadata['images']) == 49
pins = {r['sha256']: r for r in metadata['images']}
for block in blocks:
    data = base64.b64decode(block, validate=True)
    digest = hashlib.sha256(data).hexdigest()
    assert digest in pins
    image = Image.open(io.BytesIO(data))
    image.load()
    assert list(image.size) == pins[digest]['size']
assert not re.search(r'<(?:script|link|iframe)\b', page, re.I)
assert not re.search(r'(?:src|href)=["\'](?:https?:|file:|/)', page, re.I)
assert 'id="four" type="radio" name="mode" checked' in page
for mode in ['four', 'two', 'original', 'all', 'fit']:
    assert f'id="{mode}"' in page
write(review/'static-qa.json', dict(status='PASS_ALL_49_EMBEDDED_IMAGES_HASH_DIMENSIONS_DECODE_STATIC_CONTROLS',
    htmlSha256=sha(html_file), images=49, externalDependencies=0, default='4X_NATIVE_SCALE_FIT_OFF',
    browserInteractive='NOT_RUN_PRIOR_LOCAL_PROTOCOL_DENIAL_RESPECTED'))

receipt = read(root/'export-and-preservation-v1.json')
files = {}


def include(file):
    file = Path(file)
    assert file.is_file(), str(file)
    files[str(file)] = dict(file=str(file), sha256=sha(file), bytes=file.stat().st_size)


terrain = Path('.local/terrain-packs')/receipt['candidate']['revision']
assert sha(terrain/'manifest.json') == receipt['candidate']['sha256']
environment_pointer = read(Path('.local/environment-desert-selection.json'))
environment = Path('.local/environment-packs')/environment_pointer['revision']
assert sha(environment/'manifest.json') == environment_pointer['sha256']
for directory in [terrain, environment]:
    for file in sorted(directory.rglob('*')):
        if file.is_file():
            include(file)
prepared = Path('.artifacts/m2-4/desert-roads-hybrid-batch78-preparation-v1')
for file in [prepared/'source.json', prepared/'reuse-preparation-v1.json',
        Path(receipt['baseline'].get('file', '.local/terrain-packs/'+receipt['baseline']['revision']+'/manifest.json')),
        Path('.artifacts/m2-4/structures-batches76-77-v1/temperate-cross-name-reuse-audit-v1.json')]:
    include(file)
for source in read(root/'source.json')['sources']:
    include(root/'native'/source['nativeFile'])
    include(root/'native'/(source['palette']['sha256']+'.pal'))
    for image in source['images']:
        include(root/'native'/image['file'])
for file in sorted((prepared/'temperate-guides').rglob('*')):
    if file.is_file():
        include(file)
donor_root = Path('.local/terrain-packs')/receipt['acceptedRoadDonor']['revision']
donor = read(donor_root/'manifest.json')
assert sha(donor_root/'manifest.json') == receipt['acceptedRoadDonor']['sha256']
include(donor_root/'manifest.json')
wanted = {r['donorMember'] for r in receipt['records']}
for group in donor['groups']:
    if any(m['member'] in wanted for m in group['members']):
        for variant in group['variants']:
            include(donor_root/variant['file'])
for file in sorted(root.rglob('*')):
    if file.is_file() and file.suffix in ['.json', '.log', '.png', '.html', '.webm']:
        if file.name not in ['resource-handoff-v4.json', 'desktop-delivery-v5.json', 'delivery-checkpoint-v5.json']:
            if 'review-v4' not in file.parts:
                include(file)
for name in ['export-desert-hybrid-roads-batch78.py', 'review-desert-hybrid-roads-batch78.py',
        'handoff-desert-roads-batch78.py', 'desert-terrain-loading.test.ts', 'native-maps.mjs']:
    include(Path('scripts/m2-4')/name)
for name in ['terrain-theater-hd-contracts.json', 'environment-desert-hd-contract.json', 'prepared-hd-contract.json']:
    include(Path('desktop')/name)
prepared_pin = read(Path('desktop/prepared-hd-contract.json'))
assert sha(Path('.local')/prepared_pin['indexPath']) == prepared_pin['sha256']
include(Path('.local')/prepared_pin['indexPath'])
write(root/'resource-handoff-v4.json', dict(status='PASS_COMPLETE_VERSIONED_RESOURCE_DEPENDENCIES_HASHED_IN_PLACE',
    candidate=receipt['candidate'], selectedEnvironment=environment_pointer,
    runtimeSourceCommit=read(root/'active-stage-v4.json')['runtimeSourceHead'],
    prepared='UNCHANGED_CORE_INDEX_TERRAIN_USES_VALIDATED_RGBA_ATLASES',
    files=list(files.values()), fileCount=len(files), logicalBytes=sum(r['bytes'] for r in files.values()),
    authority='Versioned resource paths remain in the isolated task workspace. This ledger is not a resource copy or an independent game delivery.',
    sourceArchives='Existing imported archives and their source hashes remain authoritative in the scoped inventory. No original installation or map is modified.',
    perBatchMacPackageCreated=False, visualAcceptance='PENDING_EIGHT_ADAPTATIONS', windows='NOT_RUN', m24Complete=False))
print(json.dumps(dict(files=len(files), htmlSha256=sha(html_file), resourceHandoffSha256=sha(root/'resource-handoff-v4.json'))))
