"""Compare full source states and lay out untouched natural general capture pixels."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('reports', type=Path, nargs=3)
args = parser.parse_args()
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
state_sha = lambda value: hashlib.sha256(json.dumps(value, sort_keys=True,
    separators=(',', ':')).encode()).hexdigest()
reports = {json.loads(file.read_text())['density']: (file, json.loads(file.read_text()))
    for file in args.reports}
assert set(reports) == {0, 2, 4}
original = reports[0][1]
args.output.mkdir(parents=True, exist_ok=False)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
cases, boards = [], []
for density in [0, 2, 4]:
    file, report = reports[density]
    assert report['status'] == 'PASS_ORIGINAL_SOURCE_GENERAL_NATURAL_ANIMATION_OBSERVATIONS'
    assert report['mission'] == 'all06umd.map' and report['identity'] == 'PENTGEN'
    assert not report['errors'] and not report['failedResources'] and not report.get('consoleErrors')
    assert report['sourceCheckpoint'] == original['sourceCheckpoint'] and report['start'] == original['start']
    for key in ['restored', 'before', 'after', 'sourceOutcome']:
        assert report[key] == original[key], (density, key)
    assert report['after']['tick']-report['before']['tick'] == report['ticks'] == 1200
    assert report['start']['health'] == report['sourceOutcome']['health'] == 100
    assert not report['sourceOutcome']['inspectionModified']
    assert report['sourceOutcome']['spawned'] and not report['sourceOutcome']['disposed']
    assert report['sourceOutcome']['teams'] and all(team['phase'] == 'holding'
        for team in report['sourceOutcome']['teams'])
    observations = report['observations']
    assert len(observations) == 241
    assert [row['tick'] for row in observations] == list(range(750, 1951, 5))
    for actual, control in zip(observations, original['observations'], strict=True):
        for key in ['tick', 'id', 'health', 'spawned', 'disposed', 'removed', 'carrier', 'tile', 'direction']:
            assert actual.get(key) == control.get(key), (density, actual['tick'], key)
        assert actual['glError'] == 0 and not actual['shadowOverride']
        if actual['spawned'] and actual.get('frame') is not None:
            assert actual['hd'] == (density > 0)
            assert actual['shadowFrame'] == actual['frame']+262
    assert len({tuple(row['tile']) for row in observations if row.get('tile')}) > 1
    captures = [row for row in observations if row.get('file')]
    assert len(captures) == len({row['frame'] for row in captures}) > 1
    actions = sorted({membership['action'] for frame in report['naturalFrames']
        for membership in frame['memberships']})
    assert 'Walk' in actions
    screenshots = []
    for start in range(0, len(captures), 16):
        entries = captures[start:start+16]
        board = Image.new('RGB', (1300, ((len(entries)+3)//4)*330+50), (44, 57, 53))
        draw = ImageDraw.Draw(board)
        label = 'Original' if density == 0 else f'{density}X'
        draw.text((15, 10), f'General / original-script natural frames / {label}', font=font, fill='white')
        page_captures = []
        for index, capture in enumerate(entries):
            png_file = file.parent/capture['file']
            png = Image.open(png_file).convert('RGB')
            assert png.size == (2560, 1856)
            assert abs(capture['framing']['x']) < 1 and abs(capture['framing']['y']) < 1
            crop = png.crop((960, 760, 1260, 1050))
            assert len(crop.getcolors(crop.width*crop.height)) > 16
            x, y = 15+index%4*325, 50+index//4*330
            draw.text((x, y), f'{capture["frame"]:03d} / tick {capture["tick"]}', font=font, fill='white')
            board.paste(crop, (x, y+29))
            item = {'file': str(png_file), 'sha256': sha(png_file), 'frame': capture['frame'],
                'tick': capture['tick'], 'resampling': 'NONE'}
            screenshots.append(item)
            page_captures.append(item)
        board_file = args.output/f'{density}x-natural-native-pixels-{start//16+1}.png'
        board.save(board_file)
        boards.append({'file': str(board_file), 'sha256': sha(board_file), 'density': density,
            'resampling': 'NONE', 'captures': page_captures})
    cases.append({'density': density, 'file': str(file), 'sha256': sha(file),
        'observations': len(observations), 'naturalFrames': sorted(row['frame'] for row in captures),
        'sourceSequenceMemberships': actions, 'screenshots': screenshots})
result = {'schema': 'yr-general-natural-action-comparison-v1',
    'status': 'PASS_COMPLETE_SOURCE_STATE_EQUIVALENCE_NATIVE_CAPTURE_REVIEW_PENDING',
    'mission': 'all06umd.map', 'identity': 'PENTGEN', 'ticks': [750, 1950],
    'sourceCheckpoint': original['sourceCheckpoint'], 'cases': cases, 'boards': boards,
    'completeFieldEquality': ['restored', 'before', 'after', 'sourceOutcome'],
    'everyObservedSimulationPropertyEqual': True,
    'beforeStateSha256': state_sha(original['before']), 'afterStateSha256': state_sha(original['after']),
    'beforeWorldHash': original['before']['hash'], 'afterWorldHash': original['after']['hash'],
    'sourceOutcome': original['sourceOutcome'], 'observer': 'scripts/yr-campaign/native-general-natural.mjs',
    'observerSha256': sha(Path('scripts/yr-campaign/native-general-natural.mjs')),
    'qualification': 'Original source generals and guards move through their original convoy scripts and hold at the source destination. '
        'The normal game loop chooses all presentation phases and an observer gate pauses exactly at source ticks. '
        'Full world, RNG, mission/media, callback and source team states, plus every sampled simulation property, '
        'remain exactly equal across Original/2X/4X. The camera and capture layout affect observation only. '
        'No actor, pose, health, task, ownership, rule, world, RNG or result is assigned. '
        'Unobserved boarding, combat, death and later departure remain pending.',
    'userVisualAcceptance': 'PENDING', 'windows': 'NOT_RUN_ON_THIS_MAC'}
(args.output/'report.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps({'status': result['status'], 'captures': sum(len(case['screenshots']) for case in cases),
    'boards': len(boards), 'beforeWorldHash': result['beforeWorldHash'], 'afterWorldHash': result['afterWorldHash']}))
