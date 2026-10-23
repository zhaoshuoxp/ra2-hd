"""Export reviewed neutral VXL families at independent authored densities."""
import hashlib
import json
import subprocess
from pathlib import Path

base = Path('.artifacts/m2-2')
work_file = base / 'selected-vxl-worklist-v1.json'
work = json.loads(work_file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
records, contracts = [], {}
for board in work['boards']:
    if board['visualQa'] != 'PASS':
        continue
    identity = board['identity']
    variants = []
    for density in [2, 4]:
        revision = f'environment-m2-2-neutral-v1-{density}x'
        output = Path('.local/hd-packs') / f'environment-{identity.lower()}-vxl' / revision
        review = base / 'vxl-export-v1' / f'{identity}-{density}x'
        manifest = output / 'manifest.json'
        if not manifest.exists():
            subprocess.run(['python3', 'scripts/m1/yuri-units/export-vxl.py', identity,
                str(work_file), revision, str(review), '--ownership-references', work['references'],
                '--output', str(output), '--density', str(density), '--inventory',
                str(base / 'authoring-vxl-v2/inventory.json'), '--reference-report', 'report.json'], check=True)
        pack = json.loads(manifest.read_text())
        assert pack['density'] == density and pack['identity'] == identity
        assert pack['parts'][0]['provenance']['sha256'] == board['selectedArtSha256']
        assert pack['parts'][0]['provenance'].get('authoredFrameOverrides', {}) == board.get('authoredFrameOverrides', {})
        variants.append(dict(hash=sha(manifest), density=density,
                             path=str(manifest.relative_to('.local'))))
        records.append(dict(identity=identity, density=density, manifest=str(manifest), sha256=sha(manifest)))
    pack = json.loads(manifest.read_text())
    contracts[identity] = dict(hash=variants[-1]['hash'], path=variants[-1]['path'],
                              members=sorted(n for n in pack['sources'] if n.endswith('.vxl')),
                              variants=variants)
receipt = base / 'vxl-export-v1/receipt.json'
receipt.parent.mkdir(exist_ok=True)
receipt.write_text(json.dumps(dict(schema='m2-2-neutral-vxl-export-v1',
    worklist=str(work_file), worklistSha256=sha(work_file), records=records,
    complete=len(contracts) == 12, boundary='Independent authored exports; native runtime and user acceptance remain required.'), indent=2) + '\n')
if len(contracts) == 12:
    file = Path('desktop/environment-hd-contract.json')
    contract = json.loads(file.read_text())
    contract['vxl'] = contracts
    file.write_text(json.dumps(contract, indent=2) + '\n')
print(json.dumps(dict(exportedIdentities=list(contracts), complete=len(contracts) == 12)))
