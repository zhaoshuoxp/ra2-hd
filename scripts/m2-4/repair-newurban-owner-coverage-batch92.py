"""Keep target owner semantics strictly inside accepted authored visible coverage."""
import copy
import os
from pathlib import Path

import numpy as np
from PIL import Image
from newurban_batch89_io import pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-cross-name-reuse-batch92-20261020')
old = read(ROOT / 'export-and-preservation-v1.json')
assert read('.local/environment-newurban-selection.json') == old['candidate']
base = Path('.local/environment-packs') / old['candidate']['revision']
revision = 'newurban-environment-cross-name-reuse-batch92-v2-combined'
destination = Path('.local/environment-packs') / revision
destination.mkdir(exist_ok=False)
for file in base.rglob('*'):
    if not file.is_file() or file == base / 'manifest.json':
        continue
    relative = file.relative_to(base)
    # The modified metadata/data are rewritten exclusively, never through a hard link.
    if relative.parts[:2] == ('members', 'cnmiam07-shp') and (file.name == 'manifest.json' or file.name == 'data.png'):
        continue
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    os.link(file, target)
metadata_file = destination / 'members/cnmiam07-shp/manifest.json'
metadata = read(base / 'members/cnmiam07-shp/manifest.json')
changes = []
for variant in metadata['variants']:
    for page in variant['pages']:
        relative = Path('members/cnmiam07-shp') / str(variant['density']) / page['id']
        b = np.array(Image.open(base / relative / 'base.png').convert('RGBA'))
        d = np.array(Image.open(base / relative / 'data.png').convert('RGBA'))
        invalid = (b[..., 3] == 0) & (d[..., 0] > 0)
        count = int(invalid.sum())
        d[..., 0][invalid] = 0
        d[..., 1][invalid] = 0
        target = destination / relative / 'data.png'
        target.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(d).save(target)
        page.update(dataSha256=sha(target), dataBytes=target.stat().st_size)
        changes.append(dict(density=variant['density'], page=page['id'], transparentOwnerSamplesCleared=count))
assert sum(row['transparentOwnerSamplesCleared'] for row in changes) > 0
metadata['packRevision'] = revision
metadata['color']['acceptedArtworkRegistration']['ownerCoverageCorrection'] = changes
write(metadata_file, metadata)
manifest = read(base / 'manifest.json')
entry, = manifest['families']['newurban-camiam07']['members']
entry['sha256'] = sha(metadata_file)
manifest['revision'] = revision
write(destination / 'manifest.json', manifest)
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
contract = read(ROOT / 'contract-candidate-v1.json')
contract['selectedPack'] = candidate
write(ROOT / 'contract-candidate-v2.json', contract)
export = copy.deepcopy(old)
export['candidate'] = candidate
export['status'] = 'EXPORTED_FIVE_COMPLETE_REUSED_FAMILIES_OWNER_COVERAGE_CORRECTED_NOT_SELECTED'
for record in export['records']:
    relative = Path(record['metadata']['file']).relative_to(base)
    record['metadata'] = pin(destination / relative)
write(ROOT / 'export-and-preservation-v2.json', export)
write(ROOT / 'owner-coverage-failure-correction-v1.json', dict(
    status='SOURCE_PINNED_FAIL_CLOSED_OWNER_COVERAGE_CORRECTION',
    failedNativeReport=pin(ROOT / 'native-2x-v1/report.json'), failedCandidate=old['candidate'],
    correctedCandidate=candidate, changes=changes,
    rootCause='Smoothed target owner coverage was written into transparent accepted contour samples. The strict loader rejected remap-outside-coverage and reverted the complete hotel family to Original.',
    correction='Clear only owner weight/shade on alpha-zero samples. Accepted RGB, alpha, native headers, shadows and target owner data inside visible coverage remain unchanged. Keep the original failed candidate and native report.',
    native='NOT_RUN', windows='NOT_RUN', m24Complete=False))
print(dict(candidate=candidate, changes=changes))
