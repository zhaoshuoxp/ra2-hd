import hashlib
import json
import shutil
import stat
import subprocess
import zipfile
import sys
from pathlib import Path

repo = Path.cwd()
revision = sys.argv[2] if len(sys.argv) > 2 else ('R2' if len(sys.argv) > 1 else 'R1')
assert revision in ['R1', 'R2', 'R3', 'R4']
out = repo / '.artifacts/soviet-remaining' / ('desktop-transfer-' + revision.lower() if revision != 'R1' else 'desktop-transfer-v1')
out.mkdir(exist_ok=False)
folder = out / f'RA2-HD-Soviet-Buildings-{revision}-macOS-arm64-App-Resources-Review'
folder.mkdir(exist_ok=False)
artifact = json.loads(Path(sys.argv[1]).read_text()) if len(sys.argv) > 1 else json.loads((repo / '.artifacts/soviet-remaining/build-2026-09-21T20-35-44-119Z/artifact.json').read_text())
app = Path(artifact['artifact'])
source = repo / '.local'

def sha(p):
    with p.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def plan(root):
    script = """
import {validateProfile} from './desktop/profile.mjs';
import {registerHdResources,sovietBatchRevisions} from './desktop/hd-profile.mjs';
import path from 'node:path';
const root=process.argv[1],profile=await validateProfile(root),hd=await registerHdResources(root);
if(Object.keys(hd.availability).length!==21||Object.values(hd.availability).some(v=>!v.startsWith('HD available')))throw Error('Incomplete resources');
const files=new Set([...profile.routes.values(),...hd.routes.values()].map(p=>path.relative(root,p)));
for(const p of ['ra2-core-manifest.json','upstream-support/manifest.json','hd-packs/power-plant-authored/1/family.json','hd-packs/soviet-power-plant-authored/2/family.json',...Object.keys(sovietBatchRevisions).map(n=>`hd-packs/soviet-${n}-authored/${sovietBatchRevisions[n]}/family.json`)])files.add(p);
console.log(JSON.stringify({availability:hd.availability,files:[...files].sort()}));
"""
    return json.loads(subprocess.check_output(['node','--input-type=module','-e',script,str(root)],cwd=repo,text=True))

for row in artifact['bundle']:
    p=app/row['file']
    assert (str(p.readlink())==row['link']) if 'link' in row else sha(p)==row['sha256']
subprocess.run(['/usr/bin/ditto',str(app),str(folder/app.name)],check=True)
print('App copied with native permissions and links',flush=True)
resources=folder/f'RA2-HD-Soviet-Buildings-{revision}-Resources'
resources.mkdir()
selected=plan(source)
for relative in selected['files']:
    old=source/relative;new=resources/relative
    assert old.is_file() and old.resolve()==old
    new.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(old,new)
    assert sha(old)==sha(new)
# Keep only the portable fields consumed by the loader; no host paths or profiles.
core=json.loads((source/'ra2-core-manifest.json').read_text())
(resources/'ra2-core-manifest.json').write_text(json.dumps(dict(schemaVersion=1,files=[{k:r[k] for k in ['virtualName','bytes','sha256','validation']} for r in core['files']]),indent=2)+'\n')
support=json.loads((source/'upstream-support/manifest.json').read_text())
(resources/'upstream-support/manifest.json').write_text(json.dumps([{k:r[k] for k in ['original','commit','sha256','bytes']} for r in support if Path(r['original']).name in ['general.csf','ra2cd.mix']],indent=2)+'\n')
assert plan(resources)==selected
print('All 21 HD selections and base resources validated in copied folder',flush=True)
(folder/'START-HERE.txt').write_text("""Red Alert 2 HD Soviet Buildings R1 - Mac arm64 app, resources and complete review

1. Extract the entire ZIP into a new folder.
2. Open Red Alert 2 HD Soviet Buildings R1.app.
3. If asked for resources, choose the included RA2-HD-Soviet-Buildings-R1-Resources folder.
   Keep this external resource folder available.
4. HD graphics is one default-on setting in Options. Changes apply fully next match.
5. Open Review/Soviet-Buildings-Review.html for all 13 new complete families.
   The page includes native-size comparisons, normal/damaged states, animation playback,
   frame stepping and turret headings. Keep the Review/media folder next to the page.
6. Open Review/Validation-Dashboard.html for measured checks and remaining acceptance items.

Previously accepted resources are retained. This app uses its own separate user profile.
Representative artwork and proportion corrections are accepted. Complete-family visual and
full gameplay acceptance remain pending. The physical paused-menu cursor handoff still needs
human verification. Test fixtures and limits are labeled; a technical pass is not visual approval.

Local development Mac application. No installation, system changes, publication or profile migration.
""")
if revision != 'R1':
    start = folder / 'START-HERE.txt'
    start.write_text(start.read_text().replace('R1', revision).replace('all 13 new complete families', 'all 17 Soviet families').replace('Representative artwork and proportion corrections are accepted.', 'Static models are accepted. Construction, moving-layer alignment, civilian evacuation and loading are corrected.'))
if revision == 'R3':
    start.write_text(start.read_text().replace('Static models are accepted. Construction, moving-layer alignment, civilian evacuation and loading are corrected.', 'Static models and R2 construction motion are accepted. R3 corrects Psychic Sensor registration, Tesla arc visibility, owner colors and complete crane layers. Review these five corrections in the included dashboard.'))
if revision == 'R4':
    start.write_text(start.read_text().replace('Static models are accepted. Construction, moving-layer alignment, civilian evacuation and loading are corrected.', 'R3 corrections are accepted. R4 adds concentric targeting rings, four complete HD target cursor animations and rigid post-launch silo closure. Review Target-Cursors-Review.html and Range-Markers-Review.html alongside silo closure.'))
review = repo / '.artifacts/soviet-remaining' / ('complete-review-' + revision.lower() if revision != 'R1' else 'complete-review-v1')
shutil.copytree(review,folder/'Review')
review_name='Review/Soviet-Buildings-Review.html'
review_file=review/'Soviet-Buildings-Review.html'
validation=json.loads((review/'validation.json').read_text())
review_files=[dict(file=str(p.relative_to(review)),sha256=sha(p)) for p in sorted(review.rglob('*')) if p.is_file()]
(folder/'REVIEW-MANIFEST.json').write_text(json.dumps(review_files,indent=2)+'\n')

manifest=dict(status='PACKAGED_FINAL_VISUAL_REVIEW_PENDING',sourceCommit=artifact['source']['head'],sourceSnapshot=artifact['source']['sourceDigest'],sourceDirtyAtBuild=True,validatedSourceCommit=validation['sourceBinding']['currentCommit'],app=app.name,resources=resources.name,availability=selected['availability'],files=[dict(file=str(p.relative_to(resources)),bytes=p.stat().st_size,sha256=sha(p)) for p in sorted(resources.rglob('*')) if p.is_file()])
(folder/'RESOURCE-MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
archive=out/(folder.name+'.zip')
assert not archive.exists()
subprocess.run(['/usr/bin/ditto','-c','-k','--sequesterRsrc','--keepParent',str(folder),str(archive)],check=True)
print('ZIP created; checking every member, symlink and executable permission',flush=True)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for row in artifact['bundle']:
        item=z.getinfo(f'{folder.name}/{app.name}/{row["file"]}')
        with z.open(item) as stream:
            if 'link' in row:
                assert stat.S_ISLNK(item.external_attr>>16) and stream.read().decode()==row['link']
            else:
                assert hashlib.file_digest(stream,'sha256').hexdigest()==row['sha256']
    assert z.getinfo(f'{folder.name}/{app.name}/Contents/MacOS/Electron').external_attr>>16 & stat.S_IXUSR
    assert z.getinfo(f'{folder.name}/{app.name}/Contents/Resources/app/desktop/restore-cursor').external_attr>>16 & stat.S_IXUSR
    with z.open(f'{folder.name}/{review_name}') as stream:
        assert hashlib.file_digest(stream,'sha256').hexdigest()==sha(review_file)
    for row in manifest['files']:
        with z.open(f'{folder.name}/{resources.name}/{row["file"]}') as stream:
            assert hashlib.file_digest(stream,'sha256').hexdigest()==row['sha256']
    for row in review_files:
        with z.open(f'{folder.name}/Review/{row["file"]}') as stream:
            assert hashlib.file_digest(stream,'sha256').hexdigest()==row['sha256']
    assert all('/profile/' not in n and '/UserData/' not in n for n in z.namelist())
receipt=dict(status='PASS_COMBINED_MAC_RESOURCE_ARCHIVE',archive=str(archive),bytes=archive.stat().st_size,sha256=sha(archive),resourceFiles=len(manifest['files']),availability=selected['availability'],appEntriesChecked=len(artifact['bundle']),sourceArtifact=artifact['artifact'],validationStatus=validation['status'],visualAcceptance='REPRESENTATIVES_ACCEPTED_COMPLETE_VISUAL_AND_GAMEPLAY_PENDING',physicalCursor='UNVERIFIED',review=dict(file=review_name,sha256=sha(review_file),families=13,nativeMotionSamples=1278,completeFamilies=13,authoredShpSlots=1102,turretHeadings=16))
if revision != 'R1':
    receipt['review'].update(families=len(validation['families']), completeFamilies=len(validation['families']),
                             nativeMotionSamples=validation['nativeMotionSamples'], authoredShpSlots=validation['authoredShpSlots'])
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2),flush=True)
