"""Pin a complete YR infantry candidate and its required aircraft atomically."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('identity', choices=['BORIS','CCOMAND','PTROOP'])
parser.add_argument('--revision', default='1')
args = parser.parse_args()
identity = args.identity
root = Path('.local')
pack_id = f'yr-soviet-{identity.lower()}-authored'
member_path = root / 'hd-packs' / pack_id / args.revision / 'manifest.json'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = json.loads(member_path.read_text())
assert manifest['rulesIdentities'] == [identity]
count = {'BORIS':409,'CCOMAND':348,'PTROOP':315}[identity]
assert len(manifest['logical']['frames']) == count
family = dict(schemaVersion=1, identity=identity, edition='yr', theater='TEMPERATE', revision=args.revision,
              members=[dict(member=manifest['source']['member'], packId=pack_id, revision=args.revision,
                            sha256=sha(member_path), sourceSha256=manifest['source']['sha256'], frames=count)], projectiles=[])
voxel = None
if identity == 'BORIS':
    voxel_path = Path('hd-packs/yr-soviet-boris-vxl/1/manifest.json')
    voxel = dict(path=str(voxel_path), sha256=sha(root / voxel_path))
    assert json.loads((root / voxel_path).read_text())['identity'] == 'BORIS'
    family['requiredVxl'] = voxel
family_path = Path('hd-packs') / f'yr-soviet-{identity.lower()}-family' / args.revision / 'family.json'
(root / family_path).parent.mkdir(parents=True, exist_ok=False)
(root / family_path).write_text(json.dumps(family,indent=2)+'\n')
family_hash = sha(root / family_path)
p = Path('desktop/hd-profile.mjs'); s = p.read_text()
assert f'    {identity}:' not in s
entry = f"    {identity}: {{ edition: 'yr', familyPath: '{family_path}',\n        hash: '{family_hash}' }},\n"
s = s.replace('export const sovietUnitIdentities = {\n', 'export const sovietUnitIdentities = {\n'+entry)
if voxel:
    entry = f"    BORIS: {{ edition: 'yr', path: '{voxel['path']}', hash: '{voxel['sha256']}' }},\n"
    s = s.replace('export const vxlUnitIdentities = {\n','export const vxlUnitIdentities = {\n'+entry)
p.write_text(s)
p = Path('src/engine/renderable/builder/sovietUnitHdFamilies.ts');s=p.read_text()
assert f'    {identity}:' not in s
entry = f"""    {identity}: {{
        identity: '{identity}', edition: 'yr',
        familyHash: '{family_hash}',
        members: [
            {{ member: '{manifest['source']['member']}', frames: {count}, totalFrames: {count*2}, canvas: {manifest['logical']['canvas']},
                sourceHash: '{manifest['source']['sha256']}',
                manifestHash: '{sha(member_path)}' }},
        ],
        projectiles: [] as readonly ProjectileBinding[],
    }},
"""
s=s.replace('export const sovietUnitHdFamilies = {\n','export const sovietUnitHdFamilies = {\n'+entry);p.write_text(s)
if voxel:
    p=Path('src/engine/renderable/unitVxl/identities.ts');s=p.read_text();a=s.index(' = {\n')+len(' = {\n')
    entry=f"    BORIS: {{ edition: 'yr', hash: '{voxel['sha256']}', members: ['bpln.vxl'] }},\n"
    p.write_text(s[:a]+entry+s[a:])
print(json.dumps(dict(identity=identity, familyPath=str(family_path), familyHash=family_hash, memberHash=sha(member_path))))
