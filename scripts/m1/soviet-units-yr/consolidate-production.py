"""Pin the complete candidate resources and consolidate measured evidence."""
import hashlib
import json
from pathlib import Path

root = Path('.artifacts/m1-7-yr')
def read(path):
    return json.loads(Path(path).read_text())
def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + '\n')
def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

selected = {
    'BORIS': ['yr-soviet-boris-family/2', 'yr-soviet-boris-authored/2', 'yr-soviet-boris-vxl/1'],
    'CCOMAND': ['yr-soviet-ccomand-family/1', 'yr-soviet-ccomand-authored/1'],
    'PTROOP': ['yr-soviet-ptroop-family/1', 'yr-soviet-ptroop-authored/1'],
    'SCHP': ['yr-soviet-schp-family/1', 'yr-soviet-schpdepl-authored/2', 'yr-soviet-schp-vxl/1'],
}
files, families = [], []
for identity, directories in selected.items():
    family = Path('.local/hd-packs') / directories[0] / 'family.json'
    families.append(dict(id=identity, path=str(family.relative_to('.local')), sha256=digest(family)))
    for directory in directories:
        for file in sorted((Path('.local/hd-packs') / directory).rglob('*')):
            if file.is_file():
                files.append(dict(path=str(file.relative_to('.local')), bytes=file.stat().st_size, sha256=digest(file)))
write('docs/m1-7-yr-resources.json', dict(schema='m1-7-yr-unit-resources-v1', status='TECHNICALLY_VALIDATED_CANDIDATES_FINAL_ACCEPTANCE_PENDING', families=families, files=files))

baseline = read(root/'baseline-resource-hashes.json')
accepted = read('docs/m1-7-accepted-resources.json')['files']
buildings = read(root/'main-building-resource-sync-v1.json')['added']
for row in baseline + accepted + buildings:
    for tree in [Path('.local'), Path('/Users/Aone/RA2remaster/ra2-hd/.local')]:
        assert digest(tree / row['path']) == row['sha256'], str(tree / row['path'])
representatives = read(root/'representative-acceptance-v1.json')
for row in representatives['families']:
    assert digest(row['raw']) == row['rawSha256']
assert digest(root/representatives['review']) == representatives['reviewSha256']
write(root/'production-preservation-v1.json', dict(status='PASS', existingHdFiles=len(baseline), acceptedUnitFiles=len(accepted), addedBuildingFiles=len(buildings), acceptedRepresentatives=5, verification='All hashes match in main and isolated resources; accepted representative raw files and review are unchanged. No main files were written.'))

coverage = read('docs/m1-7-yr-coverage.json')
coverage.update(status='COMPLETE_FAMILY_REVIEW_PENDING', integratedMain='2475407', newCompleteRuntimeFamilies=4,
    review='YR-Soviet-Units-Full-Review-v1.html', reviewValidation='full-review-check-v1.json',
    preservation='production-preservation-v1.json', resourceInventory='docs/m1-7-yr-resources.json',
    finalAcceptance='PENDING_COMPLETE_FAMILY_VISUAL_AND_GAMEPLAY_REVIEW')
coverage['counts'].update(newCompleteRuntimeFamilies=4, hdRosterEntries=27, originalRosterEntries=1, newInfantryBodyFrames=1072, schpDeploymentPhases=11)
coverage['technicalRisks'] = [
    'Final complete-family visual/gameplay acceptance remains pending.',
    'Source-matched theater reuse includes the current main snow fix; packaged temperate/snow regression is recorded separately.',
    'Other theaters, Windows, campaigns and natural-match victory are not certified by the controlled fixtures.',
    'General weapon effects and generic death animations remain native. Required unit-specific dependencies are included.',
]
config = {i:dict(sweep=f'native-{i.lower()}-sweep-v1',actions=f'native-{i.lower()}-actions-v3') for i in ['BORIS','CCOMAND','PTROOP']}
config['SCHP'] = dict(actions='native-chopper-v11')
write(root/'full-review-inputs.json',config)
for row in coverage['families']:
    identity=row['id']
    row['runtimeValidation']='PASS_COMBINED_YR_NATIVE_BINDING'
    if not row['newAuthoring']:
        continue
    for field in ['candidateStatus','remainingValidation']:
        row.pop(field,None)
    row.update(status='HD_COMPLETE_CANDIDATE', fullProduction='COMPLETE_VERSIONED_RESOURCES',
        runtimeValidation='PASS_NATIVE_ACTIONS_AND_COMPLETE_RESOURCES', blockers=[],
        finalAcceptance='PENDING_COMPLETE_FAMILY_REVIEW', resourceFamily=next(f for f in families if f['id']==identity))
    row['evidence']=[config[identity]['actions']+'/result.json','native-roster-v1/result.json']
    if identity!='SCHP':
        result=read(root/config[identity]['actions']/'result.json')
        assert result['status'].startswith('PASS_')
        row['evidence'].append(config[identity]['sweep']+'/result.json')
        row['nativeDeathFrames']=result['nativeDeathFrames']
        row['authoredCandidateSlots']=row['bodySlots']
    if identity=='BORIS':
        row['evidence'].append('native-bpln-v1/result.json')
        row['validatedStates']=['native production and movement','primary weapon damage','normal two-plane and elite four-plane HD airstrikes, target destruction and return','native gunfire death sequence','409 slots, two owners, geometry/shadow/disposal validation','BPLN two-owner eight-heading rendering']
    elif identity=='CCOMAND':
        row['validatedStates']=['native Allied lab spy infiltration opens production gate','native production and teleport recovery','primary weapon damage and C4 building destruction','native gunfire death sequence','348 slots, two owners, geometry/shadow/disposal validation']
    elif identity=='PTROOP':
        row['validatedStates']=['native Yuri lab spy infiltration opens production gate','native production and movement','mind control and C4 building destruction','mind-control release on death','native gunfire death sequence','315 slots, two owners, geometry/shadow/disposal validation']
coverage['historicalValidationFailures']={
    'native-boris-actions-v2':'Harness incorrectly expected unit Die frames for a tank warhead that selects the native generic explosion. v3 uses a native gunfire warhead and observes all 15 Die1 frames.',
    'production-tests-v5':'Merged desktop empty-resource expectation omitted four YR entries; corrected expectation and rerun.',
    'boris-authored/1':'Rejected export: alpha-zero label area became opaque during masking in two extended flare crops; revision 2 respects source alpha and excludes labels.',
}
coverage['allocation'] = dict(totalCapBytes=268435456, measuredTemperateOptionalBaseBytes=185996700, measuredUnitBytes=59518140, measuredTotalBytes=245514840, headroomBytes=22920616, evidence='native-roster-v1/result.json', disclosure='Controlled simultaneous 28-root placement with accepted building/base allocation; packaged checks confirm final build. Retains existing cap and whole-family fallback.')
write('docs/m1-7-yr-coverage.json',coverage)
write(root/'coverage.json',coverage)
production=read(root/'production-ledger.json');production['status']='COMPLETE_FAMILY_REVIEW_PENDING';production['coverageLedger']='docs/m1-7-yr-coverage.json'
for identity in selected:
    production['families'][identity]['productionStatus']='COMPLETE_TECHNICALLY_VALIDATED_CANDIDATE'
    production['families'][identity]['resourceDirectories']=selected[identity]
write(root/'production-ledger.json',production)
qa=read(root/'authoring-qa-v1.json')
qa['status']='CORRECTED_CANDIDATES_NATIVE_REVIEW_COMPLETE_HUMAN_ACCEPTANCE_PENDING'
qa['resolution']={'BORIS':'Corrected pose, dropped equipment and flare identity via versioned image-generated boards; v3 corrected reload cell and away-facing fire/flare sheets. Alpha-aware revision 2 export removed label artifacts. All slots passed native sweep; final contacts inspected.', 'CCOMAND':'Corrected prone/crouch and death posture, including single-cell frame 157. Frame 88 native comparison identifies backpack/weapon protrusions; no further duplicate-rifle edit selected. Native red/blue contacts inspected.', 'PTROOP':'Corrected back crawl, prone firing and corpse direction with v2 boards. Both-owner native contacts inspected.'}
qa['selectedReviews']=['boris-production-review-v4','ccomand-production-review-v3','ptroop-production-review-v2','schp-deploy-review-v2']
write(root/'authoring-qa-resolution-v2.json',qa)
print(dict(resourceFiles=len(files),coverage=coverage['counts']))
