"""Declare sequential imagegen jobs from source-pinned production boards."""
import json
import argparse
import shutil
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_registration import sha

root = Path('.artifacts/m2-3')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--shp-root', type=Path, default=root / 'authoring-shp-v3')
parser.add_argument('--tmp-root', type=Path, default=root / 'authoring-tmp-v2')
parser.add_argument('--output', type=Path, default=root / 'authoring-jobs-v2.json')
args = parser.parse_args()
styles = root / 'accepted-direction-refs-v1'
styles.mkdir(exist_ok=True)
donor = Path('/Users/Aone/RA2remaster/ra2-hd-m2-2-temperate/.artifacts/m2-2/authoring-direction-v1')
style_records = {}
for name in ['civil-buildings', 'props-resources', 'ground-water', 'bridges', 'neutral-actors']:
    source, target = donor / (name + '-master.png'), styles / (name + '-master.png')
    if not target.exists():
        shutil.copyfile(source, target)
    assert sha(source) == sha(target)
    style_records[name] = dict(path=str(target.resolve()), sha256=sha(target), donor=str(source))
if not (styles / 'provenance.json').exists():
    (styles / 'provenance.json').write_text(json.dumps(style_records, indent=2) + '\n')

jobs = []
for format, folder in [('shp', args.shp_root), ('tmp', args.tmp_root)]:
    work = json.loads((folder / ('worklist.json' if format == 'shp' else 'batches.json')).read_text())
    batches = work['batches'] if format == 'shp' else work
    for batch in batches:
        group = batch['group'] if format == 'shp' else batch['setName']
        if format == 'tmp':
            style = 'bridges' if 'Bridges' in group else 'ground-water'
            policy = ('Exact isometric ground assembly; maintain native terrain regions, all road directions, '
                'water/shore boundary, rock face planes, elevated bridge deck or empty broken portions. '
                'No extra road markings, structures or foliage. Bridge asphalt remains muted grey. '
                'Shore water is subdued blue grey, soil and crops follow their native colors.')
            members = batch['members']
        else:
            first = work['slots'][batch['slots'][0]]
            kind = first['kind']
            style = ('civil-buildings' if kind == 'building' else 'bridges' if group == 'bridge'
                else 'ground-water' if kind == 'animation' else 'neutral-actors' if kind == 'infantry'
                else 'props-resources')
            policy = ('Preserve every native building roof, facade, foundation, window, fixed red material and '
                'ruined or occupied state. A damaged reference stays damaged; rubble stays flat rubble. '
                'Animated machinery and cloth retain exact phase, silhouette and position. Do not add intact '
                'architecture to ruins or decorative labels.') if kind == 'building' else (
                'Preserve exact animal or civilian species, clothing colors, head, limbs, facing, pose and each '
                'action phase. Walking, idle, prone, firing, swimming and death poses are distinct native frames. '
                'Never turn bodies in a shared direction, add equipment or omit any pose. New resolved cloth, '
                'fur or skin detail, not a pixel upscale.') if kind == 'infantry' else (
                'Preserve each native waterfall phase, direction, broken spray, gaps and silhouette. Water is '
                'subdued blue grey with white foam. No invented pond, rock, floor or cast shadow.') if kind == 'animation' else (
                'Preserve exact native prop, tree, fence, supply crate, bridge or vein patch shape and color '
                'regions. Tree species, trunks, detached branches, sign shape, fence posts and bridge gaps '
                'stay as shown. Do not introduce unrelated objects or change the material type.')
            members = [dict(member=work['slots'][s]['member'], frame=work['slots'][s]['nativeSlot'],
                state=work['slots'][s]['state']) for s in batch['slots']]
        count = len(batch['slots'] if format == 'shp' else batch['members'])
        prompt = (f'Use case: style-transfer. Asset type: RA2 HD reusable {group} production sheet. '
            f'Image 1 is the exact native geometry/state reference, {batch["columns"]} columns by '
            f'{batch["rows"]} rows with {count} occupied cells in row-major order. Image 2 is an accepted '
            f'HD material direction only. Newly author high resolution detailed art for EVERY occupied '
            f'cell in image 1, keeping the same cell order and relative scale. Leave unused cells empty. '
            f'{policy} Preserve the original isometric projection, precise native silhouette and internal '
            f'forms; stay inside each cell with generous transparent gutters. Fine physically readable '
            f'materials with restrained upper-left lighting, contrast and colors close to the native source. '
            f'True transparent background. No landscape, ground plane, cast shadows, text, border, grid '
            f'lines, extra objects or repeated generic replacement. Not an upscale of native pixels. '
            f'Fill each occupied cell with its original subject at its reference scale. Output '
            f'{batch["boardSize"][0]}x{batch["boardSize"][1]} or larger retaining the exact layout.')
        jobs.append(dict(id=batch['name'], format=format, group=group, prompt=prompt,
            reference=str((folder / (batch['name'] + '-reference.png')).resolve()),
            referenceSha256=sha(folder / (batch['name'] + '-reference.png')),
            style=style_records[style], destination=str((folder / (batch['name'] + '-master.png')).resolve()),
            provenance=str((folder / (batch['name'] + '-imagegen.json')).resolve()), members=members))
output = args.output
with output.open('x') as stream:
    stream.write(json.dumps(dict(schema='m2-3-sequential-imagegen-jobs-v1', jobs=jobs,
    policy='Builtin imagegen only; every job remains runtime and final visual acceptance pending'), indent=2) + '\n')
print(json.dumps(dict(jobs=len(jobs), source=str(output))))
