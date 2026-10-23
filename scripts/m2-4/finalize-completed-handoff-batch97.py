"""Keep the immutable in-progress log snapshot and pin the completed handoff output separately."""
import copy
import shutil
from pathlib import Path
from newurban_batch89_io import pin, read, write

root = Path('.artifacts/m2-4/newurban-remaining-actors-batch97-20261021')
parent = root / 'resource-handoff-v1.json'
ledger = read(parent)
snapshot = root / 'handoff-build-v1.log'
old, = [row for row in ledger['files'] if row['file'] == str(snapshot)]
assert old['bytes'] == 0 and old['sha256'] == 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
assert not snapshot.exists()
with snapshot.open('xb'):
    pass
assert pin(snapshot) == old
complete = root / 'handoff-completed-v1.log'
assert not complete.exists()
shutil.copyfile('.artifacts/m2-4/batch97-handoff-build-v1.log', complete)
correction = root / 'handoff-log-finalization-v1.json'
write(correction, dict(status='FINALIZED_COMPLETED_LOG_WITHOUT_MUTATING_FROZEN_SNAPSHOT',
    immutableLedger=pin(parent), frozenInProgressLog=old, completedOutput=pin(complete),
    explanation='The first ledger captured its redirected output before its final print. That empty snapshot is restored exactly to its recorded hash. Completed output is retained separately and added to the final ledger. No source, image, pack, native evidence or accepted dependency pin changes.',
    artworkAndApplicationChanged=False))
final = copy.deepcopy(ledger)
final['originalInheritedLedger'] = final['inheritedLedger']
final['inheritedLedger'] = pin(parent)
final['logFinalization'] = pin(correction)
for file in [parent, complete, correction, Path(__file__)]:
    row = pin(file)
    assert row['file'] not in {item['file'] for item in final['files']}
    final['files'].append(row)
final['fileCount'] = len(final['files'])
write(root / 'resource-handoff-v2.json', final)
print(dict(files=final['fileCount'], finalLedger=pin(root / 'resource-handoff-v2.json')))
