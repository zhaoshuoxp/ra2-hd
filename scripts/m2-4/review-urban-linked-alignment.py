"""Build one embedded review limited to the three reported alignment corrections."""
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
base = Path('.artifacts/m2-4')
evidence = base / 'urban-linked-alignment-r1-v1'
guide = base / 'urban-linked-native-batch61-v1'
sources = {s['member']: s for s in read(guide / 'source.json')['sources']}
before = Path('.local/environment-packs/urban-environment-m2-4-linked-batch61-v1')
after = before.with_name('urban-environment-m2-4-linked-alignment-r1-v4')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--resume-media', action='store_true')
args = parser.parse_args()
root = base / 'urban-linked-alignment-review-r1-v1'
root.mkdir(exist_ok=args.resume_media)
(root / 'media').mkdir(exist_ok=args.resume_media)
files, video_files, scenes, states, comparisons, videos, pins = [], [], [], [], [], [], []


def keep_image(file, source=None):
    files.append(dict(file=str(file.relative_to(root)), sha256=sha(file), size=list(Image.open(file).size),
        source=str((source or file).resolve()), rescaled=False))
    return str(file.relative_to(root))


def copy_image(source, name):
    file = root / 'media' / name
    if file.exists():
        assert args.resume_media and sha(file) == sha(source)
    else:
        shutil.copyfile(source, file)
    assert sha(file) == sha(source)
    return keep_image(file, source)


def copy_video(report_directory, cycle, label, name):
    source = report_directory / cycle['videoFile']
    target = root / 'media' / name
    if target.exists():
        assert args.resume_media and sha(target) == sha(source)
    else:
        shutil.copyfile(source, target)
    capture = cycle['videoCapture']
    assert capture['rescaled'] is False and capture['timing'] == 'UNCHANGED_NATIVE_CLOCK'
    assert sha(source) == sha(target)
    video_files.append(dict(file=str(target.relative_to(root)), source=str(source.resolve()), sha256=sha(target),
        size=[capture['width'], capture['height']], rescaled=False, timing=capture['timing'],
        phaseRange=cycle['expectedPhases'], label=label))
    return str(target.relative_to(root))


entries = read(evidence / 'native-plan.json')['cases']
old_plan = read(guide / 'native-plan-v3.json')['cases']
new_reports, old_reports = {}, {}
for entry in entries:
    prior = next(p for p in old_plan if p['id'] == entry['id'])
    for density in [2, 4]:
        for collection, directory in [(new_reports, Path(entry['output'] + f'-{density}x-v1')),
                (old_reports, Path(prior['output'] + f'-{density}x-v1'))]:
            report = read(directory / 'report.json')
            assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
            collection[entry['id'], density] = (directory, report)
            pins.append(dict(file=str(directory / 'report.json'), sha256=sha(directory / 'report.json')))
    original_dir = Path(entry['reusedOriginalReport']).parent
    original = read(original_dir / 'report.json')
    assert original['status'] == 'PASS_SELECTED_NATIVE_CASES'
    old_reports[entry['id'], 1] = (original_dir, original)
    pins.append(dict(file=str(original_dir / 'report.json'), sha256=sha(original_dir / 'report.json')))
    name = 'NAPSYA' if entry['id'] == '2' else 'CALA10'
    # The normal phase-zero captures share the original placement and crop.
    # They compare source anatomy, not whole-scene deterministic pixel parity.
    images = {}
    source_rects = []
    for label, density in [('Original', 1), ('2X', 2), ('4X', 4)]:
        directory, report = old_reports[entry['id'], 1] if density == 1 else new_reports[entry['id'], density]
        cycle = next(c for c in report['linkedBuildingCycles'] if c['name'] == name and not c['fixture'])
        capture = next(c for c in cycle['captures'] if c['phase'] == 0)
        assert capture['rescaled'] is False
        source_rects.append(capture['source'])
        images[label] = copy_image(directory / capture['file'], f'{name}-{label}-phase-zero.png')
    assert source_rects[0] == source_rects[1] == source_rects[2]
    scenes.append(dict(name=name + ' / original placement / native phase 0', images=images))
    for name in entry['identities']:
        for state in ['normal', 'damaged']:
            images = {}
            for density in [2, 4]:
                directory, report = new_reports[entry['id'], density]
                sample = next(r for r in report['newNativeStates']['buildings'] if r['normal']['name'] == name)
                capture = sample[state + 'Capture']
                assert capture['rescaled'] is False
                images[f'{density}X'] = copy_image(directory / capture['file'], f'{name}-{density}X-{state}.png')
            states.append(dict(name=f'{name} / R1 native {state}', images=images))

for group_id, name, state in [('2', 'NAPSYA', 'normal'), ('2', 'NAPSYA', 'damaged'),
        ('2', 'NAPSYB', 'damaged'), ('3', 'CALA10', 'normal'), ('3', 'CALA10', 'damaged')]:
    clips, labels, ranges = {}, {}, []
    for label, collection, density in [('Original', old_reports, 1), ('Previous 2X', old_reports, 2),
            ('R1 2X', new_reports, 2), ('Previous 4X', old_reports, 4), ('R1 4X', new_reports, 4)]:
        directory, report = collection[group_id, density]
        cycle = next(c for c in report['linkedBuildingCycles'] if c['name'] == name and c['state'] == state
            and c['status'] == 'PASS_ALL_ORIGINAL_PHASES_AND_NATIVE_LOOP_RETURN'
            and (c['fixture'] if group_id == '2' else True))
        ranges.append(cycle['expectedPhases'])
        clips[label] = copy_video(directory, cycle, label, f'{name}-{state}-{label.replace(" ", "-")}.webm')
        labels[label] = 'Original' if density == 1 else f'{density}X'
    assert all(p == ranges[0] for p in ranges)
    videos.append(dict(name=f'{name} / {state} / native full loop', videos=clips, densityLabels=labels))

cache = {}


def canvas(pack, name, number, density):
    source = sources[name]
    f = source['frames'][number]
    result = Image.new('RGBA', tuple(n * density for n in source['canvas']))
    if pack is None:
        tile = Image.frombytes('RGBA', tuple(f['size']), (guide / 'native' / f['file']).read_bytes())
        tile = tile.resize(tuple(n * density for n in tile.size), Image.Resampling.NEAREST)
    else:
        folder = pack / 'members' / name.replace('.', '-')
        identity = str(folder), density
        if identity not in cache:
            m = read(folder / 'manifest.json')
            v = next(v for v in m['variants'] if v['density'] == density)
            cache[identity] = (v, {p['id']: Image.open(folder / str(density) / p['id'] / 'base.png').convert('RGBA') for p in v['pages']})
        variant, pages = cache[identity]
        frame = next(frame for frame in variant['frames'] if frame['nativeFrame'] == number)
        x, y, w, h = frame['sampleRect']
        tile = pages[frame['page']].crop((x, y, x + w, y + h))
    result.alpha_composite(tile, tuple(n * density for n in f['origin']))
    return result


board_count = 0
for name, body_name, groups in [('nupsya_a.shp', 'nupsya.shp', [(0, 14, 0), (14, 28, 1)]),
        ('ngpsyb_a.shp', 'ngpsyb.shp', [(15, 30, 1)]), ('cgla10_a.shp', 'cgla10.shp', [(0, 45, 0)])]:
    for lo, hi, body_frame in groups:
        for start in range(lo, hi, 4):
            numbers = list(range(start, min(start + 4, hi)))
            for density in [2, 4]:
                width, height = [n * density for n in sources[name]['canvas']]
                board = Image.new('RGB', (width * 3, (height + 36) * len(numbers) + 44), '#161c25')
                draw = ImageDraw.Draw(board)
                for column, (label, pack) in enumerate([('Original (nearest reference)', None), ('Previous HD', before), ('R1 fixed surfaces', after)]):
                    draw.text((column * width + 12, 8), f'{label} / {density}X', fill='white', font_size=22)
                    for row, number in enumerate(numbers):
                        combined = canvas(pack, body_name, body_frame, density)
                        combined.alpha_composite(canvas(pack, name, number, density))
                        y = 44 + row * (height + 36)
                        board.paste(combined, (column * width, y + 30), combined)
                        draw.text((column * width + 12, y + 4), f'{name} / source phase {number}', fill='white', font_size=20)
                file = root / 'media' / f'atlas-{density}X-{name}-from-{start:03d}.png'
                if file.exists():
                    assert args.resume_media and ImageChops.difference(Image.open(file).convert('RGB'), board).getbbox() is None
                else:
                    board.save(file)
                comparisons.append(dict(name=f'{name} / source phases {numbers[0]}-{numbers[-1]} / actual {density}X', image=keep_image(file)))
                board_count += 1
assert board_count == 48 and len(video_files) == 25
title = 'M2.4 Urban Batch 61 R1: three linked alignment corrections'
summary = ('Review only NAPSYA lower-right body join and fixed supports, NAPSYB damaged base/shaft, and CALA10 frame/supports. '
    'Use 2X or 4X to compare Previous and R1 recordings side by side; Compare all includes Original. Clips use unchanged native clocks '
    'and run independently. Full source-phase boards include every affected slot, including unused transition slots. '
    'The other families and unchanged beacon normal artwork do not need another review. Original controls are reused from the identical '
    'passed sources; whole-scene pixel parity is not claimed. Mac checks pass; visual acceptance is pending. Windows NOT_RUN. M2.4 incomplete.')
manifest = dict(schema='m2-4-environment-production-batch-review-v1', title=title, summary=summary,
    scenes=scenes, states=states, comparisons=comparisons, files=files, videoFiles=video_files, videos=videos, evidence=pins,
    visualDirection='PENDING_THREE_REPORTED_FAMILIES', technical='PASS_SCOPED_MAC_NATIVE_CHECKS',
    fixtureDisclosure='Source-phase controls retain the same original placement/crop. State/power fixtures retain native rules and legal foundations; fixture action ticks and locations can differ. Videos run independently.')
(root / 'review-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(root / 'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><title>' + title + '</title><h1>' + title + '</h1><p>' + summary + '</p></html>\n')
subprocess.run(['python3', 'scripts/m2-4/embed-review.py', '--source', str(root), '--output',
    str(root / 'M2.4-Urban-Linked-Alignment-R1-Embedded.html')], check=True)
