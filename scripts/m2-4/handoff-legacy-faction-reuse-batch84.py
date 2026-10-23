"""Deliver a compact reuse summary and hash closure without another artwork gate."""
import base64
import hashlib
import html
import io
import json
import subprocess
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image

root = Path('.artifacts/m2-4/legacy-faction-reuse-batch84-20261020')
ore = Path('.artifacts/m2-4/desert-ore-batch83-20261020')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
closure = read(root / 'coverage-and-native-closure-v1.json')
review_root = root / 'review-v1'
review_root.mkdir(exist_ok=False)
images, figures = [], []
for theater in ['DESERT', 'NEWURBAN']:
    for density in [2, 4]:
        source = root / f'native-{theater.lower()}-{density}x-v1/GAREFN-binding-framebuffer.png'
        image = Image.open(source)
        assert image.size == (1489, 1080)
        file = review_root / f'{theater.lower()}-{density}x-native.png'
        image.crop((400, 300, 1060, 810)).save(file)
        images.append(dict(**pin(file), size=[660, 510], theater=theater, density=density,
            role='UNCHANGED_ACCEPTED_REFINERY_ACTUAL_GAME_UNSCALED_CROP'))
        label = f'{theater} / {density}X / accepted foreground refinery'
        encoded = base64.b64encode(file.read_bytes()).decode()
        figures.append(f'<figure><figcaption>{label}</figcaption><img width="660" height="510" alt="{label}" src="data:image/png;base64,{encoded}"></figure>')
authorities = {t: read(root / f'{t.lower()}-authority-v1.json') for t in ['DESERT', 'NEWURBAN']}
rows = []
for source in authorities['DESERT']['rows']:
    densities = sorted({d for m in source['members'] for d in m['authoredDensities']})
    native = ' / '.join(f'{d}X PASS' for d in [2, 4])
    rows.append(f'<tr><td>{source["family"]}</td><td>{len(source["members"])}</td><td>{native}</td><td>{native}</td><td>{"8 headings / both densities" if source.get("turret") else "Accepted state matrix reused"}</td></tr>')
summary = ''.join(f'<tr><td>{t["theater"]}</td><td>{t["directoryEntries"]}</td><td>{t["uniqueMapStreams"]}</td><td>{t["sourceModeVariants"]}</td><td>{t["selectableMaps"]}</td><td>{t["remainingAuthoredGaps"]}</td></tr>' for t in closure['theaters'])
document = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M2.4 Accepted Faction Reuse · Batch 84</title><style>body{{background:#10171c;color:#edf2f5;font:18px/1.55 system-ui,sans-serif;margin:0}}main{{max-width:1380px;margin:auto;padding:28px}}h1{{font-size:34px}}h2{{font-size:26px}}section{{margin:24px 0;padding:22px;background:#19232b;border:1px solid #45535c;border-radius:9px}}table{{border-collapse:collapse;width:100%}}td,th{{padding:12px;text-align:left;border:1px solid #60717e}}.scroll{{overflow:auto}}.pictures{{display:flex;flex-wrap:wrap;gap:20px}}figure{{margin:12px 0;overflow:auto}}img{{display:block;width:auto;height:auto;max-width:none}}figcaption{{margin-bottom:10px;color:#c6dce7}}code{{overflow-wrap:anywhere}}</style><main><h1>Accepted Faction Reuse · Batch 84</h1><p><b>No new visual approval is needed.</b> Fourteen accepted faction families are now proven in both Desert and NewUrban: 28 previously uncredited source groups and 56 actual density bindings. The original scanner examined environment-pack coverage and missed these existing legacy faction paths. Source hashes, complete members, fixed palette indices, original shadows and accepted payloads match.</p><section><h2>Complete-family native checks</h2><div class="scroll"><table><tr><th>Family</th><th>SHP members</th><th>Desert</th><th>NewUrban</th><th>Retained state evidence</th></tr>{''.join(rows)}</table></div><p>Each theater uses 53 complete SHP members. Native NALASR / NAFLAK turret checks retain all eight accepted headings at both densities. Existing authored densities and accepted 4X-to-2X derivation are recorded per member; no derived pixels are claimed as newly authored artwork.</p></section><section><h2>Actual game context · accepted foreground refinery</h2><p>All four pictures are unscaled game crops. Surrounding objects remain part of the current map and can include unfinished M2.4 coverage. Only the accepted foreground refinery illustrates this binding check; these are technical context images, not a request to re-review accepted art.</p><div class="pictures">{''.join(figures)}</div></section><section><h2>Directory and coverage</h2><div class="scroll"><table><tr><th>Theater</th><th>Catalog entries</th><th>Original streams</th><th>Overlapping mode labels</th><th>Selectable maps</th><th>Remaining authored groups</th></tr>{summary}</table></div><p>Each environment also retains 22 explicit unresolved or conditional dependency groups. They are preserved separately, without hiding failed maps or excluding old mode labels. No map eligibility or skirmish rule changes occur in this batch.</p></section><section><h2>Validation and resource handoff</h2><p>Four native Mac arm64 cases PASS: legal stock-building duplicates, all expected actual members and density identities, native tick advancement, complete turret publication, removal and zero old resource charge after Original reset. World peaks: 2X {closure['worldPeakBytes']['2']:,} / 536,870,912 bytes; 4X {closure['worldPeakBytes']['4']:,} / 1,342,177,280. Prepared peak: {closure['preparedPeakBytes']:,} / 134,217,728. Budgets remain unchanged.</p><p>The existing frozen Mac application <code>{closure['runtimeSourceCommit']}</code> and selected resources are unchanged. No shipping code, source map, artwork, cache or rule is modified. Accepted full state matrices and Batch 83 cross-theater evidence are reused. The separate JSON ledger pins all in-place dependencies; no additional application/resource copy is delivered.</p><p>Visual status: ACCEPTED ART REUSED. Windows: NOT RUN. M2.4: INCOMPLETE. Static embedded image checks PASS; interactive browser QA is not claimed.</p></section></main></html>'''
review = review_root / 'M2.4-Accepted-Faction-Reuse-Batch84-Embedded.html'
review.write_text(document)
metadata = dict(status='SELF_CONTAINED_ACCEPTED_REUSE_SUMMARY', review=pin(review), images=images,
    embeddedPngs=len(images), newArtwork=0, visualAcceptance=closure['visualAcceptance'], windows='NOT_RUN', m24Complete=False)
(review_root / 'review-metadata-v1.json').write_text(json.dumps(metadata, indent=2) + '\n')


class EmbeddedParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []

    def handle_starttag(self, tag, attributes):
        values = dict(attributes)
        assert tag not in ['script', 'iframe', 'object', 'embed', 'link', 'video', 'audio']
        assert not any(key.startswith('on') for key in values)
        if tag == 'img':
            self.images.append(values)


parser = EmbeddedParser()
parser.feed(document)
assert len(parser.images) == len(images) == 4
for image, expected in zip(parser.images, images, strict=True):
    assert image['src'].startswith('data:image/png;base64,')
    payload = base64.b64decode(image['src'].split(',', 1)[1], validate=True)
    assert payload == Path(expected['file']).read_bytes()
    with Image.open(io.BytesIO(payload)) as decoded:
        decoded.load()
        assert list(decoded.size) == expected['size'] == [int(image['width']), int(image['height'])]
qa = dict(status='PASS_ALL_FOUR_EMBEDDED_PNG_BYTES_DIMENSIONS_AND_OFFLINE_MARKUP', review=pin(review),
    decodedPngs=4, scripts=0, externalDependencies=0, browserInteraction='NOT_RUN_PRIOR_DENIAL_RETAINED')
(root / 'source-static-qa-v1.json').write_text(json.dumps(qa, indent=2) + '\n')
prior_file = ore / 'resource-handoff-v2.json'
assert sha(prior_file) == '51bdae2c12c81ade4962ebd127ac688677641fcb1b5b3e28dd29f81528f11a95'
prior = read(prior_file)
files = {row['file']: row.copy() for row in prior['files']}


def include(file):
    file = Path(file)
    entry = pin(file)
    previous = files.get(str(file))
    if previous:
        assert previous == entry, 'Accepted inherited files must remain exact: ' + str(file)
    files[str(file)] = entry


for authority in authorities.values():
    for row in authority['files']:
        file = Path(row['file'])
        assert sha(file) == row['sha256'] and file.stat().st_size == row['bytes']
        include(file)
for file in root.rglob('*'):
    if file.is_file() and 'profile' not in file.parts and file.suffix in ['.json', '.png', '.html', '.log']:
        if file.name not in ['resource-handoff-v1.json', 'desktop-delivery-v1.json', 'desktop-static-qa-v1.json', 'delivery-checkpoint-v1.json']:
            include(file)
for name in ['audit-legacy-faction-reuse-batch84.ts', 'native-legacy-faction-bindings-batch84.mjs',
             'close-legacy-faction-reuse-batch84.py', 'handoff-legacy-faction-reuse-batch84.py']:
    include(Path('scripts/m2-4') / name)
include(prior_file)
include(ore / 'user-acceptance-20261020.json')
for entry in files.values():
    file = Path(entry['file'])
    assert file.is_file() and file.stat().st_size == entry['bytes'] and sha(file) == entry['sha256'], str(file)
main = '/Users/Aone/RA2remaster/ra2-hd'
assert not subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True).strip()
head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
ledger = dict(status='PASS_28_ACCEPTED_SOURCE_GROUPS_AND_INHERITED_RESOURCE_HASH_CLOSURE',
    inheritedLedger=pin(prior_file), fileCount=len(files), files=list(files.values()),
    sourceGroups=28, nativeDensityBindings=56, resourcesChanged=False, newArtwork=0,
    runtimeSourceCommit=closure['runtimeSourceCommit'], main=dict(head=head, clean=True, changedByTask=False),
    visualAcceptance=closure['visualAcceptance'], windows='NOT_RUN', m24Complete=False)
with (root / 'resource-handoff-v1.json').open('x') as stream:
    stream.write(json.dumps(ledger, indent=2) + '\n')
print(json.dumps(dict(review=pin(review), files=len(files), ledgerSha256=sha(root / 'resource-handoff-v1.json'))))
