"""Build one offline embedded review for the bounded post-acceptance correction."""
import argparse
import base64
import html
import json
import io
from functools import lru_cache
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('native', type=Path)
parser.add_argument('destination', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
report_file = args.native / 'report-compact.json'
report = json.loads((report_file if report_file.exists() else args.native / 'report.json').read_text())
assert report['status'] == 'PASS_NATIVE_CATALOG_LANGUAGES_NAMES_TOOLTIPS_RESULTS'
assert len(report['cases']) == 6 and not report['errors']
args.destination.mkdir(parents=True, exist_ok=False)

def load(path):
    return json.loads(path.read_text())

@lru_cache(maxsize=128)
def embed(path):
    data, kind = path.read_bytes(), 'png'
    if path.parent == args.native and Image.open(path).width > 900:
        buffer = io.BytesIO()
        Image.open(path).convert('RGB').save(buffer, format='WEBP', quality=95, method=4)
        data, kind = buffer.getvalue(), 'webp'
    return f'data:image/{kind};base64,' + base64.b64encode(data).decode()

def image(path, label, width=1280):
    return f'<figure><figcaption>{html.escape(label)}</figcaption><div class="image-scroll"><img src="{embed(path)}" alt="{html.escape(label)}" style="--native-width:{width}px"></div></figure>'

sections = []
context_sections = []
crop_directory = args.destination / 'Focus-Crops'
crop_directory.mkdir()
for row in report['cases']:
    edition, language = row['edition'], row['language']
    prefix = f'{edition}-{language}'
    outcome = 'Victory' if row['victory'] else 'Defeat'
    capture = Image.open(args.native / f'{prefix}-result.png')
    rect = row['result']['rect']
    ratio = capture.width / 1280
    crop = capture.crop((round(rect['left'] * ratio), round(rect['top'] * ratio),
                         round(rect['right'] * ratio), round(rect['bottom'] * ratio)))
    crop_path = crop_directory / f'{prefix}-result-native.png'
    crop.save(crop_path)
    parts = [f'<article data-language="{language}"><h2>{edition.upper()} / {language} / {outcome}</h2>',
        f'<p>{html.escape(row["map"])} · {row["density"]}X world · {row["catalog"]["count"]} original maps · native name: {html.escape(row["initial"]["name"])}</p>',
        image(crop_path, 'Lossless native result crop; actual victory/defeat detection', round(rect['width'])),
        '<div class="tooltip-grid">']
    for kind in ['factory', 'mcv']:
        value = row[f'{kind}Hover'] if kind == 'factory' else row['unitHover']
        parts.append(image(args.native / f'{prefix}-{kind}-texture.png',
            f'{kind}: {value["text"]} · {value["rasterScale"]}X glyph raster; logical {value["logicalWidth"]}×{value["logicalHeight"]}', value['logicalWidth']))
    parts += [f'</div><p><a href="Native-Context-Embedded.html#case-{prefix}">Full native map order, player name, hover and result captures</a></p></article>']
    sections.append(''.join(parts))
    context_parts = [f'<article id="case-{prefix}" data-language="{language}"><h2>{edition.upper()} / {language}</h2>']
    for kind, caption in [('result', 'Native result in full game context'), ('maps', 'Original catalog order'), ('lobby', 'Edited skirmish player name'),
                           ('factory', 'Native delayed building tooltip'), ('mcv', 'Native delayed unit tooltip'), ('score', 'Native results table')]:
        context_parts.append(image(args.native / f'{prefix}-{kind}.png', caption))
    fallback = args.native / f'{prefix}-result-fallback.png'
    if fallback.exists():
        context_parts.append(image(fallback, 'Localized complete-family fallback: ' + row['fallback']['state']))
    context_parts.append('</article>')
    context_sections.append(''.join(context_parts))

ui = {language: {key.lower(): value for key, value in load(root / f'public/res/locale/{language}.json').items()}
      for language in ['zh-CN', 'zh-TW', 'en-US']}
retail = {language: load(root / f'public/res/locale/retail-yr-{language}.json')['labels'] for language in ui}
banner_images = {outcome: embed(root / f'public/res/ui/result-{outcome}-hd-v1-4x.png') for outcome in ['victory', 'defeat']}
previews = []
for language in ui:
    for index, key in enumerate(['hd:missionaccomplished', 'hd:missionfailed', 'txt_victorious', 'txt_lost']):
        text = ui[language].get(key, retail[language].get(key))
        victory = index % 2 == 0
        purpose = 'Campaign standby' if index < 2 else 'Skirmish'
        outcome = 'victory' if victory else 'defeat'
        previews.append(f'<div class="preview" data-language="{language}"><p>Slot {index} · {purpose} · {language}</p>'
            f'<div class="banner" data-outcome="{outcome}">'
            '<svg viewBox="0 0 436 112" aria-label="' + html.escape(text) + '">'
            '<defs><linearGradient id="gold-' + language + str(index) + '" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#fff4a0"/><stop offset=".4" stop-color="#ffe32b"/><stop offset="1" stop-color="#e5aa00"/></linearGradient></defs>'
            f'<text x="218" y="{48 if victory else 94}" text-anchor="middle" fill="url(#gold-{language}{index})" stroke="#2b1b00" stroke-width="1" paint-order="stroke"'
            f' font-family="Arial, PingFang SC, PingFang TC, sans-serif" font-size="{34 if language == "en-US" else 46}" font-weight="600" style="filter:drop-shadow(1px 2px 1px #000)">{html.escape(text)}</text></svg></div></div>')

catalog = load(root / 'docs/m2-4-original-map-lists-20261021.json')
tables = []
hidden = []
for record in catalog['records']:
    edition = record['edition']
    localized = {language: {**load(root / f'public/res/locale/retail-{edition}-{language}.json')['labels'], **ui[language]} for language in ui}
    rows = []
    for row in record['originalOrder']:
        titles = '<br>'.join(f'{language}: {html.escape(localized[language][row["uiName"].lower()])}' for language in ui)
        rows.append(f'<tr><td>{row["order"] + 1}</td><td>{html.escape(row["filename"])}</td><td>{titles}</td><td>{html.escape(", ".join(row["originalModes"]))}</td><td>Standard</td></tr>')
    tables.append(f'<h3>{edition.upper()} — {record["visible"]} visible original entries</h3><table><thead><tr><th>PKT order</th><th>Source name</th><th>Localized title</th><th>Original mode tags</th><th>Actual mode</th></tr></thead><tbody>{"".join(rows)}</tbody></table>')
    for row in record['hiddenArchiveEntries']:
        hidden.append(f'<tr><td>{edition.upper()}</td><td>{html.escape(row["mapId"])}</td><td>{html.escape(row["source"]["sha256"])}</td><td>Archive-only; source preserved</td></tr>')

page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M2.4 Map and Language Corrections</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#11171d;color:#e7eef4;font:18px/1.5 system-ui,sans-serif}main{max-width:1480px;margin:auto;padding:28px}h1{font-size:34px}h2{font-size:27px}h3{font-size:22px}p{max-width:1100px}button,select{font:inherit;padding:6px 12px;color:inherit;background:#273744;border:1px solid #72828e;border-radius:4px}nav{position:sticky;top:0;z-index:10;background:#111e;backdrop-filter:blur(6px);padding:12px;display:flex;gap:18px;flex-wrap:wrap}.summary,article,details{border:1px solid #3d4d5a;border-radius:8px;padding:18px;margin:18px 0}.badge{padding:4px 10px;background:#154d3c;color:#c8ffe4;border-radius:4px;display:inline-block}.pending{background:#65491c;color:#fff0c9}figure{margin:18px 0;padding:12px;background:#0b1015;border:1px solid #33434f;border-radius:6px}figcaption{margin-bottom:10px;color:#c5d9e8}.image-scroll{overflow:auto}.image-scroll img{width:min(100%,var(--native-width));height:auto;display:block}body.native .image-scroll img{width:var(--native-width);max-width:none}.tooltip-grid{display:flex;gap:18px;align-items:start;flex-wrap:wrap}.previews{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:14px}.banner{position:relative;width:436px;height:112px;max-width:100%}.banner img,.banner svg{position:absolute;inset:0;width:100%;height:100%}.preview p{margin:6px 0}table{border-collapse:collapse;width:100%;font-size:15px;overflow-wrap:anywhere}td,th{padding:9px;border:1px solid #394b58;text-align:left}th{background:#25343f}summary{cursor:pointer;font-weight:600}a{color:#8dcfff}.note{color:#bdcbd6}[hidden]{display:none!important}@media(max-width:700px){main{padding:12px}.previews{display:block}.preview{margin:18px 0}h1{font-size:28px}}
</style><main><h1>M2.4 — Original Maps and Three-Language HD Presentation</h1>
<div class="summary"><span class="badge">Mac technical checks passed</span> <span class="badge pending">New banners and hover text: visual review pending</span><p>RA2: 62 original maps. YR: 151. All 92 archive-only extras are retained and hidden. The previous theater, faction and UI artwork stays accepted; only the new text/banner presentation needs this review.</p><p>Native human names, three language controls, original map order, hover delay/text, actual win/loss detection, complete-family fallback and resource release were checked in the independent app. Campaign slots 0/1 are packaged standby. Windows has not been tested.</p></div>
<nav><label>Language <select id="language"><option value="all">All languages</option><option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="en-US">English</option></select></label><label><input type="checkbox" id="native"> Native display size</label><a href="#banners">Four banner slots</a><a href="#native-captures">Native captures</a><a href="#maps">Original map lists</a></nav>
<section id="banners"><h2>Four preserved text slots</h2><p class="note">These previews show the exact exported backgrounds and live vector text. Native skirmish captures follow below. Campaign standby does not claim campaign execution. Source frames remain unchanged.</p><div class="previews">PREVIEWS</div><details><summary>Original four frames — source reference</summary>ORIGINAL</details></section>
<section id="native-captures"><h2>Actual Mac game captures</h2><p class="note">Default images fit the page. Native display size uses 1280 logical pixels for each full capture. Tooltip samples use their original logical dimensions; the files contain real high-density glyphs.</p>CAPTURES</section>
<details id="maps"><summary>Complete original RA2 / YR publication order and localized names</summary>TABLES</details>
<details><summary>92 retained archive-only entries — hidden from skirmish selection</summary><p>The three missing-height sources and blank unknown-filename entry remain diagnosed here. No source data was fabricated or deleted.</p><table><thead><tr><th>Edition</th><th>Source identity</th><th>SHA-256</th><th>Menu decision</th></tr></thead><tbody>HIDDEN</tbody></table></details>
<p class="note">Runtime: RUNTIME. Language changes during a match apply on return to Home. Current match state continues. Cleanup of obsolete intermediates/branches follows correction acceptance.</p>
</main><script>document.getElementById('language').addEventListener('change',e=>document.querySelectorAll('[data-language]').forEach(n=>n.hidden=e.target.value!=='all'&&n.dataset.language!==e.target.value));document.getElementById('native').addEventListener('change',e=>document.body.classList.toggle('native',e.target.checked));</script></html>'''
page = page.replace('PREVIEWS', ''.join(previews)).replace('ORIGINAL', image(root / '.local/source-art/m2-4-result-banners-v1/original-reference.png', 'Original campaign frames 0/1; skirmish frames 2/3', 436))
context_page = page.replace('CAPTURES', ''.join(context_sections))
page = page.replace('CAPTURES', ''.join(sections))
page = page.replace('TABLES', ''.join(tables)).replace('HIDDEN', ''.join(hidden))
context_page = context_page.replace('TABLES', ''.join(tables)).replace('HIDDEN', ''.join(hidden))
page = page.replace('RUNTIME', html.escape(artifact_head := report['artifact'].get('runtimeSourceHead', 'development build')))
page = page.replace('</style>', ''.join(f'.banner[data-outcome={outcome}]{{background-image:url("{data}");background-size:100% 100%}}'
                                      for outcome, data in banner_images.items()) + '</style>')
page = page.replace('Default images fit the page.', 'Focus crops and tooltip buffers are lossless. Full context captures use WebP at quality 95; the complete raw PNGs are retained with the evidence. Default images fit the page.')
context_page = context_page.replace('RUNTIME', html.escape(artifact_head))
context_page = context_page.replace('</style>', ''.join(f'.banner[data-outcome={outcome}]{{background-image:url("{data}");background-size:100% 100%}}'
                                      for outcome, data in banner_images.items()) + '</style>')
file = args.destination / 'M2.4-Map-Language-Fixes-Embedded.html'
file.write_text(page)
(args.destination / 'Native-Context-Embedded.html').write_text(context_page)
assert 'src="http' not in page and 'src="file' not in page
print(json.dumps({'page': str(file), 'bytes': file.stat().st_size, 'runtime': artifact_head, 'cases': len(report['cases'])}))
