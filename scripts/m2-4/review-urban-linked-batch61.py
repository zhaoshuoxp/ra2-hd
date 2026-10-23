"""Assemble six new families, complete source boards and native loop videos in one page."""
import hashlib
import html
import json
import shutil
import subprocess
from pathlib import Path

from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
base = Path('.artifacts/m2-4')
plan = read(base / 'urban-linked-native-batch61-v1/native-plan-v3.json')
comparison_root = base / 'urban-linked-comparisons-batch61-v1'
comparison_plan = read(comparison_root / 'index.json')
assert comparison_plan['status'] == 'PASS_ALL_NEW_SOURCE_POSES_PREPARED_FOR_VISUAL_QA'
root = base / 'urban-linked-review-batch61-v1'
root.mkdir()
(root / 'media').mkdir()
files, video_files, scenes, states, comparisons = [], [], [], [], []
videos, evidence, reviewed = {}, [], set()


def copy_image(source, name):
    destination = root / 'media' / name
    assert not destination.exists()
    shutil.copyfile(source, destination)
    assert sha(destination) == sha(source)
    files.append(dict(file='media/' + name, source=str(source.resolve()), sha256=sha(source),
        size=list(Image.open(source).size), rescaled=False))
    return 'media/' + name


for entry in plan['cases']:
    directories = [Path(entry.get('originalOutput', entry['output'] + '-original-v1')),
        Path(entry['output'] + '-2x-v1'), Path(entry['output'] + '-4x-v1')]
    reports = [read(directory / 'report.json') for directory in directories]
    for directory, report in zip(directories, reports):
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        assert report['selectedMap'] == entry['runtimeName'] and report['edition'] == entry['edition']
        evidence.append(dict(path=str((directory / 'report.json').resolve()), sha256=sha(directory / 'report.json')))
    assert reports[0]['captureRoute'] == reports[1]['captureRoute'] == reports[2]['captureRoute']
    label = f'{entry["edition"].upper()} / {entry["runtimeName"]}'
    for index, sample in enumerate(reports[1]['captureRoute']):
        image_files = {}
        for density, directory in zip(['Original', '2X', '4X'], directories):
            filename = f'{index:02d}-{sample["name"]}-framebuffer.png'
            image_files[density] = copy_image(directory / filename, f'case-{entry["id"]}-{density}-{filename}')
        assert len({tuple(Image.open(root / file).size) for file in image_files.values()}) == 1
        scenes.append(dict(name=f'{label} / {sample["name"]}', images=image_files, tile=sample['tile']))
    by_density = {density: {sample['normal']['name']: sample for sample in report['newNativeStates']['buildings']}
        for density, report in zip(['2X', '4X'], reports[1:])}
    for name in entry['identities']:
        if name in reviewed:
            continue
        reviewed.add(name)
        for state in ['normal', 'occupied', 'damaged', 'rubble']:
            captures = {density: samples[name].get(state + 'Capture') for density, samples in by_density.items()}
            if not any(captures.values()):
                continue
            assert all(captures.values())
            images = {}
            for density, directory in zip(['2X', '4X'], directories[1:]):
                capture = captures[density]
                assert capture['rescaled'] is False
                images[density] = copy_image(directory / capture['file'], f'case-{entry["id"]}-{density}-{capture["file"]}')
            states.append(dict(name=f'{name} / native {state}', images=images))
    for density, directory, report in zip(['Original', '2X', '4X'], directories, reports):
        for cycle in report['linkedBuildingCycles']:
            assert cycle['status'] in ['PASS_ALL_ORIGINAL_PHASES_AND_NATIVE_LOOP_RETURN', 'PASS_ORIGINAL_NEUTRAL_UNPOWERED_IDLE']
            if cycle['member'] == 'cugrd1_a.shp':
                continue
            context = 'original neutral placement: unpowered idle' if cycle['nativeIdle'] else (
                'powered native fixture' if cycle['fixture'] and cycle['state'] == 'normal'
                else 'damaged native fixture' if cycle['fixture'] else 'original map placement')
            key = f'{cycle["name"]} / {cycle["state"]} / {context}'
            capture = cycle['videoCapture']
            assert capture['rescaled'] is False and capture['timing'] == 'UNCHANGED_NATIVE_CLOCK'
            source = directory / cycle['videoFile']
            filename = f'case-{entry["id"]}-{density}-{cycle["videoFile"]}'
            destination = root / 'media' / filename
            assert not destination.exists()
            shutil.copyfile(source, destination)
            assert sha(source) == sha(destination)
            video_files.append(dict(file='media/' + filename, source=str(source.resolve()), sha256=sha(source),
                size=[capture['width'], capture['height']], rescaled=False, timing=capture['timing'],
                expectedPhases=cycle['expectedPhases'], status=cycle['status']))
            videos.setdefault(key, {})[density] = 'media/' + filename
for index, output in enumerate(comparison_plan['outputs']):
    for row in read(Path(output['output']) / 'index.json'):
        source = Path(row['file'])
        filename = f'atlas-{output["density"]}X-{index:02d}-{source.name}'
        comparisons.append(dict(name=f'{row["member"]} / frames {row["frames"][0]}-{row["frames"][-1]} / actual {row["density"]}X',
            image=copy_image(source, filename)))
assert len(reviewed) == 6
assert all(set(group) == {'Original', '2X', '4X'} for group in videos.values())
title = 'M2.4 Urban batch 61: six complete linked families'
summary = ('Review the six new families: guard shack, drive-in concession stand, movie screen, rotating Westwood billboard, '
    'psychic amplifier and psychic beacon. Every new source pose has Original/2X/4X comparisons. Live recordings cover native '
    'normal and damaged loops; neutral unpowered psychic structures remain idle, with separate owned power-plant fixtures for active loops. '
    'The nine accepted guard flag poses are reused and do not require another visual review. All original source slots, shadows, '
    'restrictions and clocks remain intact. Mac checks pass within unchanged budgets. No per-batch Mac game copy. Windows NOT_RUN. M2.4 remains incomplete.')
manifest = dict(schema='m2-4-environment-production-batch-review-v1', title=title, summary=summary,
    scenes=scenes, states=states, comparisons=comparisons, files=files,
    videos=[dict(name=name, videos=items) for name, items in videos.items()], videoFiles=video_files,
    evidence=evidence, technical='PASS_SELECTED_NATIVE_CASES', visualDirection='PENDING_USER_REVIEW',
    newFamilies=6, originalSourcePosesReviewed=214, acceptedFlagSourcePosesOmitted=9,
    fixtureDisclosure='Matched map scenes share source, seed, native camera and output. Native state fixtures use legal foundations; action ticks and fixture locations can differ between controls. Powered fixtures retain the original power and animation rules.')
(root / 'review-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(root / 'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><title>' + html.escape(title)
    + '</title><h1>' + html.escape(title) + '</h1><p>' + html.escape(summary) + '</p></html>\n')
subprocess.run(['python3', 'scripts/m2-4/embed-review.py', '--source', str(root), '--output',
    str(root / 'M2.4-Urban-Batch61-Embedded.html')], check=True)
