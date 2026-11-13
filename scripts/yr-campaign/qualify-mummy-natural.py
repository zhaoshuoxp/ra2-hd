"""Compare complete Original/2X/4X mummy lifetime states and retain native-pixel capture controls."""
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
draw.text((15, 10), 'Mummy / naturally selected walk frames / actual capture pixels', font=font, fill='white')
cases = []
for row, density in enumerate([0, 2, 4]):
    file, report = reports[density]
    assert report['status'] == 'PASS_ORIGINAL_SOURCE_MUMMY_NATURAL_ANIMATION_OBSERVATIONS'
    assert not report['errors'] and not report['failedResources'] and not report.get('consoleErrors')
    assert report['mission'] == 'all04dmd.map' and report['identity'] == 'MUMY'
    assert report['sourceCheckpoint'] == original['sourceCheckpoint'] and report['start'] == original['start']
    # Compare every serialized field, including media and callback state. No
    # normalization or omission of state differences is allowed here.
    for key in ['restored', 'before', 'after', 'sourceOutcome']:
        assert report[key] == original[key], (density, key)
    assert report['after']['tick']-report['before']['tick'] == report['ticks'] == 600
    observations = report['observations']
    assert len(observations) == 121
    assert [r['tick'] for r in observations] == list(range(111390, 111991, 5))
    assert report['start']['health'] == 100 and report['sourceOutcome']['health'] == 0
    assert report['sourceOutcome']['disposed'] and report['sourceOutcome']['removed']
    assert report['sourceOutcome']['teams'] and all(t['phase'] == 'finished' for t in report['sourceOutcome']['teams'])
    for actual, control in zip(observations, original['observations'], strict=True):
        for key in ['tick', 'id', 'health', 'spawned', 'disposed', 'removed', 'carrier', 'tile', 'direction']:
            assert actual.get(key) == control.get(key), (density, actual['tick'], key)
    assert all(any(m['action'] == 'Walk' for m in f['memberships']) for f in report['naturalFrames'])
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
        'naturalWalkTicks': [r['tick'] for r in observations if r.get('file')],
        'screenshots': screenshots})
board_file = args.output/'natural-walk-native-pixels.png'
board.save(board_file)
result = {'schema': 'yr-mummy-natural-action-comparison-v1',
    'status': 'PASS_COMPLETE_SOURCE_STATE_EQUIVALENCE_NATIVE_CAPTURE_REVIEW_PENDING',
    'mission': 'all04dmd.map', 'identity': 'MUMY', 'ticks': [111390, 111990],
    'sourceCheckpoint': original['sourceCheckpoint'], 'cases': cases,
    'completeFieldEquality': ['restored', 'before', 'after', 'sourceOutcome'],
    'beforeStateSha256': state_sha(original['before']), 'afterStateSha256': state_sha(original['after']),
    'beforeWorldHash': original['before']['hash'], 'afterWorldHash': original['after']['hash'],
    'sourceOutcome': original['sourceOutcome'], 'observer': 'scripts/yr-campaign/native-mummy-natural.mjs',
    'observerSha256': sha(Path('scripts/yr-campaign/native-mummy-natural.mjs')),
    'board': {'file': str(board_file), 'sha256': sha(board_file), 'resampling': 'NONE'},
    'qualification': 'The original pyramid-triggered mummy naturally walks through the normal game animation loop and is removed by the original combat and team lifecycle. '
        'No actor, pose, health, task, ownership, rule, world, RNG or result assignment is made. The observer gates the normal game loop at exact source ticks. '
        'Full restored, before and after world, RNG, mission/media and callback fields and every observed simulation property are equal across Original/2X/4X. '
        'Presentation phases can differ with the real display clock; every observed frame belongs to the original Walk sequence. '
        'This record does not qualify the unobserved mummy attack or death animation sequences.',
    'r1CaptureLimitation': 'Earlier R1 paused the world animation clock at each manually stepped source tick and captured only one walking phase. '
        'Those failed observer records remain retained. R2 uses the normal running presentation clock with an exact source-tick gate.',
    'userVisualAcceptance': 'PENDING', 'windows': 'NOT_RUN_ON_THIS_MAC'}
(args.output/'report.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps({key: result[key] for key in ['status', 'ticks', 'beforeWorldHash', 'afterWorldHash']}))
