"""Prepare source-pinned native/current references for the twelve wood bridges."""
import argparse
import copy
import json
import shutil
from pathlib import Path
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_registration import sha


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    assert not args.output.exists(), 'Preserve earlier authoring evidence.'
    old = Path('.artifacts/m2-3/authoring-tmp-v2')
    source = json.loads((old / 'source.json').read_text())
    source['members'] = [row for row in source['members'] if row['setIndex'] == 80]
    assert len(source['members']) == 12
    names = {row['member'] for row in source['members']}
    assert all(name.startswith('ovrpsb') for name in names)
    layout = {name: row for name, row in json.loads((old / 'layout.json').read_text()).items()
              if name in names}
    pointer = json.loads(Path('desktop/terrain-hd-contract.json').read_text())
    pack = Path('.local/terrain-packs') / pointer['revision']
    assert sha(pack / 'manifest.json') == pointer['sha256']
    manifest = json.loads((pack / 'manifest.json').read_text())
    group, = [row for row in manifest['groups'] if any(member['member'] in names for member in row['members'])]
    assert {row['member'] for row in group['members']} == names
    variant = next(row for row in group['variants'] if row['density'] == 4)
    atlas_file = pack / variant['file']
    assert sha(atlas_file) == variant['sha256']
    atlas = Image.frombytes('RGBA', tuple(variant['size']), atlas_file.read_bytes())
    rects, offset = {}, 0
    for member in group['members']:
        rects[member['member']] = variant['rects'][offset:offset + len(member['images'])]
        offset += len(member['images'])
    assert offset == len(variant['rects'])
    args.output.mkdir(parents=True)
    jobs, batches = [], []
    for member in source['members']:
        name = member['member']
        info = layout[name]
        native_file = old / f'{name}-native.png'
        shutil.copyfile(native_file, args.output / native_file.name)
        native = Image.open(native_file).convert('RGBA')
        assert native.size == tuple(info['bounds'][2:])
        current = Image.new('RGBA', tuple(value * 4 for value in native.size))
        parts = {part['subTile']: part['rect'] for part in info['parts']}
        ordered = sorted(zip(member['native']['images'], rects[name]),
                         key=lambda pair: parts[pair[0]['subTile']][1])
        for image, rect in ordered:
            if image['nativeOffset'] <= 0:
                continue
            x, y, width, height = rect
            piece = atlas.crop((x, y, x + width, y + height))
            if not np.asarray(piece)[..., 3].any():
                continue
            px, py, pw, ph = parts[image['subTile']]
            assert (width, height) == (pw * 4, ph * 4)
            current.alpha_composite(piece, (px * 4, py * 4))
        assert np.array_equal(np.asarray(current)[..., 3], np.repeat(
            np.repeat(np.asarray(native)[..., 3], 4, axis=0), 4, axis=1))
        left, top, right, bottom = info['nativeAlphaBounds']
        native = native.crop((left, top, right, bottom))
        current = current.crop((left * 4, top * 4, right * 4, bottom * 4))
        board_size = [1536, 1024]
        scale = min(6, (board_size[0] - 48) / native.width, (board_size[1] - 48) / native.height)
        size = [round(native.width * scale), round(native.height * scale)]
        origin = [(board_size[0] - size[0]) // 2, (board_size[1] - size[1]) // 2]
        job_id = name.replace('.', '-') + '-00'
        folder = args.output / 'jobs' / job_id
        folder.mkdir(parents=True)
        for image, filename, method in [(current, 'current-reference.png', Image.Resampling.LANCZOS),
                                       (native, 'native-reference.png', Image.Resampling.NEAREST)]:
            pixels = np.array(image)
            pixels[pixels[..., 3] == 0, :3] = 0
            board = Image.new('RGBA', tuple(board_size))
            board.paste(Image.fromarray(pixels).resize(tuple(size), method), tuple(origin))
            board.save(folder / filename)
        prompt = (f'Precise object material edit of RA2 HD wood bridge {name}. Image 1 is the existing HD '
            'target and image 2 is the authoritative native silhouette, structure, colors and damage state. '
            'Create genuinely sharp high resolution art with clean broad wood planks and smooth continuous '
            'rails and edges. Substantially reduce gritty specks, jagged flecks, coarse grain, grime and '
            'unnecessary roughness. Preserve the muted natural wood color and material identity; any small '
            'metal fasteners have coherent clean satin metal reflections. Keep the exact native bridge '
            'deck, rails, supports, broken gaps, shore/ground regions, underside, perspective and footprint. '
            'Broken bridges remain broken and separate fragments remain separate. No new markings, '
            'structures, foliage, landscape, cast shadow, rusty patina, text, background, edge glow or halo. '
            'One occupied cell, same orientation and relative scale, generous transparent gutters. '
            'Output genuine transparent PNG at least 1536x1024 with newly resolved material pixels sufficient '
            'for independent native 4X and 2X export; do not clip the subject.')
        (folder / 'prompt.txt').write_text(prompt + '\n')
        cell = dict(key=name, duplicates=[name], nativeBounds=info['nativeAlphaBounds'],
                    nativeFrame=0, slotRect=[0, 0, *board_size], referenceRect=[*origin, *size])
        job = dict(id=job_id, member=name, folder=str(folder.resolve()), boardSize=board_size,
                   occupied=1, columns=1, rows=1, cells=[cell], references=[
                       dict(file=str((folder / filename).resolve()), sha256=sha(folder / filename))
                       for filename in ['current-reference.png', 'native-reference.png']],
                   promptSha256=sha(folder / 'prompt.txt'))
        (folder / 'job.json').write_text(json.dumps(job, indent=2) + '\n')
        jobs.append(job)
        info.update(board=str((folder / 'master.png').resolve()), boardSize=board_size, occupied=1,
                    slotRect=cell['slotRect'], referenceRect=cell['referenceRect'])
        batches.append(dict(name=job_id, setIndex=80, setName='Wood Bridges', boardSize=board_size,
                            members=[name], columns=1, rows=1))
    for filename, data in [('source.json', source), ('layout.json', layout), ('batches.json', batches),
                           ('jobs.json', jobs), ('slot-overrides.json', {})]:
        (args.output / filename).write_text(json.dumps(data, indent=2) + '\n')
    (args.output / 'provenance.json').write_text(json.dumps(dict(
        schema='m2-3-wood-bridge-feedback-authoring-v1', baseline=pointer, group=group['id'],
        sourceFile=str((old / 'source.json').resolve()), sourceSha256=sha(old / 'source.json'),
        sourceLayoutSha256=sha(old / 'layout.json'), nativeSourceSha256=source['preparedSourceSha256'],
        members=sorted(names), status='REFERENCES_READY_ARTWORK_PENDING'), indent=2) + '\n')
    print(json.dumps(dict(jobs=len(jobs), members=len(names), output=str(args.output))))


if __name__ == '__main__':
    main()
