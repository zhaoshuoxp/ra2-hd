"""Compare complete Original/2X/4X rescue states and retain native-pixel capture controls."""
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
board = Image.new('RGB', (1540, 1010), (44, 57, 53))
draw = ImageDraw.Draw(board)
draw.text((15, 10), 'Einstein / naturally selected frames / actual capture pixels', font=font, fill='white')
cases = []
for row, density in enumerate([0, 2, 4]):
    file, report = reports[density]
    assert report['status'] == 'PASS_ORIGINAL_SOURCE_EINSTEIN_NATURAL_WALK_BOARDING_AND_TEAM_EXIT'
    assert not report['errors'] and not report['failedResources'] and not report.get('consoleErrors')
    assert report['mission'] == 'all04dmd.map' and report['identity'] == 'EINS'
    assert report['sourceCheckpoint'] == original['sourceCheckpoint'] and report['start'] == original['start']
    # Compare every serialized field, including media and callback state. No
    # normalization or omission of state differences is allowed here.
    for key in ['restored', 'before', 'after', 'sourceOutcome']:
        assert report[key] == original[key], (density, key)
    assert report['after']['tick']-report['before']['tick'] == report['ticks'] == 1200
    observations = report['observations']
    assert len(observations) == 241
    assert [r['tick'] for r in observations] == list(range(104850, 106051, 5))
    assert any(r.get('carrier') for r in observations)
    assert all(r['glError'] == 0 and not r['shadowOverride'] for r in observations)
    assert all(r['hd'] == (density > 0) for r in observations
        if r['spawned'] and r.get('frame') is not None)
    captures = [r for r in observations if r.get('file')]
    assert len(captures) == 5 and len({r['frame'] for r in captures}) == 5
    screenshots = []
    for column, capture in enumerate(captures):
        png_file = file.parent/capture['file']
        png = Image.open(png_file).convert('RGB')
        assert png.size == (2560, 1856)
        assert abs(capture['framing']['x']) < 1 and abs(capture['framing']['y']) < 1
        # The fixed native observer viewport centers the actor at (1108,898).
        # Crop only for this inspection board; source captures stay untouched.
        crop = png.crop((960, 760, 1260, 1050))
        assert len(crop.getcolors(crop.width*crop.height)) > 16
        x, y = 15+column*305, 50+row*320
        label = ('Original' if density == 0 else f'{density}X')+f' / {capture["frame"]:03d} / {capture["tick"]}'
        draw.text((x, y), label, font=font, fill='white')
        board.paste(crop, (x, y+29))
        screenshots.append({'file': str(png_file), 'sha256': sha(png_file),
            'frame': capture['frame'], 'tick': capture['tick'], 'resampling': 'NONE'})
    cases.append({'density': density, 'file': str(file), 'sha256': sha(file),
        'observations': len(observations), 'naturalFrames': sorted(r['frame'] for r in captures),
        'boardingTicks': [r['tick'] for r in observations if r.get('carrier')],
        'screenshots': screenshots})
board_file = args.output/'natural-rescue-native-pixels.png'
board.save(board_file)
result = {'schema': 'yr-einstein-natural-action-comparison-v1',
    'status': 'PASS_COMPLETE_SOURCE_STATE_EQUIVALENCE_NATIVE_CAPTURE_REVIEW_PENDING',
    'mission': 'all04dmd.map', 'identity': 'EINS', 'ticks': [104850, 106050],
    'sourceCheckpoint': original['sourceCheckpoint'], 'cases': cases,
    'completeFieldEquality': ['restored', 'before', 'after', 'sourceOutcome'],
    'beforeStateSha256': state_sha(original['before']), 'afterStateSha256': state_sha(original['after']),
    'beforeWorldHash': original['before']['hash'], 'afterWorldHash': original['after']['hash'],
    'sourceOutcome': original['sourceOutcome'], 'observer': 'scripts/yr-campaign/native-task-npc-actions.mjs',
    'observerSha256': sha(Path('scripts/yr-campaign/native-task-npc-actions.mjs')),
    'board': {'file': str(board_file), 'sha256': sha(board_file), 'resampling': 'NONE'},
    'qualification': 'Original source actor walks, boards its original transport and leaves through its original team script. '
        'Normal animation chooses all displayed frames. Full world, RNG, mission/media and pending-callback states are exactly equal at every compared boundary. '
        'Camera framing and immediate rendering affect observation only. No actors, poses, health, tasks, ownership, rules, world, RNG or results are assigned.',
    'r1CaptureLimitation': 'Earlier 4X R1 captures show a black world because the inspection camera was not centered. '
        'Retain those reports and images; they do not qualify visual behavior. R2 corrects camera framing and requires rendered world pixels.',
    'userVisualAcceptance': 'PENDING', 'windows': 'NOT_RUN_ON_THIS_MAC'}
(args.output/'report.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps({key: result[key] for key in ['status', 'ticks', 'beforeWorldHash', 'afterWorldHash']}))
