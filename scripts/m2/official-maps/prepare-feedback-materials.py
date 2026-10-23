"""Prepare versioned native/current references for the authorized material correction."""
import argparse
import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from owner_review import compose_owner, frame_palette


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('scope', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    assert not args.output.exists()
    args.output.mkdir()
    guide = args.output / 'prepared'
    (guide / 'native').mkdir(parents=True)
    scope = json.loads(args.scope.read_text())
    contract = json.loads(Path('desktop/environment-hd-contract.json').read_text())
    pack = Path('.local/environment-packs/environment-m2-3-complete-v1')
    catalog = json.loads((pack / 'manifest.json').read_text())
    selected = {entry['member']: entry for family in catalog['families'].values() for entry in family['members']}
    sources, old_slots, member_rows = {}, {}, {}
    roots = [Path('/Users/Aone/RA2remaster/ra2-hd/.artifacts/m2-2'), Path('.artifacts/m2-3')]
    for root, prepared_name, authored_name in zip(roots,
            ['prepared-native-v2', 'native-guides-v3'], ['authoring-shp-v1', 'authoring-shp-v3']):
        prepared, authored = root / prepared_name, root / authored_name
        raw = json.loads((prepared / 'source.json').read_text())
        for source in raw['sources']:
            if source['format'] != 'shp':
                continue
            source = json.loads(json.dumps(source))
            for frame in source['frames']:
                frame.setdefault('indexFile', f"{source['member']}-{frame['slot']}.index")
            sources[source['member']] = source
        for source_file in (prepared / 'native').rglob('*'):
            if not source_file.is_file():
                continue
            target = guide / 'native' / source_file.relative_to(prepared / 'native')
            if target.exists():
                assert sha(target) == sha(source_file)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source_file, target)
        work = json.loads((authored / 'worklist.json').read_text())
        overrides = json.loads((authored / 'slot-overrides.json').read_text())
        batches = {batch['name'] + '-master.png': batch for batch in work['batches']}
        for key, original in work['slots'].items():
            row = {**original, **overrides.get(key, {})}
            batch = batches.get(row['board'])
            row.setdefault('occupied', len(batch['slots']) if batch else 1)
            row.setdefault('boardSize', batch['boardSize'] if batch else row['slotRect'][2:])
            row['board'] = str((authored / row['board']).resolve())
            old_slots[key] = row
        member_rows.update({row['member']: row for row in work['members']})
    (guide / 'source.json').write_text(json.dumps(dict(schema='m2-3-feedback-native-guides-v1',
        sources=list(sources.values()), inputScopeSha256=sha(args.scope)), indent=2) + '\n')
    required = {name for family in scope['materialFamilies'] for name in contract['families'][family]['members']}
    jobs, slots = [], {key: row for key, row in old_slots.items() if row['member'] in required}
    for name in sorted(required):
        source, entry = sources[name], selected[name]
        manifest_file = pack / entry['path']
        assert sha(manifest_file) == entry['sha256']
        manifest = json.loads(manifest_file.read_text())
        variant = next(v for v in manifest['variants'] if v['density'] == 4)
        member_slots = sorted((key, row) for key, row in slots.items() if row['member'] == name)
        unique = {}
        for key, row in member_slots:
            index = source['frames'][row['nativeSlot']]['indexSha256']
            unique.setdefault(index, []).append(key)
        representatives = [keys[0] for keys in unique.values()]
        max_width = max(slots[key]['nativeBounds'][2] - slots[key]['nativeBounds'][0] for key in representatives)
        max_height = max(slots[key]['nativeBounds'][3] - slots[key]['nativeBounds'][1] for key in representatives)
        board_size = (1536, 1024) if max_width > 200 and max_width > max_height * 1.35 else (1254, 1254)
        columns = max(1, min(4, math.floor(board_size[0] / (max_width * 5.0))))
        rows = max(1, min(4, math.floor(board_size[1] / (max_height * 5.0))))
        cells_per_job = columns * rows
        page_cache = {}
        for offset in range(0, len(representatives), cells_per_job):
            keys = representatives[offset:offset + cells_per_job]
            job_columns = min(columns, len(keys))
            job_rows = math.ceil(len(keys) / job_columns)
            job_id = f"{name.replace('.', '-')}-{offset // cells_per_job:02d}"
            directory = args.output / 'jobs' / job_id
            directory.mkdir(parents=True)
            native_board, current_board = [Image.new('RGBA', board_size) for _ in range(2)]
            cells = []
            cell_width, cell_height = board_size[0] // job_columns, board_size[1] // job_rows
            for cell_number, key in enumerate(keys):
                row = slots[key]
                number = row['nativeSlot']
                frame = source['frames'][number]
                width, height = frame['size']
                indices = np.frombuffer((guide / 'native' / frame['indexFile']).read_bytes(), np.uint8).reshape(height, width)
                palette = frame_palette(guide, source, contract['sources'][name], number)
                native_pixels = np.zeros((height, width, 4), np.uint8)
                native_pixels[..., :3] = palette[indices]
                native_pixels[..., 3] = ((indices != 0) & (indices != 12)).astype(np.uint8) * 255
                native_pixels[native_pixels[..., 3] == 0, :3] = 0
                native = Image.fromarray(native_pixels)
                hd_frame = next(f for f in variant['frames'] if f['nativeFrame'] == number)
                if hd_frame['page'] not in page_cache:
                    page = next(p for p in variant['pages'] if p['id'] == hd_frame['page'])
                    folder = manifest_file.parent / '4' / hd_frame['page']
                    page_cache[hd_frame['page']] = tuple(Image.open(folder / filename).convert('RGBA')
                        for filename in ['base.png', 'data.png'])
                x, y, w, h = hd_frame['contentRect']
                base, data = page_cache[hd_frame['page']]
                current = compose_owner(base.crop((x, y, x+w, y+h)), data.crop((x, y, x+w, y+h)), palette)
                left, top, right, bottom = row['nativeBounds']
                native = native.crop((left, top, right, bottom))
                current = current.crop((left * 4, top * 4, right * 4, bottom * 4))
                scale = min((cell_width - 36) / native.width, (cell_height - 36) / native.height, 6)
                size = (round(native.width * scale), round(native.height * scale))
                cx, cy = cell_number % job_columns * cell_width, cell_number // job_columns * cell_height
                origin = (cx + (cell_width - size[0]) // 2, cy + (cell_height - size[1]) // 2)
                native_board.paste(native.resize(size, Image.Resampling.NEAREST), origin)
                current_board.paste(current.resize(size, Image.Resampling.LANCZOS), origin)
                cells.append(dict(key=key, duplicates=unique[frame['indexSha256']], nativeBounds=row['nativeBounds'],
                    state=row.get('state', f'native animation phase {number}'), nativeFrame=number,
                    slotRect=[cx, cy, cell_width, cell_height], referenceRect=[*origin, *size]))
            for board, filename in [(native_board, 'native-reference.png'), (current_board, 'current-reference.png')]:
                board.save(directory / filename)
            prompt = (f'Use case: precise-object-edit. Production RA2 HD {name}, exact native state sprite sheet. '
                'Image 1 is the current HD edit target; image 2 is the authoritative original geometry, palette, '
                'silhouette and native state reference. Re-author ALL occupied cells with genuinely sharp clean '
                'high resolution material and smooth continuous edges. Reduce gritty grain, jagged flecks, rust, '
                'grime and coarse roughness substantially. Metallic parts have coherent satin metal reflections '
                'and precise smooth ribs/seams; preserve native metal color. Painted, wood, brick and concrete '
                'parts keep the original material identity and colors, with clear broad planes and restrained detail. '
                'Keep exactly the same structures, tiny fixtures, footprint, perspective, proportions, alpha holes, '
                'native markings and frame-specific damage/pose. Damaged frames remain damaged; low flat rubble '
                'remains rubble. Preserve original owner color regions at their full original widths. '
                f'Exact grid: {job_columns} columns, {job_rows} rows; {len(cells)} occupied cells in row-major order. '
                f'Cell native frame numbers: {[cell["nativeFrame"] for cell in cells]}. '
                'No duplicate, rearranged, missing or added cells. Keep relative subject sizes and all cell margins. '
                f'Output genuine transparent PNG at least {board_size[0]}x{board_size[1]} with enough newly '
                'resolved pixels for independent native 4X and 2X export. Fill each occupied cell generously '
                'without clipping or crossing its bounds. No background, invented cast shadow, terrain outside '
                'the native footprint, grid, labels, watermark, extra text, rusty patina, granular noise or halos.')
            (directory / 'prompt.txt').write_text(prompt + '\n')
            job = dict(id=job_id, member=name, folder=str(directory.resolve()), boardSize=board_size,
                occupied=len(cells), columns=job_columns, rows=job_rows, cells=cells, status='AWAITING_IMAGEGEN',
                references=[dict(file=str((directory / n).resolve()), sha256=sha(directory / n))
                    for n in ['current-reference.png', 'native-reference.png']], promptSha256=sha(directory / 'prompt.txt'))
            (directory / 'job.json').write_text(json.dumps(job, indent=2) + '\n')
            jobs.append(job)
    work = dict(schema='m2-3-feedback-material-worklist-v1', preparedSourceSha256=sha(guide / 'source.json'),
        members=[member_rows[name] for name in sorted(required)], slots=slots, batches=[],
        runtimeAcceptance='PENDING')
    (args.output / 'worklist.json').write_text(json.dumps(work, indent=2) + '\n')
    (args.output / 'jobs.json').write_text(json.dumps(jobs, indent=2) + '\n')
    print(json.dumps(dict(output=str(args.output), members=len(required), slots=len(slots), jobs=len(jobs))))


if __name__ == '__main__':
    main()
