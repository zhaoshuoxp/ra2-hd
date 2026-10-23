"""Prepare immutable native references for rejected heading and rubble cells."""
import json
from pathlib import Path

from PIL import Image

root = Path('.artifacts/m2-2/authoring-final-repairs-v1')
root.mkdir(exist_ok=False)
source = Path('.artifacts/m2-2/authoring-vxl-v2/PTRUCK-ptruck-DUMMY01-reference.png')
jobs = []
for heading, cell, view in [
    (45, (512, 0, 1024, 512), 'REAR view. The open cargo bed and its closed tailgate face the camera. The cab is behind the open bed. Small red tail lamps sit beside the tailgate.'),
    (225, (512, 512, 1024, 1024), 'FRONT view. The curved hood, dark horizontal radiator grille and two pale white headlamps face the camera. The windshield is behind the hood and the open bed is behind the cab.')
]:
    name = f'PTRUCK-{heading}-bearing-repair'
    native = Image.open(source).convert('RGBA').crop(cell)
    native = native.crop(native.getbbox())
    native.thumbnail((1000, 1000), Image.Resampling.NEAREST)
    factor = min(1000 / native.width, 1000 / native.height)
    native = native.resize((round(native.width * factor), round(native.height * factor)), Image.Resampling.NEAREST)
    board = Image.new('RGBA', (1254, 1254))
    board.alpha_composite(native, ((1254 - native.width) // 2, (1254 - native.height) // 2))
    reference = root / (name + '-reference.png')
    board.save(reference)
    prompt = f'Edit this sole native vehicle reference into one detailed hand-painted RTS game sprite. It is the original white and gray vintage pickup with an open dark cargo bed and tan wooden side rails. EXACT {view} Trace the native reference silhouette, direction, proportions, fixed colors and camera. Add fine painted metal and wood texture with native upper-left lighting. Transparent background and gaps. No ground, cast shadow, labels, other views or other objects. One occupied cell, 1254 by 1254.'
    (root / (name + '-prompt.txt')).write_text(prompt + '\n')
    jobs.append(dict(name=name, prompt=prompt, ref=str(reference.resolve())))
name = 'shp-building-1254-1x3-002'
reference = root / (name + '-reference.png')
reference.write_bytes((Path('.artifacts/m2-2/rubble-native-guides-v3') / reference.name).read_bytes())
prompt = ('Edit this sole native guide into an exact 1 column and 3 row transparent painted RTS sprite atlas. '
          'ALL THREE cells show FULLY COLLAPSED LOW FLAT BUILDING RUBBLE: first a collapsed office, second another collapsed office, third shallow orange timber and roof debris. '
          'Trace each original rubble silhouette, height, scattered parts, flat native slabs and gaps exactly. All walls and roofs have already collapsed. '
          'Retain each cell\'s original fixed material colors and native geometry. Add fine metal, masonry and timber texture only. '
          'Transparent background and gutters. No standing buildings, large standing roof, hospital signs, shadows, ground, labels or extra cells. Output 1254 by 1254.')
(root / (name + '-prompt.txt')).write_text(prompt + '\n')
jobs.append(dict(name=name, prompt=prompt, ref=str(reference.resolve())))
(root / 'jobs.json').write_text(json.dumps(jobs, indent=2) + '\n')
print(json.dumps(dict(jobs=len(jobs), root=str(root))))
