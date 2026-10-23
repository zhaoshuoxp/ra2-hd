"""Append twenty completed building families and four exact accepted full reuses."""
import copy
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path('.artifacts/m2-4/newurban-building-rubble-native-batch87-v1')
ART = Path('.artifacts/m2-4/newurban-building-rubble-authoring-batch87-v1')
REUSE = Path('.artifacts/m2-4/newurban-complete-reuse-export-batch87-v1')
OUT = Path('.artifacts/m2-4/newurban-buildings-batch87-20261020')
CONTRACT = Path('desktop/environment-newurban-hd-contract.json')
SELECTOR = Path('.local/environment-newurban-selection.json')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)


def write(path, value):
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


old = read(CONTRACT)
assert old['selectedPack'] == read(SELECTOR)
assert len(old['families']) == 112
assert old['selectedPack']['sha256'] == '7d63facb96f10180c4c4b274d04703493694161517c57a68b941a7a8866067f3'
verified, reused = read(ART / 'verification-v1.json'), read(REUSE / 'verification-v1.json')
assert verified['status'] == reused['status'] == 'PASS'
assert verified['counts']['families'] == 20 and verified['counts']['densityFrames'] == 160
assert verified['counts']['exactAcceptedBodyFrames'] == 120
assert verified['counts']['exactSharedRubbleDensityFrames'] == 2
assert reused['counts']['families'] == 4 and reused['counts']['densityFrames'] == 12
assert read(ART / 'mother-source-verification-v1.json')['independentlyDrawnRubbleStudies'] == 19
acceptance = Path('.artifacts/m2-4/desert-airport-markings-r1-20261020/user-acceptance-20261020.json')
assert sha(acceptance) == '9d1196dfe71582e3eabd002df65890248a26d778da3d816a90ac077edad0eaa7'
assert read(acceptance)['status'] == 'USER_ACCEPTED_DESERT_AIRPORT_TOWER_MARKING_R1'
full = copy.deepcopy(old)
patches = [read(ROOT / 'contract.json'), read(REUSE / 'contract.json')]
new_families = []
for patch in patches:
    assert patch['theater'] == 'NEWURBAN'
    for key in ['sources', 'families']:
        assert not set(patch[key]) & set(full[key])
        full[key].update(patch[key])
    for edition, bindings in patch['identities'].items():
        assert not set(bindings) & set(full['identities'][edition])
        full['identities'][edition].update(bindings)
    new_families.extend(patch['families'])
assert len(new_families) == 24 and len(full['families']) == 136
full['preparedSourceSha256'] = sha(ROOT / 'source.json')
full['extensions']['batch87'] = dict(scope='Twenty complete building bodies plus four exact accepted complete families',
    priorContractSha256=sha(CONTRACT), priorSelection=old['selectedPack'], newFamilies=new_families,
    acceptedDensityFramesReused=132, uniqueNewRubbleStudies=19, sharedNewRubbleDensityFrames=2,
    state='STATIC_PASS_NATIVE_AND_NEW_RUBBLE_VISUAL_PENDING')
OUT.mkdir(exist_ok=False)
write(OUT / 'contract-full-v1.json', full)
assembly = OUT / 'assembly-v1.json'
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py',
    'newurban-environment-buildings-batch87-v1-combined', '--contract', str(OUT / 'contract-full-v1.json'),
    '--base-pointer', str(SELECTOR), '--append', verified['pack'], reused['pack'], '--receipt', str(assembly)], check=True)
result = read(assembly)
assert len(result['preservedFamilies']) == 112 and set(result['appendedFamilies']) == set(new_families)
destination = Path('.local/environment-packs') / result['pack']['revision']
assert sha(destination / 'manifest.json') == result['pack']['sha256']
for name, digest in result['payloadHashes'].items():
    assert sha(destination / name) == digest
write(OUT / 'selection-v1.json', dict(status='STATIC_PASS_COMPLETE_FAMILIES_NATIVE_PENDING',
    priorContract=old, priorContractSha256=sha(CONTRACT), priorSelectorSha256=sha(SELECTOR), candidate=result['pack'],
    newFamilies=new_families, preservedFamilies=112, worldFamilies=136, newSourceMembers=24,
    sourceBodySlots=86, densityFrames=172, reusedAcceptedDensityFrames=132,
    newlyDrawnUniqueRubbleStates=19, sharedNewRubbleDensityFrames=2,
    genericVerification=[pin(ART / 'verification-v1.json'), pin(REUSE / 'verification-v1.json')],
    motherVerification=pin(ART / 'mother-source-verification-v1.json'), assembly=pin(assembly),
    visualAcceptance='PENDING_19_NEW_RUBBLE_STUDIES_ONLY', windows='NOT_RUN', m24Complete=False))
full['selectedPack'] = result['pack']
CONTRACT.write_text(json.dumps(full, indent=2) + '\n')
SELECTOR.write_text(json.dumps(result['pack'], indent=2) + '\n')
identities = [identity for patch in patches for identity in patch['identities']['yr']]
write(OUT / 'native-plan-v1.json', dict(schema='m2-4-newurban-buildings-native-plan-v1', densities=[2, 4],
    cases=[dict(id='manhattan', map='manhatta.map',
        identities=sorted([identity for identity in identities if identity not in ['CAPARK04', 'CAPARK05', 'CAPARK06']]),
        families=sorted([family for family in new_families if not family.startswith('newurban-capark')])),
        dict(id='fight', map='fight.map', identities=['CAPARK04', 'CAPARK05', 'CAPARK06'],
        families=['newurban-capark04', 'newurban-capark05', 'newurban-capark06'])],
    deduplication='Two official original map paths contain all 24 target SHP groups. All 20 new rubble bindings and CAMISC06 occur on manhatta.map; all three exact accepted benches occur on fight.map. Other maps and mode variants use identical source/palette/role/slot hashes and unchanged unified rules. Check each family once at each density; retain actual native limits instead of inventing damage or garrison states.',
    reusedEvidence='Earlier unified mode/map loading, source parsing and unaffected terrain/faction families remain valid.'))
print(json.dumps(dict(candidate=result['pack'], completeFamilies=24, preservedFamilies=112,
    uniqueNewRubbleStates=19, densityFrames=172)))
