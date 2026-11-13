"""Admit complete authored VLAD densities, reusing the verified accepted DMISL."""
from pathlib import Path
import copy
import hashlib
import json
import shutil
from PIL import Image

root = Path(__file__).resolve().parents[2]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
accepted = root / '.local/hd-packs/soviet-dred-vxl/owner-r3'
assert sha(accepted / 'manifest.json') == '63b20f0fef66a5bddf8869879ce05a50dc9f927554e24964fc55080480535157'
original = json.loads((accepted / 'manifest.json').read_text())
inventory = json.loads((root / '.artifacts/m3-2/vlad/inventory.json').read_text())
missile = next(p for p in original['parts'] if p['actor'] == 'DMISL')
variants = []
for density in [2, 4]:
    directory = root / f'.local/hd-packs/campaign-sov02-vlad-vxl/loaded-empty-r2-{density}x'
    filename = directory / 'manifest.json'
    manifest = json.loads(filename.read_text())
    assert manifest['density'] == density and manifest['identity'] == 'VLAD'
    assert {p['member'] for p in manifest['parts']} == {'vlad.vxl', 'vladwo.vxl'}, 'Use a fresh body export'
    part = copy.deepcopy(missile)
    for member in ['dmisl.vxl', 'dmisl.hva']:
        assert inventory['assets'][member]['sha256'] == original['sources'][member]
        manifest['sources'][member] = original['sources'][member]
    for role, resource in part['files'].items():
        source = accepted / resource['file']
        assert sha(source) == resource['sha256']
        target = directory / resource['file']
        if density == 4:
            shutil.copyfile(source, target)
        else:
            image = Image.open(source).convert('RGBA')
            canvas = Image.new('RGBA', image.size if density == 4 else tuple(v // 2 for v in image.size), (0, 0, 0, 255) if role == 'data' else 0)
            for frame in part['frames']:
                x, y, width, height = frame['rect']
                rectangle = [round(v * .5) for v in [x, y, width, height]]
                crop = image.crop((x, y, x + width, y + height))
                if role == 'base':
                    crop = crop.convert('RGBa').resize(tuple(rectangle[2:]), Image.Resampling.LANCZOS).convert('RGBA')
                else:
                    crop = crop.resize(tuple(rectangle[2:]), Image.Resampling.NEAREST)
                canvas.paste(crop, tuple(rectangle[:2]))
            canvas.save(target)
        resource.update(sha256=sha(target), bytes=target.stat().st_size)
    if density == 2:
        part['pageSize'] = [v // 2 for v in part['pageSize']]
        for frame in part['frames']:
            frame['rect'] = [round(v * .5) for v in frame['rect']]
    part['provenance'] = dict(method='Verified accepted DMISL family reuse; independent density file export',
        manifestSha256=sha(accepted / 'manifest.json'), sourcePart=missile['key'])
    manifest['parts'].append(part)
    manifest['acceptance'] = 'REPRESENTATIVE_ACCEPTED_FULL_FAMILY_REVIEW_PENDING'
    manifest['sourcePalette'] = inventory['assets']['unittem.pal']['sha256']
    manifest['sourceVpl'] = inventory['assets']['voxels.vpl']['sha256']
    filename.write_text(json.dumps(manifest, indent=2) + '\n')
    variants.append(dict(hash=sha(filename), density=density, path=str(filename.relative_to(root / '.local'))))
contract_path = root / 'desktop/environment-hd-contract.json'
contract = json.loads(contract_path.read_text())
assert 'VLAD' not in contract['vxl'], 'Do not replace an admitted resource'
contract['vxl']['VLAD'] = dict(**{k: v for k, v in variants[1].items() if k != 'density'},
    members=['vlad.vxl', 'vladwo.vxl', 'dmisl.vxl'], variants=variants, theaters=['TEMPERATE'])
contract_path.write_text(json.dumps(contract, indent=2) + '\n')
receipt = dict(identity='VLAD', states=['loaded', 'empty'], headings=list(range(0, 360, 45)), variants=variants,
    acceptance=manifest['acceptance'], reusedChild='DMISL', source=inventory['assets'],
    budgetPolicy='Existing complete-family fallback and memory budgets; no budget increase')
(root / 'docs/m3-2-vlad-resources.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt['variants']))
