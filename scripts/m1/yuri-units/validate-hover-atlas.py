"""Check rigid hover pixels independently from the atlas registration script."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument('revision')
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = Path('.local/hd-packs/yuri-yurix-authored')
old = json.loads((root / 'r1/manifest.json').read_text())
new = json.loads((root / args.revision / 'manifest.json').read_text())
source = json.loads(Path('.artifacts/yuri-units/source-v2/yurix.shp.json').read_text())
assert old['logical'] == new['logical']
checked, unchanged = 0, 0
board = Image.new('RGBA', (1280, 1560), (72, 88, 78, 255))
draw = ImageDraw.Draw(board)
for prior, current in zip(old['variants'], new['variants'], strict=True):
    density = current['density']
    pages = {revision: {page['id']: {kind: Image.open(root / revision / page[kind]).convert('RGBA')
             for kind in ['base', 'data']} for page in variant['pages']}
             for revision, variant in [('r1', prior), (args.revision, current)]}
    references = {}
    for index, (before, after) in enumerate(zip(prior['frames'], current['frames'], strict=True)):
        assert before == after
        x, y, w, h = after['sampleRect']
        crop = {revision: {kind: np.array(images[after['page']][kind].crop((x, y, x + w, y + h)))
                for kind in ['base', 'data']} for revision, images in pages.items()}
        original, selected = crop['r1'], crop[args.revision]
        assert not np.any(selected['data'][:, :, 0][selected['base'][:, :, 3] == 0])
        if index < 8 or index >= 56:
            for kind in selected:
                assert np.array_equal(selected[kind], original[kind]), (density, index, kind)
            unchanged += 1
            continue
        native = source['frames'][index]
        indices = np.array(native['pixels']).reshape(native['height'], native['width'])
        ys, _ = np.where((indices != 0) & (indices != 12))
        mask = indices == 12
        mask[:ys.max() + 1] = False
        mask = np.repeat(np.repeat(mask, density, axis=0), density, axis=1)
        for kind in selected:
            assert np.array_equal(selected[kind][:mask.shape[0], :mask.shape[1]][mask],
                                  original[kind][:mask.shape[0], :mask.shape[1]][mask]), (density, index, kind, 'ground')
        body = selected['base'].copy()
        body[:mask.shape[0], :mask.shape[1]][mask] = 0
        full = Image.new('RGBA', tuple(value * density for value in source['canvas']))
        full.paste(Image.fromarray(body), (native['x'] * density, native['y'] * density))
        heading = (index - 8) // 6
        if heading in references:
            assert np.array_equal(np.array(full), references[heading]), (density, index, 'body')
        else:
            references[heading] = np.array(full)
        checked += 1
        if density == 4:
            full.paste(Image.fromarray(selected['base']), (native['x'] * density, native['y'] * density))
            column, row = heading, (index - 8) % 6
            board.alpha_composite(full.crop((212, 32, 372, 292)), (column * 160, row * 260))
            draw.text((column * 160 + 2, row * 260 + 2), str(index), fill='white')
assert checked == 96 and unchanged == 480
assert not args.output.exists()
board.save(args.output.with_suffix('.png'))
result = {'status': 'PASS_RIGID_BODY_GROUND_OWNER_COVERAGE_AND_UNCHANGED_SLOTS', 'revision': args.revision,
          'walkSlots': checked, 'otherSlotsUnchanged': unchanged, 'logicalMetadataUnchanged': True,
          'independentDensities': [2, 4], 'rigidBodyConsistentAcrossAllSixPhases': True,
          'contactSheet': str(args.output.with_suffix('.png').resolve())}
args.output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
