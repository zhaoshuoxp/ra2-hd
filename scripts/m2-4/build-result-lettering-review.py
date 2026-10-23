"""Build an offline review using the exact production lettering component output."""
import argparse
import base64
import hashlib
import html
import io
import json
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('destination', type=Path)
parser.add_argument('--native', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
data = json.loads((args.source / 'lettering.json').read_text())
assert len(data['rows']) == 12
source_file = root / data['source']
assert hashlib.sha256(source_file.read_bytes()).hexdigest() == data['sourceSha256']
args.destination.mkdir(parents=True, exist_ok=False)


def embed(path, context=False):
    if context:
        buffer = io.BytesIO()
        Image.open(path).convert('RGB').save(buffer, format='WEBP', quality=95, method=4)
        return 'data:image/webp;base64,' + base64.b64encode(buffer.getvalue()).decode()
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode()


def reference(slot):
    source = Image.open(root / '.artifacts/m2-4/retail-presentation-v1/original-result-banners.png')
    buffer = io.BytesIO()
    source.crop((0, slot * 112, 436, (slot + 1) * 112)).save(buffer, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()


sections = []
for row in data['rows']:
    label = html.escape(row['text'])
    outcome = 'victory' if row['victory'] else 'defeat'
    purpose = 'Campaign standby' if row['mission'] else 'Skirmish'
    sections.append(f'<article data-language="{row["language"]}"><h2>Slot {row["slot"]} · {purpose} · {label}</h2>'
        '<div class="comparison">'
        f'<figure><figcaption>Imported Traditional original</figcaption><img src="{reference(row["slot"])}" width="436" height="112"></figure>'
        f'<figure><figcaption>{html.escape(data.get("previousLabel", "Previous HD"))}</figcaption><div class="banner previous {outcome}">{row["previous"]}</div></figure>'
        f'<figure><figcaption>{data["revision"]} · source-like lettering and shadow</figcaption><div class="banner current {outcome}" data-slot="{row["slot"]}">{row["current"]}</div></figure>'
        '</div></article>')

native_parts = []
status = 'Component preview; native checks pending'
if args.native:
    native = json.loads((args.native / 'report.json').read_text())
    assert native['status'] in ['PASS_NATIVE_RESULT_LETTERING_BOTH_DENSITIES_AND_V02',
        'PASS_INCREMENTAL_NATIVE_OUTLINE_4X_AND_ACCEPTED_STARTUP', 'PASS_INCREMENTAL_NATIVE_SHADOW_4X_AND_ACCEPTED_STARTUP']
    status = (f'Mac native 4X {"shadow" if data["revision"] in ["R4", "R5"] else "outline"} control passed; '
        'prior 2X/4X evidence reused; lettering visual acceptance pending'
        if data['revision'] in ['R3', 'R4', 'R5'] else 'Mac native 2X / 4X and v0.2 passed; visual acceptance pending')
    for row in native['cases']:
        native_parts.append(f'<figure><figcaption>{html.escape(row["edition"].upper())} · {row["density"]}X · native end flow</figcaption>'
            f'<img class="native" src="{embed(args.native / row["crop"])}" width="436"></figure>')
    native_parts.append('<details><summary>Full native context and version display (WebP; focus crops above are lossless)</summary>')
    for row in native['cases']:
        for file in [row['capture'], row['home']]:
            native_parts.append(f'<figure><figcaption>{html.escape(file)}</figcaption><img class="context" src="{embed(args.native / file, context=True)}"></figure>')
    native_parts.append('</details>')

disclaimer = json.loads((args.source / 'startup-disclaimer-copy.json').read_text())
copies = ''.join(f'<section><h3>{language} · current complete text</h3><pre>{html.escape(row["text"])}</pre></section>'
    for language, row in disclaimer['languages'].items())
hover_parts = []
if data['revision'] in ['R3', 'R4', 'R5']:
    prior = root / '.artifacts/m2-4/retail-presentation-native-final-v1'
    prior_report = json.loads((prior / 'report-compact.json').read_text())
    assert prior_report['status'] == 'PASS_NATIVE_CATALOG_LANGUAGES_NAMES_TOOLTIPS_RESULTS'
    for row in prior_report['cases']:
        language = row['language']
        hover_parts.append(f'<div data-hover-language="{language}"><h3>{row["edition"].upper()} · {language}</h3>')
        for kind, key in [('factory', 'factoryHover'), ('mcv', 'unitHover')]:
            name = f'{row["edition"]}-{language}-{kind}-texture.png'
            hover_parts.append(f'<figure><figcaption>{html.escape(row[key]["text"])}</figcaption>'
                f'<img src="{embed(prior / name)}" style="max-width:100%;width:{row[key]["logicalWidth"]}px;height:auto"></figure>')
        hover_parts.append('</div>')
backgrounds = {outcome: embed(root / f'public/res/ui/result-{outcome}-hd-v1-4x.png') for outcome in ['victory', 'defeat']}
document = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 Result Lettering REVISION and v0.2</title><style>
*{box-sizing:border-box}body{margin:0;background:#10171d;color:#e4ebee;font:18px/1.5 system-ui,sans-serif}main{max-width:1480px;margin:auto;padding:28px}
h1{font-size:30px;line-height:1.25}h2{font-size:22px}h3{font-size:20px}article,section.note{padding:18px;margin:22px 0;border:1px solid #45535f;border-radius:7px}
a{color:#91cdf5}label{margin-right:22px}select{font:inherit;padding:5px 12px}figure{margin:0;min-width:0}figcaption{font-size:16px;margin:8px 0;color:#bccbd6}
.comparison{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.banner{position:relative;width:100%;max-width:436px;aspect-ratio:436/112;background-size:100% 100%}
.comparison img{display:block;width:100%;height:auto;max-width:436px}.native{display:block;width:436px;max-width:100%;height:auto}.context{display:block;max-width:100%;height:auto}
.victory{background-image:url(BG_VICTORY)}.defeat{background-image:url(BG_DEFEAT)}.enlarged .banner{max-width:none}.enlarged .comparison{grid-template-columns:1fr}
.enlarged .comparison img{max-width:none}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:18px/1.65 system-ui,sans-serif}summary{cursor:pointer;font-weight:600}
@media(max-width:1000px){.comparison{grid-template-columns:1fr}main{padding:18px}}
</style><main><h1>M2.4 — Result Lettering REVISION · v0.2</h1>
<section class="note"><p>STATUS</p><p>Review the source's vertical yellow-to-orange face and lower-right shadow. The backgrounds, text wording, banner size and placement are reused. All four slots remain available; campaign slots 0/1 are standby.</p>
<p>SCOPE</p>
<p>This is one embedded HTML review. No new game package is delivered for this revision. The prior Desktop app remains the previous candidate. Cleanup stays deferred.</p></section>
<label>Language <select id="language"><option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="en-US">English</option><option value="all">All</option></select></label>
<label><input type="checkbox" id="enlarge"> Enlarge for inspection</label>
SECTIONS
<section class="note"><h2>Native checks and v0.2 display</h2>NATIVE</section>
<section class="note"><h2>HD hover text — unchanged native controls</h2><p>Retained from the preceding six native cases. No new hover artwork or behavior change.</p>HOVER</section>
<section class="note"><h2>Startup disclaimer — accepted and integrated</h2><p>The user accepted both complete versions. They are retained below for reference; no further notice review is requested.</p>COPIES</section>
</main><script>const select=document.querySelector('#language');function apply(){document.querySelectorAll('article[data-language],[data-hover-language]').forEach(el=>el.hidden=select.value!=='all'&&(el.dataset.language||el.dataset.hoverLanguage)!==select.value)}select.addEventListener('change',apply);document.querySelector('#enlarge').addEventListener('change',e=>document.body.classList.toggle('enlarged',e.target.checked));apply();</script></html>'''
document = document.replace('BG_VICTORY', backgrounds['victory']).replace('BG_DEFEAT', backgrounds['defeat'])
scope = ('R5 further widens and darkens the soft shadow beyond R4, following the latest feedback. '
    'The regular-weight face, thin dark edge, gradient and placement are unchanged. Review shadow depth and reach at normal size. The startup notice is already accepted.'
    if data['revision'] == 'R5' else
    'R4 widens and strengthens the soft shadow around each glyph. R3 regular-weight face, thin dark edge, '
    'gradient and placement are unchanged. Review shadow depth and reach at normal size. The startup notice is already accepted.'
    if data['revision'] == 'R4' else
    'R3 changes only the thin glyph edge to a darker source-like tone. R2 face geometry, gradient and gray shadow are retained. The startup notice is already accepted.'
    if data['revision'] == 'R3' else 'Review the lighter regular face and medium-gray shadow against the original.')
document = document.replace('SCOPE', scope)
document = document.replace('REVISION', data['revision']).replace('STATUS', status).replace('SECTIONS', ''.join(sections)).replace('NATIVE', ''.join(native_parts)).replace('HOVER', ''.join(hover_parts)).replace('COPIES', copies)
file = args.destination / f'M2.4-Result-Lettering-{data["revision"]}-Embedded.html'
file.write_text(document)
print(json.dumps(dict(status=status, file=str(file), bytes=file.stat().st_size, componentSha256=data['sourceSha256'])))
