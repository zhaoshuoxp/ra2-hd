"""Keep all texture data and declarations while meeting the existing desktop byte bound."""
from copy import deepcopy
import json
import os
from pathlib import Path
from newurban_batch94_io import ROOT, pin, read, sha, write

previous = read(ROOT / 'export-and-preservation-v4.json')
before = previous['candidate']
assert read('.local/terrain-newurban-selection.json') == before
source = Path('.local/terrain-packs') / before['revision']
manifest = read(source / 'manifest.json')
revision = 'newurban-m2-4-secondary-terrain-reuse-batch94-v5'
destination = Path('.local/terrain-packs') / revision
destination.mkdir(exist_ok=False)
for file in source.iterdir():
    if file.name != 'manifest.json':
        os.link(file, destination / file.name)
manifest['revision'] = revision
with (destination / 'manifest.json').open('x') as stream:
    stream.write(json.dumps(manifest, separators=(',', ':')) + '\n')
assert (destination / 'manifest.json').stat().st_size <= 2 * 1024 ** 2
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
normalized = deepcopy(manifest)
normalized['revision'] = before['revision']
assert normalized == read(source / 'manifest.json')
for group in manifest['groups']:
    for variant in group['variants']:
        assert sha(destination / variant['file']) == sha(source / variant['file']) == variant['sha256']
proof = dict(status='PASS_COMPACT_ENCODING_ALL_DECLARATIONS_AND_PAYLOADS_EXACT', previous=before,
    candidate=candidate, previousBytes=(source / 'manifest.json').stat().st_size,
    compactBytes=(destination / 'manifest.json').stat().st_size, desktopLimitBytes=2 * 1024 ** 2,
    encoding='Whitespace-only normalization plus explicit new immutable revision; no source, hash declaration, slot or texture is removed.',
    previousStatic=pin(ROOT / 'static-audit-v2.json'), previousFilterGuards=pin(ROOT / 'inherited-filter-guards-v1.json'))
write(ROOT / 'compact-manifest-proof-v1.json', proof)
write(ROOT / 'export-and-preservation-v5.json', dict(previous, candidate=candidate,
    status='EXPORTED_111_COMPLETE_FAMILIES_DESKTOP_COMPACT_MANIFEST', formattingCorrection=pin(ROOT / 'compact-manifest-proof-v1.json')))
audit = read(ROOT / 'static-audit-v2.json')
write(ROOT / 'static-audit-v3.json', dict(audit, candidate=candidate, inheritedStatic=proof['previousStatic'],
    compactProof=pin(ROOT / 'compact-manifest-proof-v1.json')))
contract = read('desktop/terrain-theater-hd-contracts.json')
assert contract['NEWURBAN'] == before
contract['NEWURBAN'] = candidate
Path('desktop/terrain-theater-hd-contracts.json').write_text(json.dumps(contract, indent=2) + '\n')
Path('.local/terrain-newurban-selection.json').write_text(json.dumps(candidate, indent=2) + '\n')
write(ROOT / 'selection-v3.json', dict(status='SELECTED_COMPLETE_COMPACT_MANIFEST_NATIVE_PENDING',
    candidate=candidate, previous=before, originalBaseline=previous['baseline'], audit=pin(ROOT / 'static-audit-v3.json'),
    native='NOT_RUN', windows='NOT_RUN', m24Complete=False))
print(dict(candidate=candidate, bytes=proof['compactBytes'], unchangedTextureDeclarations=sum(len(g['variants']) for g in manifest['groups'])))
