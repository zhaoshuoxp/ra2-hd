"""Stage generated mothers exclusively and measure actual native HD capacity without selecting resources."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_registration import capacity, register

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('receipt', help='New immutable QA receipt filename inside the authoring directory')
args = parser.parse_args()
assert Path(args.receipt).name == args.receipt and args.receipt.endswith('.json')
root = Path('.artifacts/m2-4/desert-morocco-authoring-batch85-v1')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
work = read(root / 'worklist.json')
overrides = read(root / 'slot-overrides.json') if (root / 'slot-overrides.json').exists() else {}
generation = []
for file in sorted(root.glob('generation-receipts-group*.json')):
    for row in read(file):
        source, destination = Path(row['origin']), Path(row['destination'])
        assert destination.parent.resolve() == root.resolve()
        if not destination.exists():
            with destination.open('xb') as stream:
                stream.write(source.read_bytes())
        assert sha(destination) == sha(source)
        generation.append(dict(**row, sha256=sha(destination), bytes=destination.stat().st_size,
            size=list(Image.open(destination).size), receipt=str(file)))
masters, available, pending, failures = {}, [], [], []
for key, original in work['slots'].items():
    info = {**original, **overrides.get(key, {})}
    file = root / info['board']
    if not file.exists():
        pending.append(key)
        continue
    try:
        if file not in masters:
            masters[file] = Image.open(file).convert('RGBA')
        rect, _ = register(masters[file], info, info['boardSize'], isolated=info.get('occupied') == 1)
        value = capacity(rect, info['nativeBounds'])
        assert value >= 4, f'Insufficient actual master capacity: {value}'
        available.append(dict(slot=key, mother=str(file), motherSha256=sha(file), actualSize=list(masters[file].size),
            sourceRect=rect, nativeBounds=info['nativeBounds'], actualCapacity=value))
    except Exception as error:
        failures.append(dict(slot=key, mother=str(file), error=str(error), selected=False))
result = dict(status='ALL_40_SOURCE_STATES_HAVE_4X_CAPACITY' if len(available) == 40 else 'PARTIAL_MOTHER_PRODUCTION',
    worklistSha256=sha(root / 'worklist.json'), generatedFiles=len(generation), availableStates=len(available),
    plannedStates=40, pendingSlots=pending, failedSlots=failures,
    minimumActualCapacity=min((row['actualCapacity'] for row in available), default=None),
    generation=generation, available=available, sourceOnlyReferencesAreNotHD=True,
    selectedResourcesChanged=False, exportedOrNativeCoverageAdded=False, visualAcceptance='PENDING_NEW_ART',
    windows='NOT_RUN', m24Complete=False)
with (root / args.receipt).open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(status=result['status'], generatedFiles=len(generation), availableStates=len(available),
    minimumActualCapacity=result['minimumActualCapacity'], failedSlots=failures, pendingSlots=len(pending))))
