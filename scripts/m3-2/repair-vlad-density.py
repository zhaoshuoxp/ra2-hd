"""Correct transparent ownership samples in the independent 2X missile export."""
from pathlib import Path
import hashlib
import json
import shutil
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[2]
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
contract_path = root / 'desktop/environment-hd-contract.json'
contract = json.loads(contract_path.read_text())
old = contract['vxl']['VLAD']
assert [v['hash'] for v in old['variants']] == [
    '0627f27daf821399ffc01c125bfd779860415983a632ec85b4753d761d481258',
    'b8b1a01a4f7fd01823470801dd6794a1b87e0a22decf747216f4cfa865b3a216']
variants, repairs = [], []
for variant in old['variants']:
    source = root / '.local' / variant['path']
    assert sha(source) == variant['hash']
    destination = source.parent.with_name(source.parent.name.replace('r2-', 'r3-'))
    assert not destination.exists()
    shutil.copytree(source.parent, destination)
    manifest = json.loads((destination / 'manifest.json').read_text())
    manifest['revision'] = 'loaded-empty-r3'
    for part in manifest['parts']:
        base = np.array(Image.open(destination / part['files']['base']['file']).convert('RGBA'))
        entry = part['files']['data']; file = destination / entry['file']
        data = np.array(Image.open(file).convert('RGBA'))
        outside = (base[:, :, 3] == 0) & (data[:, :, 0] != 0)
        if np.any(outside):
            repairs.append(dict(density=variant['density'], member=part['member'], invisibleSamples=int(np.count_nonzero(outside))))
            data[outside, 0] = 0
            Image.fromarray(data).save(file)
            entry.update(sha256=sha(file), bytes=file.stat().st_size)
        assert not np.any((base[:, :, 3] == 0) & (data[:, :, 0] != 0))
    file = destination / 'manifest.json'
    file.write_text(json.dumps(manifest, indent=2) + '\n')
    variants.append(dict(hash=sha(file), density=variant['density'], path=str(file.relative_to(root / '.local'))))
assert repairs == [dict(density=2, member='dmisl.vxl', invisibleSamples=77)]
old.update(hash=variants[1]['hash'], path=variants[1]['path'], variants=variants)
contract_path.write_text(json.dumps(contract, indent=2) + '\n')
receipt = root / 'docs/m3-2-vlad-resources.json'
value = json.loads(receipt.read_text()); value.update(variants=variants, densityRepair=repairs)
receipt.write_text(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(variants=variants, repairs=repairs)))
