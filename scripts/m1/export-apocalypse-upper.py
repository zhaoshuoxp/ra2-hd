"""Register and split one coherent upper-assembly master at two atlas densities."""
import argparse
import copy
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, label

parser = argparse.ArgumentParser()
parser.add_argument('master', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--resources', type=Path, default=Path('.local'))
parser.add_argument('--revision', default='r7-upper-seated')
args = parser.parse_args()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
retained_root = args.resources / 'hd-packs/soviet-apoc-vxl/owner-r3'
retained = json.loads((retained_root / 'manifest.json').read_text())
master = Image.open(args.master).convert('RGBA')
assert master.size == (2170, 725)
args.output.mkdir(parents=True, exist_ok=False)

# Socket centers and muzzle centers in each master cell. Both components use
# exactly the same transform; no tube or mount is repositioned after splitting.
landmarks = [
    ([[285, 184], [329, 210]], [[443, 98], [490, 125]], 17),
    ([[197, 175], [276, 175]], [[197, 61], [276, 61]], 16),
    ([[235, 211], [278, 184]], [[66, 121], [114, 101]], 17),
    ([[268, 211], [274, 243]], [[34, 211], [44, 243]], 15),
    ([[230, 181], [275, 208]], [[86, 264], [133, 290]], 17),
    ([[192, 211], [278, 211]], [[192, 319], [278, 319]], 17),
    ([[251, 206], [294, 180]], [[390, 284], [436, 258]], 17),
    ([[252, 175], [245, 206]], [[469, 175], [462, 206]], 15),
]
# The retail hatch is centered over the native turret pivot. Preserve every
# aspect ratio: all eight source views use the same uniform scale, with no shear.
hatches = [[230, 194], [235, 212], [335, 194], [365, 189],
           [310, 143], [236, 132], [204, 139], [156, 156]]
uniform_scale = .106
roof_anchor = np.array([0, -19.5])
# The two rear-facing drawings expose the hull's raised pivot ring. Seat the
# complete assembly on that ring without changing either source proportions.
mount_offsets = {0: np.array([0, 2.5]), 90: np.array([0, 2.5])}
lower_diagonal_length = np.mean([np.linalg.norm(np.mean(landmarks[i][1], axis=0)
    - np.mean(landmarks[i][0], axis=0)) for i in [4, 6]])
prepared = []
source_board = Image.new('RGBA', master.size)
for index, (roots, tips, radius) in enumerate(landmarks):
    heading = index * 45
    cell = master.crop((index % 4 * master.width // 4, index // 4 * master.height // 2,
                        (index % 4 + 1) * master.width // 4, (index // 4 + 1) * master.height // 2))
    rgba = np.array(cell)
    components, _ = label(rgba[..., 3] > 32)
    counts = np.bincount(components.ravel()); counts[0] = 0
    support = binary_dilation(components == counts.argmax(), iterations=3)
    rgba[~support] = 0
    yy, xx = np.indices(rgba.shape[:2]); points = np.stack([xx + .5, yy + .5], axis=-1)
    tube = np.zeros(rgba.shape[:2]); distances = []; directions = []
    for root, tip in zip(np.array(roots), np.array(tips)):
        direction = tip - root; direction = direction / np.linalg.norm(direction)
        directions.append(direction)
        along = (points - root) @ direction
        across = np.abs((points - root) @ np.array([-direction[1], direction[0]]))
        distances.append(across)
        tube = np.maximum(tube, np.clip((along + 2) / 8, 0, 1) * (across < radius + 12))
    drawn = np.mean(tips, axis=0) - np.mean(roots, axis=0)
    length_factor = 1.0
    if index in [0, 2]:
        # Only the exposed upper-facing tubes were too long. Keep the sockets,
        # collars, turret sides and roof untouched; shorten beyond the collar.
        collar = 20
        length_factor = (lower_diagonal_length - collar) / (np.linalg.norm(drawn) - collar)
        alpha = rgba[..., 3] / 255; barrel_alpha = alpha * tube
        mount_alpha = (alpha - barrel_alpha) / np.maximum(1e-12, 1 - barrel_alpha)
        mount = rgba.copy(); mount[..., 3] = np.uint8(np.clip(mount_alpha * 255, 0, 255).round())
        barrel = rgba.copy(); barrel[..., 3] = np.uint8(np.clip(barrel_alpha * 255, 0, 255).round())
        nearest = np.argmin(np.array(distances), axis=0)
        shortened = Image.new('RGBA', cell.size)
        for half, (root, direction) in enumerate(zip(np.array(roots), directions)):
            source = barrel.copy(); source[..., 3][nearest != half] = 0
            inverse = np.eye(2) + (1 / length_factor - 1) * np.outer(direction, direction)
            anchor = root + collar * direction
            affine = np.column_stack([inverse, anchor - inverse @ anchor])
            image = Image.fromarray(source).convert('RGBa').transform(cell.size, Image.Transform.AFFINE,
                affine.ravel(), Image.Resampling.BICUBIC).convert('RGBA')
            shortened = Image.alpha_composite(shortened, image)
        shortened = np.array(shortened)
        along = np.choose(nearest, [(points - root) @ direction
            for root, direction in zip(np.array(roots), directions)])
        shortened[along <= collar] = barrel[along <= collar]
        rgba = np.array(Image.alpha_composite(Image.fromarray(mount), Image.fromarray(shortened)))
        tube = np.clip(shortened[..., 3] / np.maximum(1, rgba[..., 3]), 0, 1)
    matrix = np.eye(2) * uniform_scale
    mount_offset = mount_offsets.get(heading, np.zeros(2))
    offset = roof_anchor + mount_offset - matrix @ np.array(hatches[index])
    transform = {'matrix': matrix.tolist(), 'offset': offset.tolist(), 'sourceHatch': hatches[index],
                 'roofAnchor': roof_anchor.tolist(), 'mountOffset': mount_offset.tolist(), 'tubeLengthFactor': length_factor,
                 'sourceTips': tips, 'sourceRoots': roots}
    visible = points[rgba[..., 3] > 0] @ matrix.T + offset
    lower = np.floor(visible.min(axis=0) * 4 - 4) / 4
    upper = np.ceil(visible.max(axis=0) * 4 + 4) / 4
    prepared.append((rgba, tube, matrix, offset, lower, upper, transform))
    Image.fromarray(rgba).save(args.output / f'coherent-source-{heading}.png')
    source_board.paste(Image.fromarray(rgba), (index % 4 * master.width // 4, index // 4 * master.height // 2))

receipt = {'masterSha256': sha(args.master), 'variants': [], 'registration': []}
for density in [2, 4]:
    destination = args.output / f'{args.revision}-{density}x'; destination.mkdir()
    manifest = copy.deepcopy(retained)
    manifest.update(revision=f'{args.revision}-{density}x', density=density,
                    acceptance='COHERENT_UPPER_ASSEMBLY_CANDIDATE_VISUAL_REVIEW_PENDING')
    references = []
    # Copy the accepted hull byte for byte at 4X. Its 2X representation uses
    # the existing alpha-weighted, linear-light and categorical owner reduction.
    body = manifest['parts'][0]
    if density == 4:
        for file in body['files'].values():
            shutil.copyfile(retained_root / file['file'], destination / file['file'])
    else:
        subprocess.run(['bun', '-e', '''
            import { readFileSync, writeFileSync } from 'node:fs';
            import { PNG } from 'pngjs';
            import { downsampleHdPage } from './src/engine/renderable/builder/downsampleHdPage.ts';
            const paths = process.argv.slice(1);
            const images = paths.slice(0, 2).map(file => { const p = PNG.sync.read(readFileSync(file));
                return { width: p.width, height: p.height, rgba: p.data }; });
            downsampleHdPage(...images).forEach((p, i) => writeFileSync(paths[i + 2],
                PNG.sync.write({ width: p.width, height: p.height, data: Buffer.from(p.rgba) })));
        ''', *[str(retained_root / body['files'][role]['file']) for role in ['base', 'data']],
            *[str(destination / body['files'][role]['file']) for role in ['base', 'data']]], check=True)
        for role, entry in body['files'].items():
            entry.update(sha256=sha(destination / entry['file']), bytes=(destination / entry['file']).stat().st_size)
        body['pageSize'] = [value // 2 for value in body['pageSize']]
        for frame in body['frames']:
            frame['rect'] = [value / 2 for value in frame['rect']]
            frame.pop('ownerControlHashes', None)
    for part_index in [1, 2]:
        part = manifest['parts'][part_index]
        frames = []; samples = []
        for index, (rgba, tube, matrix, shift, lower, upper, registration) in enumerate(prepared):
            logical = upper - lower; size = np.ceil(logical * density).astype(int)
            inverse = np.linalg.inv(matrix)
            sample_size = size * 4
            affine = np.column_stack([inverse / (density * 4), inverse @ (lower - shift)])
            source = Image.fromarray(rgba).convert('RGBa')
            authored = np.array(source.transform(tuple(sample_size), Image.Transform.AFFINE, affine.ravel(), Image.Resampling.BICUBIC)
                .resize(tuple(size), Image.Resampling.LANCZOS).convert('RGBA'))
            if part_index == 1:
                references.append(authored.copy())
            mask = Image.fromarray(np.uint8(np.rint(tube * 255))).transform(tuple(sample_size), Image.Transform.AFFINE,
                affine.ravel(), Image.Resampling.BILINEAR).resize(tuple(size), Image.Resampling.LANCZOS)
            weight = np.array(mask) / 255; alpha = authored[..., 3] / 255
            barrel_alpha = alpha * weight
            layer_alpha = barrel_alpha if part_index == 2 else (alpha - barrel_alpha) / np.maximum(1e-12, 1 - barrel_alpha)
            authored[..., 3] = np.uint8(np.clip(layer_alpha * 255, 0, 255).round())
            authored[authored[..., 3] == 0] = 0
            data = np.zeros_like(authored); data[..., 3] = 255
            red, green, blue = np.moveaxis(authored[..., :3].astype(float), 2, 0)
            paint = (red > 1.45 * green) & (red > 1.4 * blue) & (red > 45) & (authored[..., 3] > 0)
            data[..., 0][paint] = 255
            ramp = np.array([63, 59, 55, 52, 48, 44, 41, 37, 33, 30, 26, 22, 19, 15, 11, 8]) * 4
            data[..., 1][paint] = abs(red[..., None] - ramp).argmin(axis=2)[paint]
            frame = copy.deepcopy(retained['parts'][part_index]['frames'][index])
            frame.update(offset=lower.tolist(), logicalSize=(size / density).tolist(),
                         ownerPixels=int(paint.sum()), fixedRedPixels=0,
                         authoredBounds=[0, 0, int(size[0]), int(size[1])])
            frame.pop('ownerControlHashes', None)
            frames.append(frame); samples.append((authored, data))
            if part_index == 1 and density == 4:
                receipt['registration'].append({'heading': index * 45, **registration})
        width = sum(pair[0].shape[1] + 8 for pair in samples); height = max(pair[0].shape[0] for pair in samples) + 8
        pages = [Image.new('RGBA', (width, height)), Image.new('RGBA', (width, height), (0, 0, 0, 255))]
        x = 4
        for frame, pair in zip(frames, samples):
            h, w = pair[0].shape[:2]; frame['rect'] = [x, 4, w, h]
            for page, array in zip(pages, pair):
                page.paste(Image.fromarray(array), (x, 4))
            x += w + 8
        part.update(frames=frames, pageSize=[width, height])
        for role, image in zip(['base', 'data'], pages):
            entry = part['files'][role]; target = destination / entry['file']; image.save(target)
            entry.update(sha256=sha(target), bytes=target.stat().st_size)
        part['provenance']['upperAssemblyRepair'] = {'masterSha256': sha(args.master),
            'method': 'Uniform scale and hatch registration; 0/90 assembly seated 2.5 logical pixels lower; untouched source proportions',
            'split': 'Alpha-complement socket overlap in one registered canvas; no runtime relocation'}
    reference = Image.new('RGBA', tuple(manifest['parts'][1]['pageSize']))
    for frame, image in zip(manifest['parts'][1]['frames'], references):
        reference.paste(Image.fromarray(image), tuple(frame['rect'][:2]))
    reference_path = destination / 'APOC-upper-coherent-reference.png'; reference.save(reference_path)
    source_path = destination / 'APOC-upper-source-reference.png'; source_board.save(source_path)
    manifest['upperAssemblyReference'] = {'file': reference_path.name, 'sha256': sha(reference_path),
        'bytes': reference_path.stat().st_size, 'masterSha256': sha(args.master),
        'sourceFile': source_path.name, 'sourceSha256': sha(source_path),
        'scope': 'Offline reconstruction check only; never loaded as a runtime component',
        'registration': [entry[-1] for entry in prepared]}
    common = [min(part['depthBounds'][0] for part in manifest['parts']),
              min(part['depthBounds'][1] for part in manifest['parts']),
              max(part['depthBounds'][2] for part in manifest['parts']),
              max(part['depthBounds'][3] for part in manifest['parts'])]
    for part in manifest['parts']:
        for frame in part['frames']:
            common[0] = min(common[0], frame['offset'][0]); common[1] = min(common[1], frame['offset'][1])
            common[2] = max(common[2], frame['offset'][0] + frame['logicalSize'][0])
            common[3] = max(common[3], frame['offset'][1] + frame['logicalSize'][1])
    for part in manifest['parts']:
        part['depthBounds'] = common
    target = destination / 'manifest.json'; target.write_text(json.dumps(manifest, indent=2) + '\n')
    receipt['variants'].append({'density': density, 'path': str(target), 'sha256': sha(target)})
(args.output / 'export.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
