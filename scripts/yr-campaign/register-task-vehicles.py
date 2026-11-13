"""Verify complete source-pinned vehicle families and append campaign-only routes."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('receipt', type=Path)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.local/source-art/yr-campaign-v1/task-vehicles'
read = lambda file: json.loads(Path(file).read_text())
sha = lambda file: hashlib.sha256(Path(file).read_bytes()).hexdigest()
encode = lambda value: json.dumps(value, indent=2) + '\n'
source_file = BASE / 'source-r1.json'
work_file = BASE / 'authoring-r1/selected-worklist-r2.json'
source, work = read(source_file), read(work_file)
inspection_file = BASE / 'visual-inspection-r1.json'
inspection = read(inspection_file)
assert source['schema'] == 'yr-task-vehicle-native-reference-inputs-v1'
assert source['edition'] == 'yr' and source['theater'] == 'NEWURBAN'
assert inspection['status'] == 'PASS_INTERNAL_ACTUAL_INDEPENDENT_DENSITY_EXPORT_INSPECTION'
assert inspection['identities'] == ['CBLC', 'DDBX', 'DOLY'] and inspection['densities'] == [2, 4]
references = Path(work['references'])
reference_report = read(references / 'report.json')
assert reference_report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not reference_report['errors']
native_sources = {item['identity']: item for item in source['sources']}
assert set(native_sources) == {'CBLC', 'DDBX', 'DOLY'}
for item in source['sourceMissions']:
    original_file = ROOT / item['source']
    assert sha(original_file) == item['sourceSha256']
    original = read(original_file)
    assert original['edition'] == 'yr' and original['theater'] == 'NEWURBAN'
    assert original['missionSha256'] == item['sha256']
    native, = original['sources']
    for asset in [native, native['hva'], native['palette'], native['vpl']]:
        assert sha(original_file.parent / 'native' / asset['member']) == asset['sha256']
inventory = read(ROOT / '.artifacts/yr-campaign/art-inventory-r30/inventory.json')
catalog_file = ROOT / 'desktop/yr-campaign-vehicle-contracts.json'
reuse_file = ROOT / 'desktop/campaign-vxl-reuse.json'
catalog, reuse = read(catalog_file), read(reuse_file)
assert not catalog['vxl']
assert not set(native_sources).intersection(entry['identity'] for entry in reuse['entries'])
contracts, entries, variants = {}, [], []
for identity in sorted(native_sources):
    native = native_sources[identity]
    board, = [board for board in work['boards'] if board['identity'] == identity]
    assert board['visualQa'] == 'PASS' and sha(board['selectedArt']) == board['selectedArtSha256']
    assert sha(board['board']) == board['boardSha256']
    selected = []
    for density in [2, 4]:
        root = ROOT / f'.local/hd-packs/yr-task-{identity.lower()}-vxl/pinned-r1-{density}x'
        file = root / 'manifest.json'
        manifest = read(file)
        assert sha(file) in inspection['inspectedPackShas']
        assert manifest['identity'] == identity and manifest['theater'] == 'NEWURBAN'
        assert manifest['density'] == density and manifest['sourceContextSha256'] == sha(source_file)
        assert manifest['sourcePalette'] == native['palette']['sha256']
        assert manifest['sourceVpl'] == native['vpl']['sha256']
        assert manifest['sources'] == {native['member']: native['sha256'],
            native['hva']['member']: native['hva']['sha256']}
        part, = manifest['parts']
        assert part['member'] == native['member'] and part['provenance']['sha256'] == board['selectedArtSha256']
        assert [frame['heading'] for frame in part['frames']] == list(range(0, 360, 45))
        bounds = part['depthBounds']
        assert len(bounds) == 4 and all(np.isfinite(bounds))
        assert bounds[2] > bounds[0] and bounds[3] > bounds[1]
        for asset in part['files'].values():
            assert sha(root / asset['file']) == asset['sha256']
        data = np.asarray(Image.open(root / part['files']['data']['file']).convert('RGBA'))
        assert not data[..., 0].any(), 'All three original civilian vehicles have fixed colors'
        for frame in part['frames']:
            assert frame['availableAuthoredDensity'] >= 4 and frame['ownerPixels'] == 0
            assert frame['ownerControlHashes'][0] == frame['ownerControlHashes'][1]
            assert frame['rect'][2:] == [round(value * density) for value in frame['logicalSize']]
        record = dict(hash=sha(file), density=density, path=str(file.relative_to(ROOT / '.local')))
        selected.append(record)
        variants.append(dict(identity=identity, **record, originalSourceAndLogicalBoundsUnchanged=True,
            originalShadowRendererUnchanged=True, fixedOwnerPixels=0))
    contracts[identity] = dict(edition='yr', hash=selected[-1]['hash'], path=selected[-1]['path'],
        members=[native['member']], variants=selected, authoringTheater='NEWURBAN', theaters=[])
    rows = [row for row in inventory['rows'] if row['kind'] == 'vehicle'
        and row['id'] == identity and row['theater'] == 'NEWURBAN']
    assert rows and all(row['source']['sha256'] == native['sha256'] for row in rows)
    missions = sorted({mission for row in rows for mission in row['usage']})
    entries.append(dict(identity=identity, edition='yr', theater='NEWURBAN', familyHash=selected[-1]['hash'],
        members=[native['member']], variants=[dict(density=v['density'], sha256=v['hash']) for v in selected],
        unitPalette={key: native['palette'][key] for key in ['member', 'sha256']},
        campaignSources=[dict(mission=mission, sha256=sha(ROOT / '.local/campaign/yr' / mission[:-4] / mission))
            for mission in missions]))
receipt = dict(schema='yr-complete-source-scoped-task-vehicle-registration-v1',
    status='REGISTERED_COMPLETE_SOURCE_EXPORTS_NATIVE_PENDING' if args.apply else 'VERIFIED_UNSELECTED_NATIVE_PENDING',
    source=str(source_file), sourceSha256=sha(source_file), worklist=str(work_file), worklistSha256=sha(work_file),
    referenceReportSha256=sha(references / 'report.json'), visualInspectionSha256=sha(inspection_file),
    priorCatalogSha256=sha(catalog_file), priorCampaignReuseSha256=sha(reuse_file),
    contracts=contracts, entries=entries, variants=variants, originalSourcePivotsDepthAndShadowsUnchanged=True,
    globalTheaterEligibility=[], acceptedPayloadsReplaced=0, registered=args.apply,
    nativeRuntime='PENDING', userVisualAcceptance='PENDING', windows='NOT_RUN_ON_THIS_MAC')
assert not args.receipt.exists()
if args.apply:
    catalog_file.write_text(encode({**catalog, 'vxl': contracts}))
    reuse_file.write_text(encode({**reuse, 'entries': reuse['entries'] + entries}))
args.receipt.write_text(encode(receipt))
print(json.dumps(dict(status=receipt['status'], families=len(contracts), variants=len(variants),
    sourceContexts=sum(len(entry['campaignSources']) for entry in entries), receipt=str(args.receipt))))
