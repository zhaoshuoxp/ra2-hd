"""Select the statically verified complete batch in the isolated task only."""
import hashlib
import json
from pathlib import Path

ROOT = Path('.artifacts/m2-4/newurban-buildings-batch88-20261020')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
export = read(ROOT / 'export-and-preservation-v2.json')
audit = read(ROOT / 'static-audit-v2.json')
assert audit['status'] == 'PASS_39_COMPLETE_FAMILIES_EXACT_ACCEPTED_REUSE_CONTINUOUS_AUTHORED_RUBBLE'
assert audit['exactAcceptedBodyDensityFrames'] == 234 and audit['newRubbleDensityFrames'] == 74
contract = Path('desktop/environment-newurban-hd-contract.json')
selector = Path('.local/environment-newurban-selection.json')
assert read(contract) == read(ROOT / 'baseline-contract.json')
assert read(selector) == export['baseline']
candidate = read(ROOT / 'contract-candidate-v2.json')
assert candidate['selectedPack'] == export['candidate']
record = dict(status='STATIC_PASS_39_COMPLETE_FAMILIES_SELECTED_NATIVE_AND_VISUAL_PENDING',
    baseline=export['baseline'], candidate=export['candidate'], previousContract=pin(contract),
    previousSelector=pin(selector), staticAudit=pin(ROOT / 'static-audit-v2.json'),
    internalInspection='All 37 actual-density continuous rubble subjects and full-master separation inspected.',
    reviewScope='37 new rubble studies only; 117 accepted body states, one accepted shared rubble and one unused native slot need no repeat review.',
    preparedCore='Unchanged valid core dependency index. New environment metadata/pages are fresh actual hash dependencies.',
    windows='NOT_RUN', m24Complete=False)
with (ROOT / 'selection-v1.json').open('x') as stream:
    stream.write(json.dumps(record, indent=2) + '\n')
contract.write_text(json.dumps(candidate, indent=2) + '\n')
selector.write_text(json.dumps(export['candidate'], indent=2) + '\n')
print(json.dumps(dict(candidate=export['candidate'], completeFamilies=39, newStudies=37)))
