"""Assemble a generated replacement cell, preserving every other authored pixel."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('identity')
parser.add_argument('frame', type=int)
args = parser.parse_args()
root = Path('.artifacts/m1-7-yr/single-cell-corrections-v3')
entry = next(e for e in json.loads((root / 'selected-plan.json').read_text())
             if e['identity'] == args.identity and e['frame'] == args.frame)
base = Image.open(entry['base']).convert('RGBA')
patch_path = root / f'{args.identity}-{args.frame}-generated.png'
patch = Image.open(patch_path).convert('RGBA')
x, y, right, bottom = entry['box']
patch = patch.resize((right-x, bottom-y), Image.Resampling.LANCZOS)
result = base.copy()
result.paste(patch, (x, y))
# Pixels outside the selected cell must stay exactly equal.
for box in [(0,0,base.width,y),(0,bottom,base.width,base.height),
            (0,y,x,bottom),(right,y,base.width,bottom)]:
    assert base.crop(box).tobytes() == result.crop(box).tobytes()
output = root / f'{args.identity}-{args.frame}-composite.png'
assert not output.exists()
result.save(output)
subprocess.run(['python3','scripts/m1/soviet-units-yr/record-authoring.py',
                '.artifacts/m1-7-yr/production-shp-v2/worklist.json',args.identity,
                entry['batch'],str(output),'--revision','3','--prompt',entry['prompt']],check=True)
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
(root / f'{args.identity}-{args.frame}-receipt.json').write_text(json.dumps({
    'status':'PASS_ONLY_SELECTED_CELL_CHANGED','frame':args.frame,'box':entry['box'],
    'baseSha256':sha(entry['base']),'generatedSha256':sha(patch_path),
    'compositeSha256':sha(output),'operation':'Uniform resampling and cell assembly only',
},indent=2)+'\n')
