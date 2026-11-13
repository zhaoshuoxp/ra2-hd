"""Publish three independently verified, mission-bound Lunar SHP families."""
import argparse
import hashlib
import json
import os
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('revision')
args = parser.parse_args()
assert args.revision and all(c in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in args.revision)
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
write = lambda p, v: p.write_text(json.dumps(v, indent=2) + '\n')
root = args.root
contract = read(root / 'contract.json')
assert contract['theater'] == 'LUNAR' and len(contract['sources']) == 36
source = read(root / 'prepared/source.json')
assert source['edition'] == 'yr' and source['mission'] == 'sov06lmd.map'
assert sha(Path('.local/campaign/yr/sov06lmd/sov06lmd.map')) == source['missionSha256']
plan = [('building-verification-r2.json', 3), ('overlay-verification-r1.json', 9), ('smudge-verification-r4.json', 24)]
packs, families, payloads = [], {}, {}
for filename, count in plan:
    verification = read(root / filename)
    assert verification['status'] == 'PASS' and verification['counts']['members'] == count
    directory = Path(verification['pack'])
    assert sha(directory / 'manifest.json') == verification['sha256']
    pack = read(directory / 'manifest.json')
    assert pack['theater'] == 'LUNAR' and len(pack['families']) == 1
    identity, family = next(iter(pack['families'].items()))
    declared = contract['families'][identity]
    assert declared['editions'] == ['yr'] and family['familyHash'] == declared['familyHash']
    assert declared['sourceScope']['campaignSources'] == [dict(edition='yr', mission=source['mission'], sha256=source['missionSha256'])]
    assert declared['members'] == sorted(member['member'] for member in family['members'])
    for member in family['members']:
        metadata_file = directory / member['path']
        assert metadata_file.is_file() and not metadata_file.is_symlink()
        assert sha(metadata_file) == member['sha256']
        metadata = read(metadata_file)
        native = contract['sources'][member['member']]
        assert metadata['source']['sha256'] == native['sha256']
        assert metadata['logical']['canvas'] == native['canvas']
        assert len(metadata['logical']['frames']) == native['bodyFrames']
        assert [v['density'] for v in metadata['variants']] == [2, 4]
        files = [metadata_file]
        for variant in metadata['variants']:
            for page in variant['pages']:
                for role in ['base', 'data']:
                    path = metadata_file.parent / str(variant['density']) / page['id'] / (role + '.png')
                    assert not path.is_symlink() and sha(path) == page[role + 'Sha256']
                    assert path.stat().st_size == page[role + 'Bytes']
                    files.append(path)
        for file in files:
            relative = file.relative_to(directory)
            assert relative not in payloads
            payloads[relative] = file
    assert identity not in families
    families[identity] = family
    packs.append(dict(pack=str(directory), sha256=verification['sha256'], verification=str(root / filename)))
assert set(families) == set(contract['families'])
contract_file = Path('desktop/environment-lunar-hd-contract.json')
pointer_file = Path('.local/environment-lunar-selection.json')
assert not contract_file.exists() and not pointer_file.exists()
pack_root = Path('.local/environment-packs') / args.revision
pack_root.mkdir(exist_ok=False)
for relative, source_file in payloads.items():
    target = pack_root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    os.link(source_file, target)
manifest = dict(schema='environment-shp-pack-v1', theater='LUNAR', editions=['yr'], revision=args.revision, families=families)
write(pack_root / 'manifest.json', manifest)
pointer = dict(schemaVersion=1, revision=args.revision, sha256=sha(pack_root / 'manifest.json'))
contract['preparedSourceSha256'] = sha(root / 'prepared/source.json')
contract['selectedPack'] = pointer
write(contract_file, contract)
write(pointer_file, pointer)
receipt = dict(schema='yr-lunar-environment-registration-v1', status='INDEPENDENT_SOURCE_AND_DENSITY_CHECKS_PASS_NATIVE_RUNTIME_PENDING',
    source=str(root), mission=source['mission'], sourceSha256=source['missionSha256'], pack=pointer,
    families=list(families), members=36, independentDensities=[2, 4], candidateProofs=packs,
    payloadFiles=len(payloads), copiedPayloads=0, acceptedPayloadsReplaced=0,
    userVisualAcceptance='PENDING', windows='NOT_RUN_ON_THIS_MAC')
write(Path('docs/campaign-art/yr-v1/lunar-environment.json'), receipt)
print(json.dumps(receipt))
