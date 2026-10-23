"""Export review-only masters at both densities and embed source comparisons."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import base64
import hashlib
import html
import io
import json
import sys

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / '.artifacts/yuri-cameos'
IDENTITIES = [('initicon', 'INIT / Initiate'), ('ltnkicon', 'LTNK / Lasher Tank'),
              ('ypwricon', 'YAPOWR / Bio Reactor'), ('muteicon', 'Genetic Mutator power')]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_once(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError(f'Immutable output differs: {path}')
        return
    with path.open('xb') as target:
        target.write(data)


def png(image):
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    return buffer.getvalue()


def embedded(image_path, label, scale_class='cameo'):
    encoded = base64.b64encode(image_path.read_bytes()).decode()
    return (f'<figure><figcaption>{html.escape(label)}</figcaption><img class="{scale_class}" '
            f'alt="{html.escape(label)}" src="data:image/png;base64,{encoded}"></figure>')


def main():
    source, revision = Path(sys.argv[1]).resolve(), sys.argv[2]
    replacement = Path(sys.argv[3]).resolve() if len(sys.argv) > 3 else None
    previous_revision = sys.argv[4] if len(sys.argv) > 4 else 'representative-v3'
    if any(not value.startswith('representative-') or not all(c.isalnum() or c == '-' for c in value)
           for value in [revision, previous_revision]):
        raise ValueError('Use a task-specific representative revision')
    output = ART / revision
    board = Image.open(source).convert('RGBA')
    if board.width % 2 or board.height % 2:
        raise ValueError('Representative grid must have an exact integer middle split')
    width, height = board.width // 2, board.height // 2
    if width < 240 or height < 192 or abs(width / height - 1.25) > .004:
        raise ValueError('Each master must have genuine detail above 4x and preserve the cameo aspect ratio')
    inventory = json.loads((ART / 'inventory-v4/inventory.json').read_text())
    acceptance_path = ART / 'representative-acceptance-v1.json'
    acceptance = json.loads(acceptance_path.read_text()) if acceptance_path.exists() else {}
    approved = {item['identity']: item for item in acceptance.get('approved', [])}
    entries, resources, masters = [], [], []
    for index, (name, title) in enumerate(IDENTITIES):
        native = next(e for e in inventory['entries'] if e['member'] == name + '.shp')
        assert native['nativeSize'] == [60, 48]
        x, y = index % 2 * width, index // 2 * height
        replaced = replacement is not None and name == 'ypwricon'
        master_source = replacement if replaced else source
        if replaced:
            master = Image.open(replacement).convert('RGBA')
        else:
            master = board.crop((x, y, x + width, y + height))
        if master.width < 240 or master.height < 192 or abs(master.width / master.height - 1.25) > .004:
            raise ValueError(f'Master density or aspect ratio differs: {name}')
        assert master.getchannel('A').getextrema() == (255, 255)
        master_path = output / 'masters' / (name + '.png')
        master_data = png(master)
        if name + '.shp' in approved:
            assert digest(master_data) == approved[name + '.shp']['masterSha256']
        write_once(master_path, master_data)
        masters.append(dict(identity=name + '.shp', title=title, file=str(master_path.relative_to(ROOT)),
                            sha256=digest(master_data), size=list(master.size),
                            crop=[0, 0, master.width, master.height] if replaced else [x, y, width, height],
                            status='USER_DIRECTION_APPROVED' if name + '.shp' in approved else 'USER_VISUAL_REVIEW_PENDING',
                            source=str(master_source.relative_to(ROOT)), sourceSha256=digest(master_source.read_bytes())))
        for density in [2, 4]:
            data = png(master.resize((60 * density, 48 * density), Image.Resampling.LANCZOS))
            if name + '.shp' in approved:
                pin = next(item for item in approved[name + '.shp']['exports'] if item['density'] == density)
                assert digest(data) == pin['sha256']
            destination = output / f'{density}x' / (name + '.png')
            write_once(destination, data)
            resources.append(dict(identity=name + '.shp', file=str(destination.relative_to(ROOT)),
                                  sha256=digest(data), bytes=len(data), density=density,
                                  size=[60 * density, 48 * density], ignored=True,
                                  masterSha256=digest(master_data), currentRoot=str(ROOT),
                                  status='UNSELECTED_REVIEW_EXPORT'))
            if density == 4:
                entries.append(dict(id=name + '.shp', file=name + '.png', sha256=digest(data),
                                    width=240, height=192, logicalWidth=60, logicalHeight=48))
    receipt = dict(schemaVersion=1, taskId='E', status='REPRESENTATIVE_REVIEW_PENDING',
                   generation='built-in imagegen', accepted=False, runtimeSelected=False,
                   sourceBoard=str(source.relative_to(ROOT)), sourceSha256=digest(source.read_bytes()),
                   replacementMaster=str(replacement.relative_to(ROOT)) if replacement else None,
                   previousReviewRevision=previous_revision if replacement else None,
                   approvedDirections=list(approved), pendingDirections=[name + '.shp' for name, _ in IDENTITIES if name + '.shp' not in approved],
                   masters=masters, resources=resources, fragment=entries,
                   selectedRuntimeDensity=4, companion2x='EXPORT_VALIDATED_RUNTIME_NOT_RUN',
                   uiBudgetBytes=16 * 1024 * 1024, fourCandidateTextureBytes=4 * 240 * 192 * 4,
                   memoryEvidence='Exact candidate allocation only; total HUD residency not yet measured.',
                   integrationStatus='NOT_MERGED')
    write_once(output / 'receipt.json', (json.dumps(receipt, indent=2) + '\n').encode())
    parts = ['''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Task E Yuri cameo representative review</title><style>
:root{--scale:1;color-scheme:dark;font:18px Arial,sans-serif;background:#22262a;color:#eee}
body{margin:28px;max-width:1200px}h1{font-size:30px}h2{font-size:24px}
p{max-width:1000px;line-height:1.5}.row{display:flex;flex-wrap:wrap;gap:24px;margin:16px 0 28px}
figure{margin:0;min-width:180px}figcaption{font-size:16px;margin:8px 0}
.cameo{display:block;width:calc(60px * var(--scale));height:calc(48px * var(--scale));object-fit:fill}
.detail{width:240px;height:192px;display:block}button{font:inherit;padding:8px 14px;margin:4px}
.original{image-rendering:pixelated}.notice{border-left:4px solid #dda84c;padding:10px 18px}
</style><h1>Task E: faithful Yuri cameo restoration</h1>
<p class="notice">Representative direction review only. No new runtime selection, gameplay binding, full-batch completion,
user acceptance or combined-build pass is claimed. The original label pixels are retained in source comparisons;
new artwork has no text. Game names, ranks, queues and progress remain separate live UI layers.</p>
<p>The corrected direction follows the user's original-image requirements: sunlight rather than psychic laser;
lower Lasher hull/turret, higher placement and slightly downward camera; three separate Bio Reactor buildings
(one near, two far), with three reaction chambers per building; native power-button composition.</p>
<button onclick="document.documentElement.style.setProperty('--scale',1)">60 x 48 native sidebar size</button>
<button onclick="document.documentElement.style.setProperty('--scale',2)">2x inspection</button>
<button onclick="document.documentElement.style.setProperty('--scale',4)">4x inspection</button>''']
    if replacement:
        parts.append('<p>INIT, LTNK and Genetic Mutator directions are approved; their master and export bytes are unchanged. '
                     'Only YAPOWR is revised: larger gaps between buildings, a lower assembly narrowing symmetrically '
                     'with the upper structure onto a low pedestal matching the middle body width, '
                     'and source-matched pale glass/darker metal. '
                     'The latest correction raises the composition and lengthens the lower pipe-to-pedestal connection. '
                     'The updated YAPOWR remains pending user review.</p>')
    for name, title in IDENTITIES:
        parts.append(f'<h2>{html.escape(title)}</h2><div class="row">')
        parts.append(embedded(ART / 'references-v1' / (name + '.png'), 'Retail source'))
        label = 'Approved HD representative' if name + '.shp' in approved else 'Faithful HD candidate'
        parts.append(embedded(output / '4x' / (name + '.png'), label))
        parts.append(embedded(output / '4x' / (name + '.png'), 'Fixed 4x detail', 'detail'))
        parts.append('</div>')
    parts.append('''<p>Both 120 x 96 and 240 x 192 exports come directly from the same high-resolution master.
The unchanged UI contract selects fixed 4x, independently of world density. The 2x exports are companions only.</p>
<p>Known source issue: localized inituico.shp is byte-identical to ltnkuico.shp. Production must map the Initiate
alternate to the correct Initiate base plus the accepted rank overlay. Missing engnuico.shp remains a disclosed native absence.
Existing accepted CCOMAND/PTROOP aliases are retained.</p>
<p>The parallel sidebar switching fix remains a dependency. Task E does not modify its timing/cache behavior.</p></html>''')
    write_once(output / 'Yuri-Cameos-Representative-Review.html', '\n'.join(parts).encode())
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
    preview = Image.new('RGB', (940, 800), '#22262a')
    draw = ImageDraw.Draw(preview)
    for index, (name, title) in enumerate(IDENTITIES):
        x, y = 24 + index % 2 * 470, 16 + index // 2 * 400
        draw.text((x, y), title, font=font, fill='white')
        draw.text((x, y + 40), 'Original', font=font, fill='#bbbbbb')
        draw.text((x + 225, y + 40), 'HD candidate', font=font, fill='#bbbbbb')
        original = Image.open(ART / 'references-v1' / (name + '.png')).convert('RGB')
        candidate = Image.open(output / '4x' / (name + '.png')).convert('RGB')
        preview.paste(original.resize((210, 168), Image.Resampling.NEAREST), (x, y + 80))
        preview.paste(candidate.resize((210, 168), Image.Resampling.LANCZOS), (x + 225, y + 80))
        draw.text((x, y + 268), '60 x 48 sidebar-size comparison', font=font, fill='#bbbbbb')
        preview.paste(original, (x, y + 310))
        preview.paste(candidate.resize((60, 48), Image.Resampling.LANCZOS), (x + 90, y + 310))
    write_once(output / 'comparison-board.png', png(preview))
    if replacement:
        # Focus the next visual decision on the one pending identity.
        corrected = Image.open(output / '4x/ypwricon.png').convert('RGB')
        previous = Image.open(ART / previous_revision / '4x/ypwricon.png').convert('RGB')
        original = Image.open(ART / 'references-v1/ypwricon.png').convert('RGB')
        comparison = Image.new('RGB', (1090, 460), '#22262a')
        draw = ImageDraw.Draw(comparison)
        draw.text((20, 15), 'YAPOWR: higher placement and longer lower pipe connection', font=font, fill='white')
        for index, (image, label) in enumerate([(original, 'Retail original'), (previous, 'Previous candidate'),
                                                (corrected, 'Corrected candidate')]):
            x = 20 + index * 360
            draw.text((x, 62), label, font=font, fill='#bbbbbb')
            sampling = Image.Resampling.NEAREST if index == 0 else Image.Resampling.LANCZOS
            comparison.paste(image.resize((330, 264), sampling), (x, 104))
            comparison.paste(image.resize((60, 48), sampling), (x, 394))
        write_once(output / 'yapowr-comparison.png', png(comparison))
    print(json.dumps(dict(review=str((output / 'Yuri-Cameos-Representative-Review.html').resolve()),
                         exports=len(resources), masterSize=[width, height], accepted=False)))


if __name__ == '__main__':
    main()
