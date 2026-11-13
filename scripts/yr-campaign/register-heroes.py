"""Register complete source-matched Hollywood families through the existing unit loader."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--revision', default='yr-hollywood-r1')
args = parser.parse_args()
root = Path('.local')
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
source = json.loads((root / 'source-art/yr-campaign-v1/hollywood-heroes/original/source.json').read_text())
desktop_file = Path('desktop/hd-profile.mjs')
runtime_file = Path('src/engine/renderable/builder/sovietUnitHdFamilies.ts')
desktop, runtime = desktop_file.read_text(), runtime_file.read_text()
records = []
for actor in source['sources']:
    identity = actor['identity']
    assert identity in ('ARND', 'STLN') and f'    {identity}:' not in desktop and f'    {identity}:' not in runtime
    pack_id = 'yr-hollywood-heroes-' + identity.lower()
    member_file = root / 'hd-packs' / pack_id / args.revision / 'manifest.json'
    manifest = json.loads(member_file.read_text())
    assert manifest['rulesIdentities'] == [identity]
    assert manifest['source']['sha256'] == actor['sha256']
    assert len(manifest['logical']['frames']) == actor['bodyFrames']
    assert sorted(v['density'] for v in manifest['variants']) == [2, 4]
    for variant in manifest['variants']:
        assert len(variant['frames']) == actor['bodyFrames']
        for page in variant['pages']:
            for role in ['base', 'data']:
                assert sha(member_file.parent / page[role]) == page[role + 'Sha256']
    family = dict(schemaVersion=1, identity=identity, edition='yr', theater='TEMPERATE', revision=args.revision,
        members=[dict(member=actor['member'], packId=pack_id, revision=args.revision,
            sha256=sha(member_file), sourceSha256=actor['sha256'], frames=actor['bodyFrames'])], projectiles=[])
    family_path = Path('hd-packs') / (pack_id + '-family') / args.revision / 'family.json'
    (root / family_path).parent.mkdir(parents=True, exist_ok=False)
    (root / family_path).write_text(json.dumps(family, indent=2) + '\n')
    family_hash = sha(root / family_path)
    entry = f"    {identity}: {{ edition: 'yr', familyPath: '{family_path}',\n        hash: '{family_hash}' }},\n"
    desktop = desktop.replace('export const sovietUnitIdentities = {\n', 'export const sovietUnitIdentities = {\n' + entry)
    entry = f"""    {identity}: {{
        identity: '{identity}', edition: 'yr',
        familyHash: '{family_hash}',
        members: [
            {{ member: '{actor['member']}', frames: {actor['bodyFrames']}, totalFrames: {actor['totalFrames']}, canvas: {actor['canvas']},
                sourceHash: '{actor['sha256']}',
                manifestHash: '{sha(member_file)}' }},
        ],
        projectiles: [] as readonly ProjectileBinding[],
    }},
"""
    runtime = runtime.replace('export const sovietUnitHdFamilies = {\n', 'export const sovietUnitHdFamilies = {\n' + entry)
    records.append(dict(identity=identity, familyPath=str(family_path), familySha256=family_hash,
        manifestSha256=sha(member_file), originalBodyFrames=actor['bodyFrames'], originalTotalFrames=actor['totalFrames']))
assert 'of 5 YR additions' in desktop
desktop_file.write_text(desktop.replace('of 5 YR additions available, including campaign-only LUNR',
    'of 7 YR additions available, including campaign-only LUNR, ARND and STLN'))
runtime_file.write_text(runtime)
receipt = Path('docs/campaign-art/yr-v1/hollywood-heroes-registration.json')
assert not receipt.exists()
receipt.write_text(json.dumps(dict(status='COMPLETE_DUAL_DENSITY_REGISTERED_NATIVE_REVIEW_PENDING',
    families=records, source='Original source geometries, native separate shadows and original red-material ownership seeds.',
    sourcePalette='unittem, unitubn, uniturb, unitdes and unitlun are byte-identical; unitsno differs only at transparent index zero.',
    sourcePaletteAudit='.local/source-art/yr-campaign-v1/hollywood-heroes/palette-audit.json',
    userVisualAcceptance='PENDING'), indent=2) + '\n')
print(json.dumps(records))
