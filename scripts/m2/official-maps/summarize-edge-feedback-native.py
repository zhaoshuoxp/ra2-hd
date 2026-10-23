"""Pin copied R5 native building states, owner changes, fallback and release."""
import argparse
import hashlib
import json
from pathlib import Path


def read(file):
    return json.loads(file.read_text())


def pin(file):
    data=file.read_bytes()
    return dict(file=str(file.resolve()),sha256=hashlib.sha256(data).hexdigest(),bytes=len(data))


def gl_errors(value):
    if isinstance(value,dict):
        for key,item in value.items():
            if key=='glError':
                yield item
            else:
                yield from gl_errors(item)
    elif isinstance(value,list):
        for item in value:
            yield from gl_errors(item)


parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('receipt',type=Path)
parser.add_argument('plan',type=Path)
parser.add_argument('native',type=Path)
parser.add_argument('output',type=Path)
args=parser.parse_args()
assert not args.output.exists()
artifact,plan=read(args.receipt),read(args.plan)
assert read(args.native/'status.json')['status']=='PASS_COPIED_R5_CHANGED_BUILDING_CASES'
completed=read(args.native/'completed.json')
assert len(completed)==2*(len(plan['cases'])+3)
expected={f for row in plan['cases'] for f in row['families']}
seen={2:set(),4:set()}
counts={d:dict(maps=0,buildings=0,occupied=0,evacuation=0,criticalEvacuation=0,owners=0,fallback=0) for d in [2,4]}
peaks,records={},[]
for case in completed:
    file=Path(case['output'])/'report.json';report=read(file)
    density=next(int(o.split('=')[1]) for o in case['options'] if o.startswith('--density='))
    assert report['status']=='PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['app']==artifact['app'] and report['resources']==artifact['resources']
    assert all(error==0 for error in gl_errors(report))
    record=dict(**pin(file),script=case['script'],density=density,status=report['status'],reused=case.get('reused',False))
    count=counts[density]
    if case['script']=='native-coverage':
        requested=report['requestedFamilies'];seen[density].update(requested)
        assert report['selectedEnvironmentRevision']=='environment-m2-3-edge-feedback-complete-v6'
        for family in requested:
            binding=report['environment']['families'][family]
            assert binding['status']=='PUBLISHED_COMPLETE_FAMILY' and binding['density']==density
        allocation=report['combinedWorldAllocation']
        assert allocation['total']<=allocation['limit']==(512 if density==2 else 1280)*1024**2
        assert report['graphics']['output']==[3840,2160]
        if density not in peaks or allocation['total']>peaks[density]['total']:
            peaks[density]=dict(case=Path(case['output']).name,**allocation)
        states=report['newNativeStates']
        assert states['status']=='PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
        count['maps']+=1;count['buildings']+=len(states['buildings'])
        count['occupied']+=sum('occupied' in row for row in states['buildings'])
        count['evacuation']+=len(states['evacuation']);count['criticalEvacuation']+=len(states['criticalDamageEvacuation'])
        if 'release' in report:
            assert all(report['release'][layer]['disposed'] and report['release'][layer]['worldChargeBytes']==0
                       for layer in ['environment','terrain'])
        record.update(families=requested,combinedWorldAllocation=allocation)
    elif case['script']=='native-building-owners':
        assert report['ownerAudit']=='PASS_NATIVE_SELECTED_PART_PALETTES_AND_MATCHED_ORIGINAL_HD'
        names=next(option.split('=')[1].split(',') for option in case['options'] if option.startswith('--names='))
        assert {row['name'] for row in report['cases']}==set(names)
        assert all(row['originalRestoration']=='COMPLETE_BUILDING_FAMILY_SAME_SYNCHRONOUS_NATIVE_TICK' for row in report['cases'])
        for row in report['cases']:
            if row['name'] in {'CATEXS08','CANEWY20'}:
                native_member={'CATEXS08':'cttexs08.shp','CANEWY20':'ctnewy20.shp'}[row['name']]
                body=next(part for part in row['binding']['parts']
                          if part['member'] in {native_member,f"agg_{row['name']}.shp"})
                assert body['frame']==2,'Red/blue comparison must exercise the actual occupied state'
                assert body['visible'] and body['hd'],'The occupied body must have a visible HD native binding'
        count['owners']+=len(report['cases'])
    else:
        count['fallback']+=1
        assert report['corruptMember']['environment']['families']['environment-ctoutp']['status']=='ORIGINAL'
        assert report['missingPack']['environment']['worldChargeBytes']==0
        assert all(v['disposed'] and v['worldChargeBytes']==0 for v in report['release'].values())
    records.append(record)
for density in [2,4]:
    assert seen[density]==expected
    assert counts[density]['maps']==len(plan['cases']) and counts[density]['owners']==8 and counts[density]['fallback']==1
result=dict(schema='m2-3-r5-copied-native-summary-v1',status='PASS_ALL_30_COPIED_R5_NATIVE_CASES',
    app=artifact['app'],resources=artifact['resources'],runtimeSourceCommit=artifact['sourceHead'],packageReceipt=pin(args.receipt),
    caseCount=len(records),requestedFamiliesPerDensity=len(expected),countsByDensity=counts,
    combinedWorldPeaks=peaks,cases=records,nativeAvailabilityExceptions=plan['notNativeSelectable'],
    userAcceptance=False,windows='NOT_RUN',physicalInput='NOT_RUN',mainIntegration=False)
args.output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='cases'}))
