"""Extend the complete verified handoff with an editorial-only review correction."""
from copy import deepcopy
from pathlib import Path
import subprocess
from newurban_batch96_io import ROOT, pin, read, write

parent = ROOT / 'resource-handoff-v1.json'
expected = '6b44692cc3a099bfd1f3e7f653d0eddc99d8860a749cce900b43df5749dd458b'
assert pin(parent)['sha256'] == expected
handoff = deepcopy(read(parent))
files = {r['file']: r for r in handoff['files']}
assert len(files) == 50818
additions = [parent, ROOT / 'review-v3/M2.4-NewUrban-Final-Terrain-Batch96-Embedded.html',
    ROOT / 'review-v3/review-metadata-v1.json', ROOT / 'review-identity-correction-v1.json',
    ROOT / 'coverage-and-native-closure-v2.json', Path('scripts/m2-4/correct-review-building-identity-batch96.py'),
    Path('scripts/m2-4/handoff-review-correction-batch96.py'), Path('scripts/m2-4/deliver-newurban-final-terrain-batch96-r1.py')]
for file in additions:
    assert str(file) not in files
    files[str(file)] = pin(file)
assert read('.local/terrain-newurban-selection.json') == handoff['candidate']
for file in ['.local/terrain-newurban-selection.json', 'desktop/terrain-theater-hd-contracts.json']:
    assert pin(file) == files[file]
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
assert not subprocess.check_output(['git', 'diff', handoff['runtimeSourceCommit'], head,
    '--name-only', '--', 'src', 'desktop'], text=True).strip()
handoff.update(status='PASS_COMPLETE_INHERITED_VERIFIED_FILE_PINS_AND_EDITORIAL_REVIEW_CORRECTION',
    sourceHandoffCommit=head, closure=pin(ROOT / 'coverage-and-native-closure-v2.json'),
    inheritedVerifiedLedger=pin(parent), inheritedVerifiedFileCount=50818,
    incrementalVerification='Only new review text, metadata and helper receipts are added; all frozen parent pins remain exact. Full native and resource hashing evidence is reused because no prior file, image payload, selector, resource or runtime is changed.',
    files=list(files.values()), fileCount=len(files), editorialCorrection=pin(ROOT / 'review-identity-correction-v1.json'))
write(ROOT / 'resource-handoff-v2.json', handoff)
print(dict(files=len(files), parentFilesReused=50818, additions=len(additions), ledger=pin(ROOT / 'resource-handoff-v2.json')))
