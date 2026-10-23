"""Show all eight native projections and actual independently authored density frames."""
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

root = Path('.artifacts/m2-4/urban-actors-voxel-authoring-batch62-v2')
out = Path('.artifacts/m2-4/urban-vehicle-comparisons-batch62-v1')
out.mkdir()
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
work = read(root / 'selected-worklist-v1.json')
contract = read(root / 'vxl-contract-v1.json')['vxl']
outputs = []
for board in work['boards']:
    for selection in contract[board['identity']]['variants']:
        density = selection['density']
        file = Path('.local') / selection['path']
        assert sha(file) == selection['hash']
        manifest = read(file)
        part, = manifest['parts']
        declared = part['files']['base']
        assert sha(file.parent / declared['file']) == declared['sha256']
        atlas = Image.open(file.parent / declared['file']).convert('RGBA')
        panel = max(240, max(f['rect'][2] for f in part['frames']))
        height = max(f['rect'][3] for f in part['frames']) + 70
        image = Image.new('RGB', (panel * 2, height * 8), (72, 88, 78))
        draw = ImageDraw.Draw(image)
        for index, (frame, native) in enumerate(zip(part['frames'], board['frames'], strict=True)):
            assert frame['heading'] == native['heading']
            x, y, width, h = frame['rect']
            original = Image.open(Path(work['references']) / native['source']).convert('RGB')
            original = original.crop(native['sourceBounds']).resize((width, h), Image.Resampling.NEAREST)
            authored = atlas.crop((x, y, x + width, y + h))
            top, left = index * height, (panel - width) // 2
            draw.text((8, top + 5), f'{board["identity"]} / heading {frame["heading"]}', fill='white', font_size=22)
            draw.text((8, top + 32), f'Native reference {density}X', fill='white', font_size=22)
            draw.text((panel + 8, top + 32), f'HD {density}X', fill='white', font_size=22)
            image.paste(original, (left, top + 64))
            image.paste(authored, (panel + left, top + 64), authored)
        target = out / f'{board["identity"]}-{density}x.png'
        image.save(target)
        outputs.append(dict(identity=board['identity'], density=density, file=str(target.resolve()),
            sha256=sha(target), size=list(image.size), headings=8, metadataSha256=selection['hash'],
            policy='Native projected reference uses nearest pixels only as a control. HD is the actual independently sampled atlas at its registered density. These are static resource comparisons; separate live captures establish runtime display and movement.'))
(out / 'index.json').write_text(json.dumps(dict(status='PASS_48_HEADINGS_BOTH_DENSITY_COMPARISONS', outputs=outputs), indent=2) + '\n')
print(json.dumps(dict(boards=len(outputs), densityBearings=96)))
