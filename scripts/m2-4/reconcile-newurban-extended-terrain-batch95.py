"""Reconcile every original map identity against newly complete terrain sources."""
from collections import Counter
from pathlib import Path
import subprocess
from newurban_batch95_io import ROOT, pin, read, write

parent_file=Path('.artifacts/m2-4/newurban-secondary-terrain-reuse-batch94-20261021/inventory-reconciliation-v1.json')
parent=read(parent_file)
current_file=ROOT/'inventory-newurban-v1/inventory.json'
current,old=read(current_file),read(parent['currentInventory']['file'])
assert pin(parent['currentInventory']['file'])==parent['currentInventory']
assert current['archivePins']==old['archivePins'] and not current['issues']
identity=lambda d:{m['mapId']:{k:m[k] for k in ['source','catalogSource','declaration','classification','gameplayStatus']} for m in d['maps']}
assert identity(current)==identity(old) and len(current['maps'])==8
credits={r['key']:r for r in parent['creditedSourceGroups']}
raw=[g for g in current['resourceGroups'] if g['theater']=='NEWURBAN' and 'MISSING_AUTHORED_FAMILY' in g['decisions']]
rows,before={r['key']:r for r in current['rows']},{r['key']:r for r in old['rows']}
fields=['edition','theater','kind','id','source','dependencies','palette','hasShadow','remapable','drawOffset','paletteType','nativeArt','nativeRules']
for group in raw:
    if group['key'] in credits:
        assert group['sha256']==credits[group['key']]['sha256']
        assert all(rows[k].get(f)==before[k].get(f) for k in group['rowKeys'] for f in fields)
remaining=[g for g in raw if g['key'] not in credits]
remaining_keys={r['key'] for r in remaining}
covered=[r for r in parent['remainingGaps'] if r['key'] not in remaining_keys]
export=read(ROOT/'export-and-preservation-v4.json')
assert len(raw)==85 and len(remaining)==37 and len(covered)==36
assert {r['member'] for r in covered}=={r['member'] for r in export['records']}
assert all(r['kind']=='tmp' for r in covered)
assert current['selectedResources']['theaters']['NEWURBAN']['terrain']==export['candidate']
assert set(parent['deferredSlopes'])<={r['member'] for r in remaining}
runtime=read(ROOT/'active-stage-v1.json')['runtimeSourceHead']
changes=subprocess.check_output(['git','diff',parent['sourceRuntimeCommit'],runtime,'--name-only','--','src','desktop'],text=True).splitlines()
assert changes==['desktop/terrain-theater-hd-contracts.json']
write(ROOT/'inventory-reconciliation-v1.json',dict(
    status='PASS_36_NEW_TERRAIN_MEMBERS_ALL_EIGHT_OFFICIAL_MAP_IDENTITIES_RETAINED',
    currentInventory=pin(current_file),parentReconciliation=pin(parent_file),priorInventory=parent['currentInventory'],
    rawScannerMissingAuthoredGroups=len(raw),unchangedAcceptedFactionGroupsCredited=len(credits),
    creditedSourceGroups=list(credits.values()),acceptedFactionEvidence=parent['acceptedFactionEvidence'],
    sourceRuntimeCommit=runtime,applicationDifferences=changes,sharedRuntimeCodeChanged=False,
    newCoveredSourceGroups=covered,remainingAuthoredGaps=len(remaining),remainingByKind=dict(Counter(r['kind'] for r in remaining)),
    remainingGaps=remaining,deferredSlopes=parent['deferredSlopes'],unresolvedDependencyGroups=parent['unresolvedDependencyGroups'],
    **{k:parent[k] for k in ['directoryEntries','uniqueMapFiles','uniqueMapStreams','selectableMaps','sourceModeVariants','overlappingSourceModeLabels']},
    disclosure='Every newly selected physical source includes both densities and all native slots. Prior accepted artwork and filtering inputs remain exact. Four original wide-road slopes and every other unresolved source remain listed; no map or mechanism is removed.',
    windows='NOT_RUN',visual='PENDING_NEW_TERRAIN_CONTEXT',mainIntegration='NOT_PERFORMED',m24Complete=False))
print(dict(covered=36,remaining=37,byKind=dict(Counter(r['kind'] for r in remaining))))
