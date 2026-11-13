"""Retain generated hero candidates and refresh their local provenance ledger."""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('receipt', type=Path)
args = parser.parse_args()
root = Path('.local/source-art/yr-campaign-v1/hollywood-heroes')
for row in json.loads(args.receipt.read_text()):
    assert re.fullmatch(r'(arnd|stln)-[a-z0-9-]+', row['id'])
    assert re.fullmatch(r'r\d+', row['revision'])
    source = Path(row['generatedPath']).resolve()
    assert source.is_relative_to(Path('/Users/Aone/.codex/generated_images'))
    destination = root / 'masters' / f"{row['id']}-{row['revision']}.png"
    if destination.exists():
        assert destination.read_bytes() == source.read_bytes(), destination
    else:
        shutil.copy2(source, destination)
ledger = root / 'generation-requests.json'
value = json.loads(ledger.read_text())
value['masters'] = [dict(file=str(file), sha256=hashlib.sha256(file.read_bytes()).hexdigest(),
                         status='AUTHORING_REVIEW_IN_PROGRESS_NOT_REGISTERED')
                    for file in sorted((root / 'masters').glob('*.png'))]
value['prompts'] = [str(file) for file in sorted((root / 'prompts').glob('*.txt'))]
value['generationReceipts'] = [str(file) for file in sorted(root.glob('generation-results-*.json'))]
ledger.write_text(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(masters=len(value['masters']), prompts=len(value['prompts']))))
