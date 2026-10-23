"""Consolidate accepted UI artwork, native evidence and exact coverage limitations."""
from pathlib import Path
from PIL import Image
import base64
import hashlib
import html
import io
import json

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / '.artifacts/menu-ui'
PACK = ROOT / '.local/ui-packs/remaining-ui-v4'
RUNTIME = ART / 'runtime-selected-v1'
OUT = ART / 'delivery-v1'


def main():
    runtime = json.loads((RUNTIME / 'result.json').read_text())
    assert runtime['status'] == 'PASS_BOUNDED_NATIVE_RUNTIME'
    display = json.loads((ART / 'display-selected-v1/result.json').read_text())
    assert display['status'] == 'PASS_NATIVE_FULLSCREEN_AND_HD_PERSISTENCE'
    acceptance = json.loads((ART / 'final-integration-v1/art-acceptance.json').read_text())
    assert acceptance['status'] == 'ART_ACCEPTED'
    manifest = json.loads((PACK / 'manifest.json').read_text())
    assets = {entry['id']: entry for entry in manifest['assets']}
    OUT.mkdir(exist_ok=True)
    count = 0

    def picture(source, label, width=None):
        nonlocal count
        count += 1
        if isinstance(source, Image.Image):
            buffer = io.BytesIO()
            source.save(buffer, format='PNG')
            data = buffer.getvalue()
        else:
            data = source.read_bytes()
        size = f'width:calc({width}px * var(--scale))' if width else 'width:min(100%,1200px)'
        return (f'<figure><figcaption>{html.escape(label)}</figcaption><img alt="{html.escape(label)}" '
                f'style="{size};height:auto" src="data:image/png;base64,{base64.b64encode(data).decode()}"></figure>')

    parts = ['''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Accepted menu and UI delivery</title>
<style>:root{--scale:2;color-scheme:dark;background:#24262a;color:#eee;font:18px Arial,sans-serif}
body{margin:28px}h1{font-size:32px}h2{font-size:26px}h3{font-size:21px}p{line-height:1.5;max-width:1100px}
.row{display:flex;gap:28px;flex-wrap:wrap}figure{margin:15px 0}figcaption{font-size:16px;margin:8px 0}
img{display:block;max-width:none}button{font:inherit;padding:8px 14px}section{margin:28px 0}
td,th{padding:10px;text-align:left;border-bottom:1px solid #666}a{color:#abd7ff}summary{cursor:pointer;padding:12px 0}
</style><h1>Accepted menu and UI delivery</h1>
<p>Artwork accepted and selected through ordinary desktop resource registration. No review-only fetch injection.
The single HD setting controls UI and existing world artwork; logical geometry remains unchanged.</p>
<button onclick="document.documentElement.style.setProperty('--scale',1)">1x UI size</button>
<button onclick="document.documentElement.style.setProperty('--scale',2)">2x inspection</button>
<button onclick="document.documentElement.style.setProperty('--scale',4)">4x detail</button>
<p>All displayed images are embedded. The controls affect asset previews; screenshots fit the page.
Physical MacBook input/panel output is unverified; Windows was not run. Yuri UI uses a detached native fixture and remains dormant.</p>''']
    groups = [
        ('Main menu', 'Six localized routes; original animation and 17 button states', 'Accepted; native routes checked'),
        ('Loading', 'Nine original country specialty-unit regions; wide and MacBook-shaped layouts', 'Accepted; native staged loading checked'),
        ('Faction HUD', '31 panel/control families, 33 radar frames and 55 progress frames per skin', '471 native states checked; Yuri dormant'),
        ('Cameos', '92 canonical images + 30 shared rank aliases = 122 IDs', 'Accepted; all IDs loaded in native fixtures'),
        ('Small raster UI', '231 entries / 166 files, including command/clock members above', 'Accepted; source-derived 4x density, no invented detail'),
        ('Fonts and geometry', 'Original name style; lighter yellow status/queue text', 'Logical size, vertex and HD Off checks passed'),
        ('Source exceptions', 'Six retained Original sources; three absent retail references', 'Explicit exceptions; not generated'),
        ('Expansion units', 'Yuri expansion-only cameo roster', 'Not authored; no playable Yuri faction'),
    ]
    parts.append('<h2>Completeness</h2><table><tr><th>Group</th><th>Coverage</th><th>Status</th></tr>')
    for row in groups:
        parts.append('<tr>' + ''.join(f'<td>{html.escape(value)}</td>' for value in row) + '</tr>')
    parts.append('</table><p><a href="small-ui/review.html">Accepted small UI frame comparisons</a></p>')
    parts.append('<h2>Native menu, loading and HUD</h2>')
    for file, label in [
        ('menu-1080p.png', 'Original animated menu and mechanical buttons — 1080p'),
        ('menu-4k.png', 'Same menu — 4K output'),
        ('skirmish-5.png', 'Native Soviet skirmish setup, flags and controls'),
        ('loading-1080p.png', 'Native loading — 1080p'),
        ('loading-4k.png', 'Native loading — 4K'),
        ('loading-aspect-1512x982.png', 'MacBook-shaped loading viewport — emulated'),
        ('sidebar-fixture-1080p.png', 'Same-view mixed-cameo native fixture — 1080p'),
        ('sidebar-fixture-4k.png', 'Same-view mixed-cameo native fixture — 4K'),
        ('allied-second-match.png', 'Second match with Allied HUD'),
    ]:
        parts.append(picture(RUNTIME / file, label))
    parts.append('<details><summary>All nine country loading regions in the native component</summary>')
    for country in ['ustates', 'france', 'germany', 'ukingdom', 'russia', 'cuba', 'libya', 'iraq', 'korea']:
        parts.append(picture(RUNTIME / f'country-{country}-4k.png', country))
    parts.append('</details><h2>Final radar frames</h2><div class="row">')
    for faction in ['allied', 'soviet', 'yuri']:
        parts.append(picture(RUNTIME / f'{faction}-radar-32.png', faction + ' — frame 32', 168))
    parts.append('</div><h2>Accepted sidebar roster</h2><p>Original / selected HD / shared rank variant where present. '
                 'Generated captions are removed; localized names remain live in the game.</p>')
    rank = Image.open(PACK / 'cameo-rank.png').convert('RGBA')
    canonical = sorted(entry for entry in assets if entry.endswith('.shp') and not assets[entry].get('overlay'))
    assert len(canonical) == 92
    for id in canonical:
        entry = assets[id]
        source = ART / 'remaining-v1/sources' / id.replace('.shp', '.png')
        image = Image.open(PACK / entry['file']).convert('RGBA')
        parts.append(f'<section><h3>{id} — Accepted</h3><div class="row">')
        parts.append(picture(source, 'Retail original', 60))
        parts.append(picture(image, 'Accepted HD', 60))
        alternate = next((a for a in assets.values() if a.get('overlay') and a['file'] == entry['file']), None)
        if alternate:
            parts.append(picture(Image.alpha_composite(image, rank), alternate['id'] + ' — shared base', 60))
        parts.append('</div></section>')
    exceptions = json.loads((ART / 'remaining-v1/source-exceptions.json').read_text())
    parts.append('<h2>Retained source exceptions</h2>')
    for id, entry in exceptions.items():
        parts.append(f'<p><strong>{id}</strong>: {html.escape(entry["reason"])}</p>')
    parts.append('<p>Absent retail references: engnuico.shp, falcuico.shp, psybicon.shp. Ordinary Engineer and Harrier icons are covered.</p></html>')
    (OUT / 'review.html').write_text('\n'.join(parts))
    receipt = dict(status='ART_ACCEPTED_NATIVE_INTEGRATION_PASS', embeddedImages=count, pack=PACK.name,
                   manifestSha256=hashlib.sha256((PACK / 'manifest.json').read_bytes()).hexdigest(),
                   acceptedCanonical=92, rankAliases=30, entries=len(assets), groups=groups,
                   runtime=str(RUNTIME / 'result.json'), platformLimits=runtime['environment'])
    (OUT / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    small = OUT / 'small-ui'
    small.mkdir(exist_ok=True)
    original = ART / 'remaining-v1/small-ui-v1'
    page = (original / 'review.html').read_text().replace('All images are embedded. Review pending.', 'All images are embedded. Artwork accepted.')
    (small / 'review.html').write_text(page)
    small_receipt = json.loads((original / 'receipt.json').read_text())
    small_receipt.update(status='ART_ACCEPTED', promoted=True, pack=PACK.name)
    (small / 'receipt.json').write_text(json.dumps(small_receipt, indent=2) + '\n')
    print(json.dumps({k: v for k, v in receipt.items() if k != 'groups'}))


if __name__ == '__main__':
    main()
