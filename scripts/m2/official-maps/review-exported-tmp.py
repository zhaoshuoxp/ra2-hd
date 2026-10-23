"""Reassemble native and exported TMP subtiles at their actual selected density."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_reconstruction import POLICY as CONTOUR_POLICY, verify_extra_alpha

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('pack', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--members', nargs='+', required=True)
parser.add_argument('--density', type=int, choices=[2, 4], default=2)
args = parser.parse_args()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
manifest_path = args.pack / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
sources = {row['member']: row for row in json.loads((args.prepared / 'source.json').read_text())['sources']}
requested = set(args.members)
assert len(requested) == len(args.members)
args.output.mkdir(parents=True, exist_ok=False)
records = []
for group in manifest['groups']:
    selected = [row for row in group['members'] if row['member'] in requested]
    if not selected:
        continue
    variant = next(row for row in group['variants'] if row['density'] == args.density)
    atlas_file = args.pack / variant['file']
    assert sha(atlas_file) == variant['sha256']
    assert atlas_file.stat().st_size == variant['size'][0] * variant['size'][1] * 4
    atlas = Image.frombytes('RGBA', tuple(variant['size']), atlas_file.read_bytes())
    entries = {}
    index = 0
    for member in group['members']:
        entries[member['member']] = variant['rects'][index:index + len(member['images'])]
        index += len(member['images'])
    assert index == len(variant['rects'])
    for member in selected:
        name = member['member']
        source = sources[name]
        assert member['sourceHashes'] == {'ra2': source['sha256'], 'yr': source['sha256']}
        native_images = source['images']
        assert len(native_images) == len(member['images']) == len(entries[name])
        positions = [(row['origin'][0] + row['offset'][0],
                      row['origin'][1] + row['offset'][1] - row['height'] * 15) for row in native_images]
        populated = [(position, row) for position, row in zip(positions, native_images) if row['nativeOffset'] > 0]
        assert populated
        left = min(position[0] for position, _ in populated)
        top = min(position[1] for position, _ in populated)
        right = max(position[0] + row['logical'][0] for position, row in populated)
        bottom = max(position[1] + row['logical'][1] for position, row in populated)
        density = args.density
        size = ((right - left) * density, (bottom - top) * density)
        native_assembly, hd_assembly = Image.new('RGBA', size), Image.new('RGBA', size)
        parts = sorted(zip(native_images, member['images'], positions, entries[name]), key=lambda part: part[2][1])
        for original, declared, position, rect in parts:
            assert all(declared[key] == original[key] for key in declared)
            file = args.prepared / 'native' / original['file']
            assert sha(file) == original['rgbaSha256']
            native = Image.frombytes('RGBA', tuple(original['logical']), file.read_bytes())
            expected_size = tuple(value * density for value in native.size)
            native = native.resize(expected_size, Image.Resampling.NEAREST)
            x, y, width, height = rect
            assert (width, height) == expected_size
            hd = atlas.crop((x, y, x + width, y + height))
            if group.get('contourReconstruction') and original['nativeOffset'] > 0:
                assert group['contourReconstruction'] == CONTOUR_POLICY
                raw_original = Image.frombytes('RGBA', tuple(original['logical']), file.read_bytes())
                verify_extra_alpha(np.asarray(hd)[..., 3], np.asarray(raw_original), original, density)
            else:
                assert np.array_equal(np.asarray(native)[..., 3], np.asarray(hd)[..., 3])
            if original['nativeOffset'] <= 0 or not np.asarray(native)[..., 3].any():
                # The native reader decodes offset-zero headers as placeholder bytes.
                # Preserve placeholders and empty positive-offset records exactly.
                assert np.array_equal(np.asarray(native), np.asarray(hd))
                continue
            at = ((position[0] - left) * density, (position[1] - top) * density)
            native_assembly.alpha_composite(native, at)
            hd_assembly.alpha_composite(hd, at)
        if not group.get('contourReconstruction'):
            assert np.array_equal(np.asarray(native_assembly)[..., 3], np.asarray(hd_assembly)[..., 3])
        panel_width = max(size[0] + 32, 360)
        row_height = size[1] + 60
        board = Image.new('RGB', (panel_width, row_height * 2), (28, 28, 28))
        draw = ImageDraw.Draw(board)
        for row, (label, assembly) in enumerate([('Native', native_assembly), ('HD', hd_assembly)]):
            draw.text((12, row * row_height + 8), f'{name} / {label} {density}X',
                      fill='white', font_size=22)
            board.paste(assembly, ((panel_width - size[0]) // 2, row * row_height + 44), assembly)
        output = args.output / f'{name}-{density}x.png'
        board.save(output)
        records.append(dict(member=name, density=density, group=group['id'],
                            sourceSha256=source['sha256'], nativeBounds=[left, top, right - left, bottom - top],
                            nativeSubtiles=len(native_images), renderedSubtiles=len(populated),
                            file=str(output.resolve()), sha256=sha(output),
                            policy='Native origins, offsets, heights and draw order; independent HD at actual density'))
assert {row['member'] for row in records} == requested
(args.output / 'index.json').write_text(json.dumps(dict(
    status='PREPARED_FOR_VISUAL_QA', packSha256=sha(manifest_path), records=records,
    runtimeAcceptance=False, userVisualAcceptance=False), indent=2) + '\n')
print(json.dumps(dict(status='PREPARED_FOR_VISUAL_QA', density=args.density, members=len(records))))
