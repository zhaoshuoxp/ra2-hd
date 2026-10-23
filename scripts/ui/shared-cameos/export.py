"""Export native-sized cameo additions while retaining every accepted UI entry and byte."""
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / '.artifacts/shared-cameos'
REVISION = 'shared-cameos-ra2-yr-v1'
sha = lambda data: hashlib.sha256(data).hexdigest()
inv = json.loads((ART/'inventory-v1/inventory.json').read_text())
old = ROOT/'.local/ui-packs'/inv['selected']['revision']
old_bytes = (old/'manifest.json').read_bytes()
assert sha(old_bytes) == inv['selected']['sha256']
manifest = json.loads(old_bytes)
pack = ROOT/'.local/ui-packs'/REVISION
assert not pack.exists()
shutil.copytree(old, pack)
manifest['revision'] = REVISION
canonical = ['bfrticon','bnkricon','brisicon','gdgiicon','indpicon','rbccicon','roboicon','schpicon','spypicon']
aliases = {'bfrtuico':'bfrticon','brisuico':'brisicon','gdgiuico':'gdgiicon','schpuico':'schpicon','falcuico':'falcicon'}
records, pairs = [], []
for name in canonical:
    master = ART/'production-v1/masters'/f'{name}.png'
    image = Image.open(master).convert('RGBA')
    assert image.width > 240 and abs(image.width/image.height - 1.25) < .004
    assert image.getchannel('A').getextrema() == (255,255)
    for density in (2,4):
        folder = ART/f'production-v1/{density}x';folder.mkdir(exist_ok=True)
        target = folder/f'{name}.png'
        image.resize((60*density,48*density),Image.Resampling.LANCZOS).save(target)
        records.append(dict(id=name+'.shp',density=density,file=str(target.relative_to(ROOT)),
                            sha256=sha(target.read_bytes()),masterSha256=sha(master.read_bytes())))
        if density == 4:
            shutil.copy2(target,pack/target.name)
            manifest['assets'].append(dict(id=name+'.shp',file=target.name,sha256=sha(target.read_bytes()),
                                          width=240,height=192,logicalWidth=60,logicalHeight=48))
for alias,base in aliases.items():
    normal = next(a for a in manifest['assets'] if a['id'] == base+'.shp')
    manifest['assets'].append(dict(normal,id=alias+'.shp',overlay='cameo-rank'))
    if alias == 'falcuico':
        pairs.append(dict(alias=alias+'.shp',base=base+'.shp',status='MISSING_NATIVE_ALT_NORMAL_FRAME_AND_HD_RANK_FALLBACK'))
    else:
        native = ART/'inventory-v1/yr'
        a=np.frombuffer((native/f'{alias}.shp.rgba').read_bytes(),np.uint8).reshape(48,60,4)
        b=np.frombuffer((native/f'{base}.shp.rgba').read_bytes(),np.uint8).reshape(48,60,4)
        changed=np.any(a!=b,axis=2);outside=changed.copy();outside[:13,:21]=False
        assert not outside.any()
        pairs.append(dict(alias=alias+'.shp',base=base+'.shp',status='NATIVE_RANK_ONLY_DIFFERENCE',changedPixels=int(changed.sum())))
assert len(manifest['assets']) == 488
assert len({a['id'] for a in manifest['assets']}) == 488
previous=json.loads(old_bytes)
assert manifest['assets'][:474] == previous['assets'] and manifest['menuVideo'] == previous['menuVideo']
retained=0
for path in old.rglob('*'):
    if path.is_file() and path.name != 'manifest.json':
        assert sha(path.read_bytes()) == sha((pack/path.relative_to(old)).read_bytes());retained+=1
payload=(json.dumps(manifest,indent=2)+'\n').encode();(pack/'manifest.json').write_bytes(payload)
selection=dict(schemaVersion=1,revision=REVISION,sha256=sha(payload),reviewOnly=False)
(ROOT/'.local/ui-selection.json').write_text(json.dumps(selection,indent=2)+'\n')
report=dict(status='PASS_ADDITIVE_EXPORT_AND_PRESERVATION',selection=selection,previous=inv['selected'],
            canonical=canonical,aliases=pairs,exports=records,retainedEntries=474,retainedFiles=retained,
            entries=488,uiBudgetBytes=16*1024*1024,logicalSize=[60,48],runtimeDensity=4,companionDensity=2,
            visualStatus='NEW_ART_PENDING_USER_REVIEW')
(ART/'production-v1/export-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(report['status'],report['entries'],retained)
