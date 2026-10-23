"""Build genuine native-heading guides and pinned input inventory for neutral VXL families."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('references', type=Path)
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--fill-cells', action='store_true', help='Use the full cell as an authoring guide; native pivots remain unchanged')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
references = json.loads((args.references / 'report.json').read_text())
source = json.loads(args.source.read_text())
assert references['status'] == 'PASS_SELECTED_NATIVE_CASES' and not references['errors']
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
boards, families, assets, reused = [], [], {}, []
for unit in references['units']:
    identity = unit['name']
    native = next(row for row in source['sources'] if row['member'] == unit['source']['member'])
    if identity == 'TRUCKA':
        accepted = Path('.local/hd-packs/soviet-dtruck-vxl/owner-r3/manifest.json')
        manifest = json.loads(accepted.read_text())
        assert sha(accepted) == 'eba4572bc4d8cd575a9d668e218133c28fa82cbc6e403ebf81b0b4cbf0a858c5'
        assert manifest['sources'][native['member']] == native['sha256']
        assert manifest['sources'][native['hva']['member']] == native['hva']['sha256']
        reused.append(dict(identity=identity, canonical='DTRUCK', manifest=str(accepted),
                           sha256=sha(accepted), sourcePair=manifest['sources']))
        continue
    members = [native['member'], native['hva']['member']]
    families.append(dict(id=identity, members=members, children=[]))
    assets[native['member']] = dict(sha256=native['sha256'])
    assets[native['hva']['member']] = dict(sha256=native['hva']['sha256'])
    assert sorted(view['heading'] for view in unit['views']) == list(range(0, 360, 45))
    for part in unit['views'][0]['partMetadata']:
        key = part['key']
        board = Image.new('RGBA', (2048, 1024))
        frames = []
        for index, view in enumerate(unit['views']):
            original = Image.open(args.references / view['layers'][key]).convert('RGB')
            data = np.asarray(original).astype(int)
            mask = np.max(np.abs(data - [72, 88, 78]), axis=2) > 12
            ys, xs = np.nonzero(mask)
            assert len(xs), (identity, key, view['heading'])
            bounds = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
            rgba = np.dstack([np.asarray(original), np.uint8(mask) * 255])
            crop = Image.fromarray(rgba).crop(bounds)
            scale = min(464 / crop.width, 464 / crop.height)
            if not args.fill_cells:
                scale = min(4, scale)
            size = (round(crop.width * scale), round(crop.height * scale))
            cx, cy = index % 4 * 512, index // 4 * 512
            x, y = cx + (512 - size[0]) // 2, cy + (512 - size[1]) // 2
            board.alpha_composite(crop.resize(size, Image.Resampling.NEAREST), (x, y))
            frames.append(dict(heading=view['heading'], cell=[cx, cy, 512, 512],
                guideBounds=[x, y, x + size[0], y + size[1]], sourceBounds=bounds,
                pivot=view['pivot'], ratio=view['ratio'], source=view['layers'][key],
                part=next(row for row in view['partMetadata'] if row['key'] == key)))
        name = f'{identity}-{key}'
        filename = args.output / f'{name}-reference.png'
        board.save(filename)
        prompt = (
            'Create a transparent HD game sprite atlas by editing the FIRST native guide. '
            'Exactly four columns and two rows: eight occupied cells in the exact guide order, '
            'headings 0,45,90,135,180,225,270,315. Preserve each cell own orientation, silhouette, '
            'vehicle proportions, roof, wheels, windows and every fixed material color. '
            'Maintain the guide scale and center inside each original cell; never shrink. '
            'Render genuine fine hand-painted realistic game detail with native upper-left light '
            'and subdued original contrast. Any additional reference is approved finish only; '
            'never copy its objects or rearrange the guide. Keep native remap surfaces red ONLY '
            'where the original guide has red; do not invent red material. No weapons, extra '
            'parts, floor, shadows, outlines, halos, labels, text, smoke, perspective changes '
            'or duplicate views. Transparent gutters and background. 2048 by 1024 composition.'
        )
        (args.output / f'{name}-prompt.txt').write_text(prompt + '\n')
        boards.append(dict(id=name, resourceStem=name.replace(' ', '-'), family=identity, identity=identity, part=key,
            sourceMember=part['source'], board=str(filename), boardSha256=sha(filename),
            frames=frames, status='AUTHORING_PENDING'))
work = dict(schema='m2-2-neutral-vxl-worklist-v1', references=str(args.references),
    referenceReportSha256=sha(args.references / 'report.json'), sourceSha256=sha(args.source),
    boards=boards, reused=reused)
(args.output / 'worklist.json').write_text(json.dumps(work, indent=2) + '\n')
(args.output / 'inventory.json').write_text(json.dumps(dict(families=families, assets=assets), indent=2) + '\n')
print(json.dumps(dict(boards=len(boards), authoredIdentities=len(families), reused=reused)))
