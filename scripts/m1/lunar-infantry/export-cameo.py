"""Add the approved Lunar Infantry cameo without changing accepted UI bytes."""
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image

root = Path('.local'); art = Path('.artifacts/lunar-infantry')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
previous = json.loads((root/'ui-selection.json').read_text())
assert previous['revision'] == 'shared-cameos-ra2-yr-v1'
old = root/'ui-packs'/previous['revision']
assert sha(old/'manifest.json') == previous['sha256']
manifest = json.loads((old/'manifest.json').read_text())
assert len(manifest['assets']) == 488
revision = 'lunar-infantry-ui-v1'; out = root/'ui-packs'/revision
shutil.copytree(old,out)
exports = art/'cameo-exports-v1'; exports.mkdir()
master = art/'authoring-v1/cameo-master.png'
assert sha(master) == json.loads(Path('docs/lunar-infantry-acceptance.json').read_text())['cameoMasterSha256']
records=[]
for density in [2,4]:
    file=exports/f'lunricon-{density}x.png'
    Image.open(master).convert('RGBA').resize((60*density,48*density),Image.Resampling.LANCZOS).save(file)
    records.append(dict(file=str(file),density=density,sha256=sha(file)))
shutil.copy2(exports/'lunricon-4x.png',out/'lunricon.png')
normal=dict(id='lunricon.shp',file='lunricon.png',sha256=sha(out/'lunricon.png'),
            width=240,height=192,logicalWidth=60,logicalHeight=48)
manifest['assets'].extend([normal,dict(normal,id='lunruico.shp',overlay='cameo-rank')])
manifest['revision']=revision
assert len({a['id'] for a in manifest['assets']})==490
retained=0
for file in old.rglob('*'):
    if file.is_file() and file.name!='manifest.json':
        assert sha(file)==sha(out/file.relative_to(old));retained+=1
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
selection=dict(schemaVersion=1,revision=revision,sha256=sha(out/'manifest.json'),reviewOnly=False)
(root/'ui-selection.json').write_text(json.dumps(selection,indent=2)+'\n')
(exports/'receipt.json').write_text(json.dumps(dict(status='PASS_ADDITIVE_EXPORT',previous=previous,
    selection=selection,entries=490,retainedEntries=488,retainedFiles=retained,exports=records),indent=2)+'\n')
print(json.dumps(selection))
