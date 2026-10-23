"""Audit native slots once and retain measured accepted-art reuse constraints."""
import hashlib
import json
from pathlib import Path

ROOT = Path('.artifacts/yuri-buildings')
SOURCE = ROOT / 'source-v1'
inventory = json.loads((SOURCE / 'inventory.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
members, total, zero = {}, 0, 0
for digest, info in inventory['uniqueMembers'].items():
    path = SOURCE / info['path']
    raw = json.loads(path.read_text())
    assert raw['source']['sha256'] == digest
    assert raw['canvas'] == info['canvas']
    assert len(raw['frames']) == info['totalFrames']
    owner_pixels = 0
    for frame in raw['frames']:
        data = bytes(frame['pixels'])
        assert len(data) == frame['width'] * frame['height']
        assert sha(data) == frame['pixelHash']
        assert 0 <= frame['x'] and 0 <= frame['y']
        assert frame['x'] + frame['width'] <= raw['canvas'][0]
        assert frame['y'] + frame['height'] <= raw['canvas'][1]
        assert frame['empty'] == (not any(data))
        owner_pixels += sum(16 <= value <= 31 for value in data)
        zero += frame['width'] == 0 or frame['height'] == 0
        total += 1
    members[digest] = {'source': raw['source'], 'canvas': raw['canvas'], 'frames': len(raw['frames']),
                       'nativeOwnerPixels': owner_pixels, 'decodedHash': sha(path.read_bytes())}

coverage = json.loads(Path('desktop/soviet-building-coverage.json').read_text())
compatibility = json.loads((ROOT / 'reuse-native-v2.json').read_text())
reuse = []
for row in inventory['matrix']:
    if row['id'] not in ('NAPSIS', 'NACLON'):
        continue
    identity = row['id'].lower()
    relative = coverage[identity + '-snow']['familyPath'] if row['theater'] == 'SNOW' else f'hd-packs/soviet-{identity}-authored/owner-r3/family.json'
    family_path = Path('.local') / relative
    family = json.loads(family_path.read_text())
    assert len(family['members']) == len(row['members'])
    pins = []
    for binding in family['members']:
        manifest_path = Path('.local/hd-packs') / binding['packId'] / binding['revision'] / 'manifest.json'
        assert sha(manifest_path.read_bytes()) == binding['sha256']
        manifest = json.loads(manifest_path.read_text())
        native = row['members'][len(pins)]
        assert {v['density'] for v in manifest['variants']} == {2, 4}
        pins.append({'path': str(manifest_path), 'sha256': binding['sha256'],
                     'sourceHash': native['source']['sha256'], 'acceptedSourceHash': manifest['source']['sha256'], 'densities': [2, 4]})
    reuse.append({'id': row['id'], 'theater': row['theater'], 'familyPath': relative,
                  'familyHash': sha(family_path.read_bytes()), 'members': pins,
                  'compatibility': next(c for c in compatibility['rows'] if (c['id'], c['theater']) == (row['id'], row['theater'])),
                  'status': 'ACCEPTED_DESIGN_REUSE_ONLY_NEW_YR_CONTRACT_EXPORT_REQUIRED'})

eligible = json.loads((ROOT / 'eligibility-v1.json').read_text())
ledger = json.loads((ROOT / 'ledger-v1.json').read_text())
ledger['applicableIdentities'] = len(eligible['reachable'])
ledger['applicableCells'] = len(eligible['reachable']) * 6
ledger['sourceAudit'] = 'source-audit-v1.json'
for family in ledger['families']:
    family['eligibility'] = 'NATIVE_REACHABLE' if family['id'] in eligible['reachable'] else 'NATIVE_TECH_LEVEL_15_ABOVE_LIMIT_10'
    if family['id'] in ('NAPSIS', 'NACLON'):
        family['representativeApproval'] = 'REUSED_ACCEPTED_B_ART_NO_NEW_DIRECTION_REVIEW'
        family['complete2x'] = family['complete4x'] = False
        family['blocker'] = 'Native YR canvas, trims and construction differ; reuse accepted design and masters with new exports.'
        for theater in family['theaters']:
            pin = next(p for p in reuse if (p['id'], p['theater']) == (family['id'], theater['theater']))
            theater['acceptedArtReference'] = {'path': pin['familyPath'], 'sha256': pin['familyHash']}
ledger['status'] = 'REPRESENTATIVE_AUTHORING_IN_PROGRESS_FULL_PRODUCTION_NOT_AUTHORIZED_UNTIL_BATCH_DECISION'
(ROOT / 'ledger-v2.json').write_text(json.dumps(ledger, indent=2) + '\n')
report = {'status': 'PASS_NATIVE_SLOTS_REUSE_CONTRACT_CHANGES_RECORDED', 'uniqueMembers': len(members),
          'decodedFramesIncludingShadows': total, 'zeroExtentSlots': zero, 'members': members, 'reuse': reuse,
          'boundary': 'Source contracts only; new authored frames and in-match HD owner color remain pending.'}
(ROOT / 'source-audit-v1.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: report[k] for k in ('status', 'uniqueMembers', 'decodedFramesIncludingShadows', 'zeroExtentSlots')}))
