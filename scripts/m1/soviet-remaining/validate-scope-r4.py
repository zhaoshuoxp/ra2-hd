"""Verify R4's only changed building member and preservation of delivered R3."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image
root=Path('.artifacts/soviet-remaining')
read=lambda p:json.loads((root/p).read_text())
def sha(p):
    with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
prior=read('production-selection-r4.json');selected=read('production-selection-r5.json')
report={'status':'PASS_BOUNDED_R4_EXPORTS','families':{},'acceptedArtFiles':0,'constructionExportsUnchanged':0}
for name,entry in selected.items():
    old=Path(prior[name]['exports']);new=Path(entry['exports']);same=changed=0
    for row in json.loads((new/'candidate-review.json').read_text())['frames']:
        for e in row['exports']:
            for key in ['base','data']:
                equal=(old/e[key]).read_bytes()==(new/e[key]).read_bytes()
                if name!='NAMISL' or row['member']!='ngmisl_h.shp':assert equal,(name,e[key])
                same+=int(equal);changed+=int(not equal)
                if 'mk.shp' in row['member']:assert equal;report['constructionExportsUnchanged']+=1
    report['families'][name]={'unchangedFiles':same,'changedFiles':changed}
# Recover full canvases to compare the fixed platform across changing trim boxes.
out=Path(selected['NAMISL']['exports']);raw=read('source-v1/NAMISL/ngmisl_h.shp.json')
def full(member,n):
    source=read('source-v1/NAMISL/'+member+'.json');frame=source['frames'][n]
    im=Image.new('RGBA',tuple(v*2 for v in source['canvas']));im.paste(Image.open(out/f'{member[:-4]}-{n:02}-2x.png'),(frame['x']*2,frame['y']*2));return np.array(im)
for start in [0,16]:
    base=full('ngmisl_h.shp',start)[340:]
    for n in range(start,start+16):assert np.array_equal(full('ngmisl_h.shp',n)[340:],base),n
    assert np.array_equal(full('ngmisl_h.shp',start+15),full('ngmisl_e.shp',int(start>0)))
report['siloPlatform']='PASS_IDENTICAL_PERIMETER_ALL_FRAMES'
report['siloEndpoint']='PASS_EXACT_ACCEPTED_CLOSED_PIXELS'
for row in read('feedback-r3/feedback.json')['preservedArt']:
    assert sha(row['path'])==row['sha256'];report['acceptedArtFiles']+=1
artifact=read('build-2026-09-21T23-06-25-632Z/artifact.json')
for row in artifact['bundle']:
    p=Path(artifact['artifact'])/row['file']
    assert str(p.readlink())==row['link'] if 'link' in row else sha(p)==row['sha256']
receipt=read('desktop-transfer-r3/receipt.json');assert sha(receipt['archive'])==receipt['sha256']
for row in read('desktop-transfer-r3/RA2-HD-Soviet-Buildings-R3-macOS-arm64-App-Resources-Review/RESOURCE-MANIFEST.json')['files']:
    if row['file'] not in ['ra2-core-manifest.json','upstream-support/manifest.json']:assert sha(Path('.local')/row['file'])==row['sha256'],row['file']
report['r3AppAndZip']='PASS';report['r3SelectedResources']='PASS';report['r3ZipSha256']=receipt['sha256']
(root/'feedback-r4/scope-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(report)
