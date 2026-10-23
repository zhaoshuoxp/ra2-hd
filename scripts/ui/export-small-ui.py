"""Conservative density exports for retail command glyphs, flags and small PCX UI."""
from pathlib import Path
from PIL import Image
import base64
import hashlib
import io
import json

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / '.artifacts/menu-ui/ui-originals'
OUT = ROOT / '.artifacts/menu-ui/remaining-v1/small-ui-v1'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    inventory = json.loads((SOURCE / 'inventory.json').read_text())
    yuri = {entry['key']: entry for entry in json.loads((SOURCE / 'inventory-yuri.json').read_text())}
    entries, ledger, rows = [], [], []
    for source in inventory:
        command = source['key'].startswith(('allied-button', 'soviet-button'))
        pcx = source['member'].endswith('.pcx')
        clock = source['member'] == 'gclock2.shp'
        menu_button = source['key'] == 'menu-mnbttn'
        if not command and not pcx and not clock and not menu_button:
            continue
        width, height = source['width'], source['height']
        frames = source['framesData']
        atlas = Image.new('RGBA', (width * len(frames) * 4, height * 4))
        for index, frame in enumerate(frames):
            original = Image.open(SOURCE / frame['file'].replace('.rgba', '.png')).convert('RGBA')
            assert original.size == (width, height)
            restored = original.resize((width * 4, height * 4), Image.Resampling.LANCZOS)
            atlas.paste(restored, (index * width * 4, 0))
            if clock:
                # Separate frames keep the 55-state progress family within budget.
                # Only visible states are decoded, with shared leases per frame.
                file = f'{source["key"]}-{index}.png'
                restored.save(OUT / file)
                entries.append(dict(id=file[:-4], file=file, width=width * 4, height=height * 4,
                                    logicalWidth=width, logicalHeight=height,
                                    sha256=hashlib.sha256((OUT / file).read_bytes()).hexdigest()))
                ledger.append(dict(id=file[:-4], sourceSha256=source['sha256'], frame=index,
                                   method='LANCZOS_4X_SOURCE_RESAMPLE_NO_INVENTED_DETAIL'))
                if source['key'].startswith('soviet-'):
                    key = source['key'].replace('soviet-', 'yuri-')
                    assert yuri[key]['sha256'] == source['sha256']
                    assert yuri[key]['paletteSha256'] == source['paletteSha256']
                    entries.append({**entries[-1], 'id': f'{key}-{index}'})
                    ledger.append(dict(id=f'{key}-{index}', sharedWith=file[:-4],
                                       status='DORMANT_YURI_UI_ALIAS'))
            figures = []
            for image, caption in [(original, 'Retail'), (restored, '4x source resample')]:
                buffer = io.BytesIO(); image.save(buffer, format='PNG')
                data = base64.b64encode(buffer.getvalue()).decode()
                figures.append(f'<figure><figcaption>{caption}</figcaption><img style="width:calc({width}px * var(--scale))" src="data:image/png;base64,{data}"></figure>')
            rows.append(f'<section><h2>{source["key"]} / frame {index}</h2><div class="row">' + ''.join(figures) + '</div></section>')
        if clock:
            continue
        file = source['key'] + '.png'
        atlas.save(OUT / file)
        entry = dict(id=source['member'] if pcx else source['key'], file=file,
                     width=atlas.width, height=atlas.height, logicalWidth=width * len(frames), logicalHeight=height,
                     sha256=hashlib.sha256((OUT / file).read_bytes()).hexdigest())
        entries.append(entry)
        ledger.append(dict(id=entry['id'], sourceSha256=source['sha256'], source=source['source'],
                           frames=len(frames), method='LANCZOS_4X_SOURCE_RESAMPLE_NO_INVENTED_DETAIL'))
        if source['key'].startswith('soviet-button'):
            key = source['key'].replace('soviet-', 'yuri-')
            assert yuri[key]['sha256'] == source['sha256']
            assert yuri[key]['paletteSha256'] == source['paletteSha256']
            entries.append({**entry, 'id': key})
            ledger.append(dict(id=key, sharedWith=entry['id'], status='DORMANT_YURI_UI_ALIAS'))
    # Match GameRes.generateIconSprite: each PCX is clipped into a 24px cell.
    icon_names = ['wouref', 'wodref', 'wouact', 'wodact', 'dnarrowr', 'dnarrowp',
                  'uparrowr', 'uparrowp', 'sbgript', 'sbgripm', 'sbgripb', 'trakgrip']
    original = Image.new('RGBA', (24 * len(icon_names), 24))
    for index, name in enumerate(icon_names):
        source = next(entry for entry in inventory if entry['key'] == name)
        file = source['framesData'][0]['file'].replace('.rgba', '.png')
        image = Image.open(SOURCE / file).convert('RGBA')
        original.paste(image.crop((0, 0, min(24, image.width), min(24, image.height))), (index * 24, 0))
    restored = original.resize((original.width * 4, original.height * 4), Image.Resampling.LANCZOS)
    restored.save(OUT / 'icons24.png')
    entries.append(dict(id='icons24.pcx', file='icons24.png', width=restored.width, height=restored.height,
                        logicalWidth=original.width, logicalHeight=original.height,
                        sha256=hashlib.sha256((OUT / 'icons24.png').read_bytes()).hexdigest()))
    ledger.append(dict(id='icons24.pcx', sources=icon_names, method='NATIVE_24PX_CELLS_LANCZOS_4X'))
    figures = []
    for image, caption in [(original, 'Retail composite'), (restored, '4x source resample')]:
        buffer = io.BytesIO(); image.save(buffer, format='PNG')
        data = base64.b64encode(buffer.getvalue()).decode()
        figures.append(f'<figure><figcaption>{caption}</figcaption><img style="width:calc(288px * var(--scale))" src="data:image/png;base64,{data}"></figure>')
    rows.append('<section><h2>Shared scrollbar, select and slider sprite</h2><div class="row">' + ''.join(figures) + '</div></section>')
    (OUT / 'manifest-fragment.json').write_text(json.dumps(entries, indent=2) + '\n')
    parts = ['''<!doctype html><html lang="en"><meta charset="utf-8"><title>Retail small UI density exports</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--scale:2;color-scheme:dark;background:#24262a;color:#eee;font:18px Arial,sans-serif}
body{margin:28px}h1{font-size:30px}h2{font-size:22px}.row{display:flex;gap:30px;flex-wrap:wrap}
figure{margin:0;min-width:220px}figcaption{font-size:16px;margin:8px 0}img{display:block;height:auto}
button{font:inherit;padding:8px 14px}section{margin:28px 0}p{line-height:1.5;max-width:950px}
</style><h1>Retail small UI density exports</h1><p>Conservative 4x resampling of exact retail frames.
This preserves original content and colors; it adds sampling density, not newly authored detail.
Original logical sizes, state counts and timing remain unchanged. Yuri command images share the
Soviet file only where source and palette hashes match. All images are embedded. Review pending.</p>
<button onclick="document.documentElement.style.setProperty('--scale',1)">1x UI size</button>
<button onclick="document.documentElement.style.setProperty('--scale',2)">2x inspection</button>
<button onclick="document.documentElement.style.setProperty('--scale',4)">4x detail</button>''']
    (OUT / 'review.html').write_text('\n'.join(parts + rows + ['</html>']))
    receipt = dict(status='DENSITY_EXPORT_REVIEW_PENDING', promoted=False, embeddedImages=len(rows) * 2,
                   exportedEntries=len(entries), canonicalFiles=len({e['file'] for e in entries}), assets=ledger)
    (OUT / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({key: value for key, value in receipt.items() if key != 'assets'}))


if __name__ == '__main__':
    main()
