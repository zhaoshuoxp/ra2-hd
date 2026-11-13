"""Retain source-pinned castle-collapse candidates without overwriting earlier artwork."""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('receipt', type=Path)
args = parser.parse_args()
root = Path('.local/source-art/yr-campaign-v1/transylvania-castle-collapse')
records = json.loads(args.receipt.read_text())
for row in records:
    assert re.fullmatch(r'castle-collapse-\d\d', row['id'])
    assert re.fullmatch(r'r\d+', row['revision'])
    source = Path(row['generatedPath']).resolve()
    assert source.is_relative_to(Path('/Users/Aone/.codex/generated_images'))
    assert hashlib.sha256(Path(row['reference']).read_bytes()).hexdigest() == row['referenceSha256']
    destination = root / 'masters' / f"{row['id']}-{row['revision']}.png"
    if destination.exists():
        assert destination.read_bytes() == source.read_bytes(), destination
    else:
        shutil.copy2(source, destination)
retained = root / args.receipt.name
if retained.exists():
    assert retained.read_bytes() == args.receipt.read_bytes()
else:
    shutil.copy2(args.receipt, retained)
ledger = dict(schema='yr-source-castle-collapse-generation-v1',
    masters=[dict(file=str(file), sha256=hashlib.sha256(file.read_bytes()).hexdigest(),
                  status='AUTHORING_REVIEW_IN_PROGRESS_NOT_REGISTERED')
             for file in sorted((root / 'masters').glob('*.png'))],
    prompts=[str(file) for file in sorted((root / 'prompts').glob('*.txt'))],
    generationReceipts=[str(file) for file in sorted(root.glob('castle-results-*.json'))],
    userVisualAcceptance='PENDING')
(root / 'generation-requests.json').write_text(json.dumps(ledger, indent=2) + '\n')
print(json.dumps(dict(masters=len(ledger['masters']), receipts=len(ledger['generationReceipts']))))
