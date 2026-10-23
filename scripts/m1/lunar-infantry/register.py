"""Pin the complete Lunar Infantry family without changing native eligibility."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('identity', choices=['LUNR'], nargs='?', default='LUNR')
parser.add_argument('--revision', default='1')
args = parser.parse_args()
identity = args.identity
root = Path('.local')
pack_id = 'lunar-infantry-authored'
member_path = root / 'hd-packs' / pack_id / args.revision / 'manifest.json'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = json.loads(member_path.read_text())
assert manifest['rulesIdentities'] == [identity]
count = 435
assert len(manifest['logical']['frames']) == count
family = dict(schemaVersion=1, identity=identity, edition='yr', theater='TEMPERATE', revision=args.revision,
              members=[dict(member=manifest['source']['member'], packId=pack_id, revision=args.revision,
                            sha256=sha(member_path), sourceSha256=manifest['source']['sha256'], frames=count)], projectiles=[])
family_path = Path('hd-packs') / 'lunar-infantry-family' / args.revision / 'family.json'
(root / family_path).parent.mkdir(parents=True, exist_ok=False)
(root / family_path).write_text(json.dumps(family,indent=2)+'\n')
family_hash = sha(root / family_path)
p = Path('desktop/hd-profile.mjs'); s = p.read_text()
assert f'    {identity}:' not in s
entry = f"    {identity}: {{ edition: 'yr', familyPath: '{family_path}',\n        hash: '{family_hash}' }},\n"
s = s.replace('export const sovietUnitIdentities = {\n', 'export const sovietUnitIdentities = {\n'+entry)
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
print(json.dumps(dict(identity=identity, familyPath=str(family_path), familyHash=family_hash, memberHash=sha(member_path))))
