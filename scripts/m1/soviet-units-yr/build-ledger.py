"""Record the audited YR Soviet scope separately from the accepted RA2 ledger."""
import json, hashlib
from pathlib import Path
root = Path('.artifacts/m1-7-yr')
inv = json.loads((root/'source-v1/inventory.json').read_text())
new_states = {
 'BORIS':['all 409 native body slots and 409 original shadow slots','walk/crawl/prone/fire/secondary-designator/death','normal two-plane and elite four-plane BPLN airstrike; target destruction and plane return'],
 'CCOMAND':['all 348 native body slots and 348 original shadow slots','standing/prone fire/death and teleport visibility','stolen Allied technology unlock; building demolition and owner remap'],
 'PTROOP':['all 315 native body slots and 315 original shadow slots','mind control, release on death, building demolition','stolen Yuri technology unlock; standing/prone poses and original shadows'],
 'SCHP':['flight body and both animated rotor sections','landing, all 11 SCHPDEPL body phases with original shadows, reverse undeploy','SCHD ground body and independent SCHDTUR aim/fire','flight gun and ground 160mm normal/elite fire; movement/airborne death and shadows'],
}
rows=[]
for f in inv['families']:
 rows.append({'id':f['id'],'status':f['coverage'],'newAuthoring':f['newAuthoring'],'houses':f['houses'],'stolenTech':f['stolenTech'],
 'members':list(dict.fromkeys(f['members']+[n for c in f['children'] for n in c['members']]+[a['member'] for a in f['attachments']])),
 'requiredStates':new_states.get(f['id'],['preserve accepted artwork; check both-edition and theater fallback']),
 'sourceComparison':f['sourceComparison'],'representativeAcceptance':'ACCEPTED' if f['newAuthoring'] else f['priorAcceptance'],
 'fullProduction':'IN_PROGRESS' if f['newAuthoring'] else 'PRESERVED',
 'runtimeValidation':'NOT_RUN_FOR_NEW_FAMILY' if f['newAuthoring'] else 'PREVIOUS_DUAL_EDITION_EVIDENCE_RETAINED',
 'blockers':[]})
ledger={'schema':'m1-7-yr-soviet-coverage-v1','status':'REPRESENTATIVES_ACCEPTED_FULL_PRODUCTION','baseline':'477341f','branch':'m1-7-yr-soviet-units',
 'scope':'YR Soviet skirmish production, national variants, eligible stolen-tech identities and required unit-specific visual dependencies',
 'counts':{'sovietRoster':28,'acceptedHdReuse':23,'acceptedOriginal':1,'newFamilies':4,'newCompleteRuntimeFamilies':0},
 'dependencies':{'BORIS':['BPLN normal and elite airstrike'],'SCHP':['SCHD body','SCHDTUR turret','SCHP rotor sections and HVA phases','SCHPDEPL forward/reverse transition']},
 'exclusions':[{'id':'YURI','reason':'Yuri faction production or special map override; accepted RA2 art retained'}, {'id':'YURIPR','reason':'YR Yuri-faction YURIX appearance is outside Soviet scope; preserve RA2 guarded Original exception'}, {'id':'LUNR','reason':'Campaign-only tech level 11 and unavailable NAPILE prerequisite'}, {'id':'SQD','reason':'Included roster with explicit user-accepted Original body and attachment'}],
 'technicalRisks':['SCHP mixes VXL/HVA body/rotors/turret and a SHP deployment transition; atomic fallback across all paths must be proven', 'BORIS body and BPLN child need joint completeness and memory accounting','new pack identity must be restricted to YR, preserving RA2 selectors and accepted bytes','shared optional allocation remains 256 MiB; no unmeasured full-roster claim'],
 'review':'YR-Soviet-Units-Review-v2.html','representativeSamples':24,'reviewValidation':'review-check-v2.json','preservation':'preservation.json',
 'sourceAudit':'source-v1/inventory.json','productionAudit':'rules-audit.json',
 'referenceEvidence':'native-references-v4/result.json',
 'historicalReferenceFailures':{'native-references-v1':'sandbox prevented native app launch','native-references-v2':'capture script reported PASS but later visual inspection rejected direction/deployment contamination; do not use','native-references-v3':'overlapping fixture placement prevented deployment; timeout retained'},
 'families':rows}
worklist = json.loads((root/'production-shp-v2/worklist.json').read_text())
for row in rows:
 if not row['newAuthoring']: continue
 members = worklist['families'][row['id']]['members']
 row['bodySlots'] = sum(m['requiredSlots'] for m in members)
 row['authoredCandidateSlots'] = sum(len(b['samples']) for m in members for b in m['batches'] if b.get('selectedArt'))
 row['candidateStatus'] = 'Authored candidates require matte, registration, complete-pack and native action validation'
 row['finalAcceptance'] = 'PENDING_COMPLETE_FAMILY_REVIEW'
 if row['id'] == 'SCHP':
  row['runtimeValidation'] = 'PARTIAL_NATIVE_VALIDATION'
  row['evidence'] = ['native-chopper-v3/result.json', 'native-chopper-v5/result.json', 'native-chopper-v6/result.json', 'native-chopper-v10/result.json']
  row['validatedStates'] = ['native production with legal prerequisite fixtures', 'deploy/undeploy with native shadows', 'live rotor motion', 'normal/elite air and ground weapon damage', 'two owner colors and eight bearings for both states', 'native airborne crash following controlled lethal damage']
  row['remainingValidation'] = ['combined roster allocation and edition fallback', 'final native-size visual acceptance']
 elif row['id'] == 'BORIS':
  row['blockers'] = ['Candidate corrections: prone front/back pose, dropped death weapon, flare pistol identity; see authoring-qa-v1.json']
ledger['acceptance'] = 'representative-acceptance-v1.json'
ledger['productionWorklist'] = 'production-shp-v2/worklist.json'
ledger['newCompleteRuntimeFamilies'] = 0
(root/'coverage.json').write_text(json.dumps(ledger,indent=2)+'\n')
print(ledger['counts'])
