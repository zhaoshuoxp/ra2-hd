"""Measure staged body mothers without claiming animation or complete-family coverage."""
import hashlib
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path('scripts/m2').resolve()))
from showcase_registration import capacity, register

ROOT = Path('.artifacts/m2-4/desert-final-buildings-authoring-batch86-v1')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
name = sys.argv[1]
assert Path(name).name == name and name.endswith('.json')
generation = []
for file in sorted(ROOT.glob('body-generation-receipts-group*.json')):
    for row in read(file):
        origin, destination = Path(row['origin']), Path(row['destination'])
        if not destination.exists():
            shutil.copyfile(origin, destination)
        assert origin.read_bytes() == destination.read_bytes()
        with Image.open(destination) as image:
            assert image.mode == 'RGBA'
            generation.append(dict(**row, sha256=sha(destination), bytes=destination.stat().st_size,
                size=list(image.size), alphaExtrema=list(image.getchannel('A').getextrema())))
work = read(ROOT / 'body-worklist-v1.json')
overrides = read(ROOT / 'body-slot-overrides-v1.json')
rows, pending, failed = [], [], []
for key, original in work['slots'].items():
    info = {**original, **overrides.get(key, {})}
    file = ROOT / info['board']
    if not file.exists():
        pending.append(key)
        continue
    cell_count = info.get('occupied', sum(slot['board'] == info['board'] for slot in work['slots'].values()))
    with Image.open(file) as image:
        rect, _ = register(image.convert('RGBA'), info, info['boardSize'], isolated=cell_count == 1)
    measured = capacity(rect, info['nativeBounds'])
    row = dict(key=key, master=str(file), masterSha256=sha(file), sourceRect=list(rect),
        actualCapacity=measured, status='PASS_4X_CAPACITY' if measured >= 4 else 'REJECT_BELOW_4X')
    rows.append(row)
    if measured < 4:
        failed.append(key)
result = dict(status='BODY_MOTHERS_MEASURED_COMPLETE_FAMILY_EXPORT_PENDING', generatedFiles=len(generation),
    availableBodyStates=len(rows), plannedBodyStates=10, minimumActualCapacity=min(row['actualCapacity'] for row in rows),
    failedSlots=failed, pendingSlots=pending, slots=rows, generation=generation,
    airportActiveAnimation='PENDING_STABLE_FIXED_MATERIAL_AND_ORIGINAL_PHASE_EXPORT',
    pyramidGeometry='PENDING_SOURCE_TIER_AND_STATE_REGISTRATION_CHECK',
    selectionChanged=False, coverageAdded=0, windows='NOT_RUN', m24Complete=False)
with (ROOT / name).open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ['status', 'generatedFiles', 'availableBodyStates',
    'minimumActualCapacity', 'failedSlots', 'pendingSlots']}))
