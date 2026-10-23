"""Independently bound every changed sample and retain target native contracts."""
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image
from newurban_batch89_io import crop, logical, pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-cross-name-reuse-batch92-20261020')
export = read(ROOT / 'export-and-preservation-v2.json')
baseline = read(ROOT / 'baseline-contract.json')
contract = read(ROOT / 'contract-candidate-v2.json')
sources = {s['member']: s for s in read(ROOT / 'source.json')['sources']}
donors = {d['targetMember']: d for d in read(ROOT / 'selected-donor-inputs-v1.json')['records']}
pack = Path('.local/environment-packs') / export['candidate']['revision']
assert sha(pack / 'manifest.json') == export['candidate']['sha256']
for key in ['sources', 'families']:
    assert all(contract[key][name] == value for name, value in baseline[key].items())
assert len(contract['families']) == len(baseline['families']) + 5 == 208
assert all(contract['identities'][edition][name] == value for edition in ['ra2', 'yr']
           for name, value in baseline['identities'][edition].items())
for relative, digest in export['preservedPayloadHashes'].items():
    assert sha(pack / relative) == digest
for original in export['originalFiles']:
    assert pin(Path(original['file'])) == original
rows, exact, total = [], 0, 0
for record in export['records']:
    member = record['member']
    source, donor = sources[member], donors[member]
    metadata = read(record['metadata']['file'])
    assert pin(record['metadata']['file']) == record['metadata']
    assert pin(record['donorMetadata']['file']) == record['donorMetadata']
    assert re.fullmatch('[a-z0-9-]+', metadata['packId'])
    assert metadata['logical'] == dict(canvas=source['canvas'], frames=[logical(f) for f in source['frames'][:record['bodySlots']]])
    assert metadata['source']['sha256'] == source['sha256']
    assert sorted(v['density'] for v in metadata['variants']) == [2, 4]
    for variant in metadata['variants']:
        assert [f['nativeFrame'] for f in variant['frames']] == list(range(record['bodySlots']))
        for page in variant['pages']:
            assert max(page['size']) <= 2048
            for role in ['base', 'data']:
                file = Path(record['metadata']['file']).parent / str(variant['density']) / page['id'] / (role + '.png')
                assert sha(file) == page[role + 'Sha256']
                with Image.open(file) as image:
                    image.load()
                    assert list(image.size) == page['size']
    row = dict(member=member, slots=[])
    for adaptation in record['adaptations']:
        slot, density = adaptation['slot'], adaptation['density']
        frame = source['frames'][slot]
        out_b = crop(record['metadata']['file'], slot, density)
        out_d = crop(record['metadata']['file'], slot, density, 'data')
        size = out_b.shape[1], out_b.shape[0]
        old = []
        for role in ['base', 'data']:
            array = crop(record['donorMetadata']['file'], slot, density, role)
            canvas = Image.new('RGBA', size, (0, 0, 0, 255 if role == 'data' else 0))
            canvas.paste(Image.fromarray(array), tuple(n * density for n in adaptation['offset']))
            old.append(np.array(canvas))
        old_b, old_d = old
        target = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
        old_frame = donor['frames'][slot]
        indices = np.fromfile(old_frame['index']['file'], np.uint8).reshape(old_frame['size'][::-1])
        canvas = Image.new('L', tuple(frame['size']))
        canvas.paste(Image.fromarray(indices), tuple(adaptation['offset']))
        previous = np.array(canvas)
        allowed = np.zeros(target.shape, bool)
        if slot != 3 and member != 'cnfncp.shp':
            allowed |= (target == 12) != (previous == 12)
        if member == 'cnmiam07.shp' and slot == 2:
            a, b = (target >= 16) & (target <= 31), (previous >= 16) & (previous <= 31)
            allowed |= (a != b) | (a & b & (target != previous))
        mask = np.zeros(out_b.shape[:2], bool)
        h, w = target.shape
        mask[:h * density, :w * density] = allowed.repeat(density, 0).repeat(density, 1)
        changed_b, changed_d = (out_b != old_b).any(2), (out_d != old_d).any(2)
        if adaptation['colorTransform']:
            assert member == 'cnpars05.shp' and slot == 3
            assert np.array_equal(out_b[..., 3], old_b[..., 3]) and np.array_equal(out_d, old_d)
        else:
            assert not (changed_b & ~mask).any() and not (changed_d & ~mask).any(), (member, slot, density)
        assert not ((out_b[..., 3] == 0) & (out_d[..., 0] > 0)).any()
        assert out_d[..., 1].max(initial=0) <= 15 and not out_d[..., 2].any() and (out_d[..., 3] == 255).all()
        if frame['empty']:
            assert not out_b[..., 3].any()
        is_exact = not changed_b.any() and not changed_d.any()
        exact += int(is_exact)
        total += 1
        row['slots'].append(dict(slot=slot, density=density, exactRegisteredAcceptedPayload=is_exact,
            changedBaseSamples=int(changed_b.sum()), changedAuxiliarySamples=int(changed_d.sum()),
            originalSemanticSupportCells=int(allowed.sum()), colorTransform=adaptation['colorTransform']))
    rows.append(row)
assert total == 96
write(ROOT / 'static-audit-v2.json', dict(status='PASS_FIVE_COMPLETE_ACCEPTED_STRUCTURES_BOUNDED_SEMANTIC_AND_MATERIAL_ADAPTERS',
    candidate=export['candidate'], completeFamilies=5, sourceMembers=5, sourceDensitySlots=total,
    exactRegisteredAcceptedDensityPayloads=exact, adaptedDensityPayloads=total - exact,
    originalShadowSlots=48, preservedPriorFamilies=203, rows=rows,
    selectedNewMothers=0, newArtReview='ONLY_CAPARS05_WARM_RUBBLE_AND_BOUNDED_OWNER_CONTACT_CONTEXT',
    native='NOT_RUN', windows='NOT_RUN', m24Complete=False))
assert read('desktop/environment-newurban-hd-contract.json') == read(ROOT / 'contract-candidate-v1.json')
assert read('.local/environment-newurban-selection.json') == read(ROOT / 'export-and-preservation-v1.json')['candidate']
write(ROOT / 'selection-v2.json', dict(status='STATIC_PASS_FIVE_COMPLETE_FAMILIES_SELECTED_FOR_NATIVE_VALIDATION',
    prior=baseline['selectedPack'], candidate=export['candidate'], audit=pin(ROOT / 'static-audit-v2.json'),
    preparedCore='Unchanged dependency inputs; new environment metadata/pages carry fresh actual hashes.',
    windows='NOT_RUN', m24Complete=False))
Path('desktop/environment-newurban-hd-contract.json').write_text(json.dumps(contract, indent=2) + '\n')
Path('.local/environment-newurban-selection.json').write_text(json.dumps(export['candidate'], indent=2) + '\n')
print(dict(status='PASS_STATIC_AND_SELECTED', densitySlots=total, exact=exact, adapted=total - exact, families=5))
