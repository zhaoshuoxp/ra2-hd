"""Select the complete internally inspected correction in the isolated task only."""
import hashlib
import json
from pathlib import Path

ROOT = Path('.artifacts/m2-4/newurban-rubble-continuous-r1-20261020')
CONTRACT = Path('desktop/environment-newurban-hd-contract.json')
SELECTOR = Path('.local/environment-newurban-selection.json')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
export = read(ROOT / 'export-and-preservation-v2.json')
audit = read(ROOT / 'static-audit-v2.json')
assert audit['status'] == 'PASS_COMPLETE_FAMILIES_CHANGED_RUBBLE_SCOPE_AND_AUTHORED_VISUAL_COVERAGE'
assert audit['exactAcceptedBodyDensityFrames'] == 120 and audit['correctedRubbleDensityFrames'] == 40
assert export['baseline'] == read(CONTRACT)['selectedPack'] == read(SELECTOR)
current = read(ROOT / 'contract-candidate-v2.json')
assert current['selectedPack'] == export['candidate']
record = dict(status='STATIC_PASS_CORRECTED_RUBBLE_SELECTED_MAC_AND_VISUAL_PENDING',
    baseline=export['baseline'], candidate=export['candidate'], previousContract=pin(CONTRACT),
    previousSelector=pin(SELECTOR), staticAudit=pin(ROOT / 'static-audit-v2.json'),
    sourceSummary=pin(Path(audit['summary']['file'])), internalInspection='All nineteen corrected atlas subjects inspected; nominal row contamination corrected before selection.',
    visualContract='Reopened rubble uses authored continuous alpha in unchanged native logical frames. All native source data, original shadows and accepted body states remain exact.',
    changedDensityFrames=40, uniqueCorrectedStudies=19, newCoverageAdded=0,
    preparedCore='Unchanged valid core index; new environment metadata and PNG hashes require fresh direct resource validation.',
    visualAcceptance='PENDING_19_CORRECTED_RUBBLE_STUDIES', windows='NOT_RUN', m24Complete=False)
with (ROOT / 'selection-v1.json').open('x') as stream:
    stream.write(json.dumps(record, indent=2) + '\n')
CONTRACT.write_text(json.dumps(current, indent=2) + '\n')
SELECTOR.write_text(json.dumps(export['candidate'], indent=2) + '\n')
print(json.dumps(dict(candidate=export['candidate'], newCoverageAdded=0, native='PENDING')))
