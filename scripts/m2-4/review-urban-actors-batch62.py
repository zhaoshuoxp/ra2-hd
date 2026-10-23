"""Combine all nine new actors into one offline review with embedded images and clips."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
base = Path('.artifacts/m2-4')
native = base / 'urban-actors-native-batch62-v1'
root = base / 'urban-actors-review-batch62-v1'
root.mkdir()
(root / 'media').mkdir()
closure = read(native / 'native-closure.json')
assert closure['status'] == 'PASS_1204_SHP_FRAMES_96_VXL_BEARINGS_AND_12_MAC_CASES'
files, video_files, scenes, states, comparisons, videos = [], [], [], [], [], []


def image(source, name):
    destination = root / 'media' / name
    shutil.copyfile(source, destination)
    assert sha(source) == sha(destination)
    files.append(dict(file='media/' + name, source=str(source.resolve()), sha256=sha(source),
        size=list(Image.open(source).size), rescaled=False))
    return 'media/' + name


def video(source, name, capture):
    destination = root / 'media' / name
    shutil.copyfile(source, destination)
    assert sha(source) == sha(destination)
    video_files.append(dict(file='media/' + name, source=str(source.resolve()), sha256=sha(source),
        size=[capture['width'], capture['height']], rescaled=False, timing='UNCHANGED_NATIVE_CLOCK'))
    return 'media/' + name


directories = {
    'Original': native / 'native-inf-yr-original-v1',
    '2X': native / 'native-inf-yr-2x-v1',
    '4X': native / 'native-inf-yr-4x-v1',
}
reports = {label: read(folder / 'report.json') for label, folder in directories.items()}
actors = {label: {actor['name']: actor for actor in report['newNativeStates']['actors']}
    for label, report in reports.items()}
for name in ['CIVBBP', 'PRES', 'SSRV']:
    scene = {}
    for label, folder in directories.items():
        route = reports[label]['captureRoute']
        index = next(i for i, entry in enumerate(route) if entry['name'] == name)
        scene[label] = image(folder / f'{index:02d}-{name}-framebuffer.png', f'scene-{name}-{label}.png')
    scenes.append(dict(name=f'YR / xpotomac.map / {name}', images=scene))
    for action in ['ready', 'walk', 'fire', 'cheer', 'wounded', 'death']:
        key = {'walk': 'walkCapture', 'fire': 'fireCapture'}.get(action, action + 'Capture')
        if key not in actors['2X'][name]:
            continue
        samples = {}
        for label, folder in directories.items():
            capture = actors[label][name][key]
            assert capture['rescaled'] is False
            samples[label] = image(folder / capture['file'], f'state-{name}-{action}-{label}.png')
        states.append(dict(name=f'{name} / native {action}', images=samples))
    clips = {}
    for label in directories:
        actor = actors[label][name]
        clips[label] = video(Path(actor['clip']), f'{name}-{label}-native-states.webm', actor['clipRecording'])
    videos.append(dict(name=f'{name} / native idle, walking, action, wound and death', videos=clips))

for group, map_name in [('vehicles', 'hillbtwn.map'), ('plane', 'xoceansid.map')]:
    directories = {'Original': native / f'native-{group}-original-v1',
        '2X': native / f'native-{group}-2x-v{2 if group == "vehicles" else 1}',
        '4X': native / f'native-{group}-4x-v1'}
    reports = {label: read(folder / 'report.json') for label, folder in directories.items()}
    for actor in reports['2X']['newNativeNeutralVehicles']['cases']:
        name = actor['name']
        for heading in [0, 225]:
            samples = {}
            for label, folder in directories.items():
                filename = f'{name}-heading-{heading}-' + ('original-framebuffer.png' if label == 'Original' else 'framebuffer.png')
                samples[label] = image(folder / filename, f'scene-{name}-{heading}-{label}.png')
            scenes.append(dict(name=f'YR / {map_name} / {name} / heading {heading}', images=samples))
        clips = {}
        for label in ['2X', '4X']:
            sample = next(a for a in reports[label]['newNativeNeutralVehicles']['cases'] if a['name'] == name)
            clips[label] = video(Path(sample['clip']), f'{name}-{label}-native-movement.webm', sample['clipRecording'])
        videos.append(dict(name=f'{name} / native moves, turning, damage and destruction', videos=clips))

source = base / 'urban-actors-comparisons-batch62-v1'
index = read(source / 'index.json')
assert index['originalSlots'] == 602
for number, output in enumerate(index['outputs']):
    row, = read(Path(output['output']) / 'index.json')
    filename = f'atlas-{row["density"]}X-{number:03d}-{row["member"]}.png'
    comparisons.append(dict(name=f'{row["member"]} / frames {row["frames"][0]}–{row["frames"][-1]} / actual {row["density"]}X',
        image=image(Path(row['file']), filename)))
for row in read(base / 'urban-vehicle-comparisons-batch62-v1/index.json')['outputs']:
    filename = f'atlas-{row["density"]}X-{row["identity"]}.png'
    comparisons.append(dict(name=f'{row["identity"]} / all eight native headings / actual {row["density"]}X',
        image=image(Path(row['file']), filename)))
title = 'M2.4 Urban Batch 62: nine complete civilian actor families'
summary = ('Review CIVBBP baseball civilian, President, Secret Service, jeep, yellow taxi, black taxi, ambulance, fire engine '
    'and civilian propeller aircraft. This page combines the entire batch: three complete infantry bodies with 602 native poses, '
    'six complete native vehicle bodies with eight headings each, and independently sampled 2X/4X detail. '
    'Live clips show ordinary native actions; SSRV fires its original pistol, while unarmed civilians retain their original behavior. '
    'CIVP keeps its original ground locomotion. Native action clips use separate natural runs, not synchronized phase comparisons. '
    'Every source pose and heading is included in the optional atlas section. Original atlas pixels are enlarged only as comparison controls. '
    'The native game framebuffer captures retain their actual size and camera scale. '
    'All earlier accepted art is reused without another review. Technical Mac checks pass; only this new artwork awaits user acceptance. '
    'The other batch acceptance states are unchanged. NewUrban, Desert, Windows testing and final M2.4 delivery remain separate and incomplete.')
manifest = dict(schema='m2-4-environment-production-batch-review-v1', title=title, summary=summary,
    status='MAC_TECHNICAL_PASS_USER_VISUAL_PENDING_WINDOWS_NOT_RUN', theater='URBAN',
    scenes=scenes, states=states, comparisons=comparisons, videos=videos, files=files, videoFiles=video_files,
    evidence=closure['nativeReports'], nativeClosure=dict(file=str(native / 'native-closure.json'), sha256=sha(native / 'native-closure.json')),
    selectedEnvironment=closure['selectedEnvironment'], newActorFamilies=9, originalPoses=602, nativeHeadings=48,
    policy='One embedded HTML/JSON review; no per-batch Mac game copy. Original archives, maps, timing and gameplay are unchanged.')
(root / 'review-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(root / 'index.html').write_text(f'<!doctype html><html lang="en"><meta charset="utf-8"><title>{title}</title><h1>{title}</h1><p>{summary}</p>\n')
subprocess.run(['python3', 'scripts/m2-4/embed-review.py', '--source', str(root), '--output',
    str(root / 'M2.4-Urban-Batch62-Embedded.html')], check=True)
print(json.dumps(dict(images=len(files), clips=len(video_files), scenes=len(scenes), nativeStates=len(states),
    sourceBoards=len(comparisons), embedded=str(root / 'M2.4-Urban-Batch62-Embedded.html'))))
