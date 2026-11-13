"""Admit the complete source-qualified Snow truck without replacing old packs."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('stage', type=Path)
parser.add_argument('receipt', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
stage = args.stage.resolve()
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
encode = lambda v: json.dumps(v, indent=2) + '\n'
proof = read(stage / 'verification.json')
assert proof['status'] == 'PASS_SOURCES_BEARINGS_DENSITIES_FIXED_COLORS'
assert proof['authoredIdentities'] == 1 and proof['densityBearings'] == 16
inspection = read(stage / 'visual-inspection.json')
assert inspection['status'] == 'PASS_INTERNAL_NATIVE_GEOMETRY_AND_DENSITY_INSPECTION'
assert inspection['independentDensities'] == [2, 4]
inventory, preparation = read(stage / 'inventory.json'), read(stage / 'preparation.json')
assert preparation['mission'] == 'sov07s.map' and preparation['theater'] == 'SNOW'
contract_file = root / 'desktop/environment-snow-hd-contract.json'
before = contract_file.read_bytes()
contract = json.loads(before)
assert 'PROPA' not in contract.get('vxl', {}) and not args.receipt.exists()
payloads, variants, records = {}, [], []
for density in [2, 4]:
    source = stage / f'pack-{density}x'
    file = source / 'manifest.json'
    manifest = read(file)
    assert manifest['identity'] == 'PROPA' and manifest['theater'] == 'SNOW'
    assert manifest['density'] == density and len(manifest['parts']) == 1
    assert manifest['sources'] == {name: inventory['assets'][name]['sha256'] for name in ['propa.hva', 'propa.vxl']}
    part, = manifest['parts']
    assert part['member'] == 'propa.vxl' and part['key'] == 'propa-DUMMY01'
    assert part['provenance']['sha256'] == preparation['masterSha256']
    assert [frame['heading'] for frame in part['frames']] == list(range(0, 360, 45))
    assert all(frame['ownerPixels'] == 0 and frame['availableAuthoredDensity'] >= 4 for frame in part['frames'])
    assert inspection['manifestSha256'][str(density)] == sha(file)
    verified = next(row for row in proof['records'] if row['density'] == density)
    assert verified['sha256'] == sha(file)
    destination = root / f'.local/hd-packs/campaign-sov07-propa-vxl/full-v37-r1-{density}x'
    assert not destination.exists()
    for role, resource in part['files'].items():
        image = source / resource['file']
        assert sha(image) == resource['sha256'] and image.stat().st_size == resource['bytes']
        assert Path(resource['file']).name == resource['file']
        payloads[destination / resource['file']] = image.read_bytes()
    payloads[destination / 'manifest.json'] = file.read_bytes()
    variants.append(dict(hash=sha(file), density=density,
        path=str((destination / 'manifest.json').relative_to(root / '.local'))))
    records.append(dict(density=density, decodedRgbaBytes=verified['decodedRgbaBytes']))
for file, payload in payloads.items():
    file.parent.mkdir(parents=True, exist_ok=True)
    with file.open('xb') as output:
        output.write(payload)
    assert file.read_bytes() == payload
contract.setdefault('vxl', {})['PROPA'] = dict(**{key: value for key, value in variants[-1].items() if key != 'density'},
    edition='ra2', authoringTheater='SNOW', theaters=['SNOW'], members=['propa.vxl'], variants=variants)
contract_file.write_text(encode(contract))
args.receipt.write_text(encode(dict(status='COMPLETE_SOURCE_QUALIFIED_2X4X_REGISTERED_NATIVE_AND_USER_REVIEW_PENDING',
    identity='PROPA', mission='sov07s.map', authoringTheater='SNOW', stage=str(stage), variants=variants,
    preparation=preparation, sourceVerification=proof, visualInspection=inspection, allocations=records,
    sourcePalette=preparation['sourcePalette'], sourceVpl=preparation['sourceVpl'], originalOwnerControl='NEUTRAL_FIXED_COLOR_IN_ALL_EIGHT_NATIVE_HEADINGS',
    contractBeforeSha256=hashlib.sha256(before).hexdigest(), contractAfterSha256=sha(contract_file),
    addedFiles=[dict(path=str(file.relative_to(root)), bytes=file.stat().st_size, sha256=sha(file)) for file in payloads],
    acceptedPayloadsReplaced=0, originalMapRulesVxlHvaAndPaletteChanged=False,
    policy='Complete independent density families, RA2/Snow source identity, original geometry/HVA/ownership, fixed budgets and existing Windows loading path.')))
print(json.dumps(dict(identity='PROPA', files=len(payloads), variants=variants, receipt=str(args.receipt))))
