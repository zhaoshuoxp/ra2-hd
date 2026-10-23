"""Prepare native-guided prompts and export an additive, isolated Yuri review pack."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import base64
import hashlib
import html
import io
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / '.artifacts/yuri-cameos'
PRODUCTION_REVISION = next((arg.split('=', 1)[1] for arg in sys.argv if arg.startswith('--revision=')), 'production-v4')
assert re.fullmatch(r'production-v[1-9][0-9]*', PRODUCTION_REVISION)
OUT = ART / PRODUCTION_REVISION
REVISION = 'yuri-cameos-e-' + PRODUCTION_REVISION.split('-')[1]
DESIGNS = {
    'brckicon': ('Yuri Barracks', 'building'),
    'bruticon': ('Brute', 'infantry'),
    'bsubicon': ('Boomer', 'vehicle'),
    'caosicon': ('Chaos Drone', 'vehicle'),
    'citwicon': ('Yuri Fortress Wall', 'building'),
    'diskicon': ('Floating Disc', 'vehicle'),
    'forcicon': ('Force Shield power', 'power'),
    'ggunicon': ('Gatling Cannon', 'building'),
    'grndicon': ('Grinder', 'building'),
    'gtncicon': ('Genetic Mutator', 'building'),
    'initicon': ('Initiate', 'infantry'),
    'ltnkicon': ('Lasher Tank', 'vehicle'),
    'mindicon': ('Mastermind', 'vehicle'),
    'muteicon': ('Genetic Mutator power', 'power'),
    'pdomicon': ('Psychic Dominator power', 'power'),
    'psyricon': ('Psychic Reveal power', 'power'),
    'psyticon': ('Psychic Tower', 'building'),
    'pupticon': ('Psychic Dominator', 'building'),
    'sminicon': ('Slave Miner / Slave Refinery', 'vehicle'),
    'tbnkicon': ('Tank Bunker', 'building'),
    'teleicon': ('Magnetron', 'vehicle'),
    'vrusicon': ('Virus', 'infantry'),
    'yclnicon': ('Yuri Clone', 'infantry'),
    'yhvricon': ('Yuri Hover Transport', 'vehicle'),
    'ypcvicon': ('Yuri MCV', 'vehicle'),
    'ypwricon': ('Bio Reactor', 'building'),
    'ytchicon': ('Yuri Battle Lab', 'building'),
    'ytnkicon': ('Gatling Tank', 'vehicle'),
    'ywepicon': ('Yuri War Factory', 'building'),
    'yypricon': ('Yuri Prime', 'infantry'),
    'yyrdicon': ('Yuri Naval Yard', 'building'),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        assert path.read_bytes() == data, f'Immutable evidence differs: {path}'
    else:
        path.write_bytes(data)


def save_json(path, value):
    save(path, (json.dumps(value, indent=2) + '\n').encode())


def png(image):
    buf = io.BytesIO()
    image.save(buf, format='PNG')
    return buf.getvalue()


def relative(path):
    return str(path.relative_to(ROOT))


def inventory():
    return json.loads((ROOT / 'docs/yuri-cameos-inventory.json').read_text())


def plan():
    inv = inventory()
    approval = json.loads((ART / 'representative-acceptance-v2.json').read_text())
    approved = {item['identity']: item for item in approval['approved']}
    new_ids = {item['member'] for item in inv['entries'] if item['status'] == 'NEW_ART_REQUIRED'}
    aliases = {item['alternate']: item for item in inv['alternatePairs'] if item['export'] and item['alternate'] in new_ids}
    entries = [item for item in inv['entries'] if item['status'] == 'NEW_ART_REQUIRED' and item['member'] not in aliases]
    assert len(entries) == 31 and len(aliases) == 12 and len(approved) == 4
    pending = []
    for entry in entries:
        name = entry['member'].removesuffix('.shp')
        if entry['member'] in approved and PRODUCTION_REVISION == 'production-v1':
            pin = approved[entry['member']]
            data = (ROOT / pin['master']).read_bytes()
            assert sha(data) == pin['masterSha256']
            save(OUT / 'masters' / f'{name}.png', data)
            continue
        title, category = DESIGNS[name]
        ref = ART / 'references-v2' / f'{name}.png'
        prompt = (f'Use case: precise-object-edit\nAsset type: faithful, genuinely detailed HD reconstruction of {entry["member"]}.\n'
                  'Use the supplied original game icon as the strict authority for design and composition. Reconstruct the SAME scene, with the SAME silhouette, proportions, pose, perspective, camera elevation, framing, object count, positions, lighting and palette. Do not invent a different scene.\n'
                  'The user wants genuinely finer textures and detail, and naturally smooth lines and polygons, not merely cleaner edges on enlarged pixel blocks. Model the existing forms with refined geometry: natural curves, smooth continuous contours and finely subdivided surfaces, while preserving all structural shapes and proportions. Remove pixel-grid blocks, stair-step edges and crude faceted pixel tracing.\n'
                  'Add rich, fine-scale material detail ONLY on existing surfaces: nuanced metal grain and subtle reflections, natural fabric weave and existing folds, convincing skin texture where present, clean translucent glass and accurately resolved mechanical edges. Use coherent continuous shading and smooth gradients. These details should be visible in a high-resolution inspection, not blur or sharpening noise. Keep the original game illustration style, restrained light, colors, saturation and contrast; do not turn it into a cinematic photograph.\n'
                  'Preserve the original design exactly: no added architecture, machinery, antennae, barrels, pipes, bolts, decorative rings, body parts, background objects, glow or effects. Surface refinement is allowed; extra structures and objects are not. Do not make the main subject taller, wider or bulkier.\n'
                  'Remove only the bottom white UI characters and tiny blue border marks, continuing adjacent existing background colors conservatively. Do not add any text, ranks, quantity or progress marks.\n'
                  'Output ONE opaque 5:4 landscape high-resolution image, at least 1200x960, with true fine detail and natural smooth surfaces. Preserve the original composition and colors. No pixel art, blocky enlargement, collage, border or watermark.\n')
        if name == 'initicon':
            prompt += 'The bright light above the Initiate is ordinary SUNLIGHT; never a laser or psychic beam. Preserve the original raised hand, goggles, head angle and gray padded uniform.\n'
        elif name == 'ypwricon':
            prompt += 'One near reactor and two farther reactors; EACH building has three reaction chambers. Preserve the native pale upper glass, subtle yellow lower fluid, dark narrow pipe connections and original composition.\n'
        prompt_path = OUT / 'prompts' / f'{name}.txt'
        save(prompt_path, prompt.encode())
        pending.append(dict(identity=entry['member'], title=title, category=category,
                            references=[str(ref)], referenceSha256=sha(ref.read_bytes()),
                            nativeMemberSha256=entry['sha256'], prompt=relative(prompt_path),
                            output=relative(OUT / 'masters' / f'{name}.png')))
    save_json(OUT / 'generation-plan.json', dict(schemaVersion=1, canonicalCount=31, remaining=pending,
              preservedApprovedMasterIdentities=list(approved), regenerateApprovedForComparison=True,
              artDirection='NATIVE_ONLY_SUPER_RESOLUTION_WITH_FIXED_COMPOSITION_STYLE_AND_PALETTE',
              aliases=list(aliases.values())))
    print(json.dumps(dict(canonical=31, pending=len(pending), aliases=12)))


def record(name, source, prompt_path=None):
    assert name in DESIGNS
    source = Path(source)
    data = source.read_bytes()
    img = Image.open(io.BytesIO(data)).convert('RGBA')
    assert img.width >= 240 and img.height >= 192 and abs(img.width / img.height - 1.25) < .004
    assert img.getchannel('A').getextrema() == (255, 255)
    save(OUT / 'generated' / f'{name}.png', data)
    master = OUT / 'masters' / f'{name}.png'
    save(master, png(img))
    prompt = ROOT / prompt_path if prompt_path else OUT / 'prompts' / f'{name}.txt'
    save_json(OUT / 'provenance' / f'{name}.json', dict(identity=name + '.shp', generation='built-in imagegen',
              serviceOutput=str(source), generated=relative(OUT / 'generated' / f'{name}.png'),
              generatedSha256=sha(data), master=relative(master), masterSha256=sha(master.read_bytes()),
              dimensions=list(img.size), prompt=relative(prompt), promptSha256=sha(prompt.read_bytes()),
              visualStatus='PRODUCED_UNDER_APPROVED_DIRECTION_FINAL_REVIEW_PENDING'))
    print(json.dumps(dict(identity=name, size=list(img.size), completed=len(list((OUT / 'masters').glob('*.png'))))))


def embedded(path, alt, css='cameo'):
    data = base64.b64encode(path.read_bytes()).decode()
    return f'<img class="{css}" alt="{html.escape(alt)}" src="data:image/png;base64,{data}">'


def correct(name, version, source):
    assert name in DESIGNS and re.fullmatch(r'v[1-9][0-9]*', version)
    folder = OUT / 'corrections' / f'{name}-{version}'
    prompt = folder / 'prompt.txt'
    data = Path(source).read_bytes()
    image = Image.open(io.BytesIO(data)).convert('RGBA')
    assert image.width >= 1200 and abs(image.width / image.height - 1.25) < .004
    assert image.getchannel('A').getextrema() == (255, 255)
    save(folder / 'service-output.png', data)
    master = folder / 'master.png'
    save(master, png(image))
    provenance = dict(identity=name + '.shp', generation='built-in imagegen', serviceOutput=source,
        master=relative(master), masterSha256=sha(master.read_bytes()), dimensions=list(image.size),
        prompt=relative(prompt), promptSha256=sha(prompt.read_bytes()), status='TARGETED_CORRECTION_REVIEW_PENDING')
    save_json(folder / 'provenance.json', provenance)
    overrides_file = OUT / 'master-overrides.json'
    overrides = json.loads(overrides_file.read_text()) if overrides_file.exists() else {}
    overrides[name] = relative(master)
    overrides_file.write_text(json.dumps(overrides, indent=2) + '\n')
    ledger_file = ART / 'production-ledger.json'
    ledger = json.loads(ledger_file.read_text())
    ledger['masterSelections'] = overrides
    ledger.setdefault('nativeInterpretationCorrections', []).append(provenance)
    ledger_file.write_text(json.dumps(ledger, indent=2) + '\n')
    print(json.dumps(dict(identity=name, correction=version, master=relative(master))))


def export():
    inv = inventory()
    acceptance_file = OUT / 'visual-acceptance.json'
    acceptance = json.loads(acceptance_file.read_text()) if acceptance_file.exists() else None
    accepted = {item['identity']: item for item in acceptance['approved']} if acceptance else {}
    new_ids = {item['member'] for item in inv['entries'] if item['status'] == 'NEW_ART_REQUIRED'}
    aliases = {item['alternate']: item for item in inv['alternatePairs'] if item['export'] and item['alternate'] in new_ids}
    new = [item for item in inv['entries'] if item['status'] == 'NEW_ART_REQUIRED']
    canonical = [item for item in new if item['member'] not in aliases]
    assert len(list((OUT / 'masters').glob('*.png'))) == len(canonical) == 31
    approval = json.loads((ART / 'representative-acceptance-v2.json').read_text())
    pins = {item['identity']: item for item in approval['approved']}
    for pin in pins.values():
        assert sha((ROOT / pin['master']).read_bytes()) == pin['masterSha256']
        for item in pin['exports']:
            assert sha((ROOT / item['file']).read_bytes()) == item['sha256']
    masters, exports, delta = [], [], []
    overrides_file = OUT / 'master-overrides.json'
    overrides = json.loads(overrides_file.read_text()) if overrides_file.exists() else {}
    assert set(overrides).issubset(DESIGNS)
    for entry in canonical:
        name = entry['member'].removesuffix('.shp')
        master = ROOT / overrides[name] if name in overrides else OUT / 'masters' / f'{name}.png'
        image = Image.open(master).convert('RGBA')
        assert image.width > 240 and image.height > 192 and image.getchannel('A').getextrema() == (255, 255)
        digest = sha(master.read_bytes())
        if entry['member'] in accepted:
            assert digest == accepted[entry['member']]['master']['sha256']
        preserved_approval = entry['member'] in pins and (
            PRODUCTION_REVISION == 'production-v1' or overrides.get(name) == pins[entry['member']]['master'])
        if preserved_approval:
            assert digest == pins[entry['member']]['masterSha256']
        masters.append(dict(identity=entry['member'], file=relative(master), sha256=digest, dimensions=list(image.size)))
        for density in [2, 4]:
            data = png(image.resize((60 * density, 48 * density), Image.Resampling.LANCZOS))
            if entry['member'] in accepted:
                assert sha(data) == next(item['sha256'] for item in accepted[entry['member']]['exports'] if item['density'] == density)
            if preserved_approval:
                assert sha(data) == next(item['sha256'] for item in pins[entry['member']]['exports'] if item['density'] == density)
            file = OUT / f'{density}x' / f'{name}.png'
            save(file, data)
            exports.append(dict(identity=entry['member'], file=relative(file), sha256=sha(data), bytes=len(data),
                                density=density, dimensions=[60 * density, 48 * density], masterSha256=digest))
            if density == 4:
                delta.append(dict(id=entry['member'], file=f'{name}.png', sha256=sha(data), width=240, height=192,
                                  logicalWidth=60, logicalHeight=48))
    for name, alias in aliases.items():
        base = next(item for item in delta if item['id'] == alias['selectedBase'])
        delta.append(dict(base, id=name, overlay='cameo-rank'))
    assert len(delta) == 43
    predecessor = ROOT / '.local/ui-packs/remaining-ui-v4'
    old_bytes = (predecessor / 'manifest.json').read_bytes()
    assert sha(old_bytes) == inv['acceptedUi']['sha256']
    old = json.loads(old_bytes)
    old_ids = {item['id'] for item in old['assets']}
    assert not old_ids.intersection(item['id'] for item in delta)
    pack = ROOT / '.local/ui-packs' / REVISION
    pack.mkdir(parents=True, exist_ok=True)
    for file in {item['file'] for item in old['assets']} | {item['file'] for item in old.get('menuVideo', {}).values()}:
        save(pack / file, (predecessor / file).read_bytes())
    for item in delta:
        save(pack / item['file'], (OUT / '4x' / item['file']).read_bytes())
    manifest = dict(old, revision=REVISION, assets=old['assets'] + delta)
    save_json(pack / 'manifest.json', manifest)
    assert len(manifest['assets']) == 473
    selection = dict(schemaVersion=1, revision=REVISION, sha256=sha((pack / 'manifest.json').read_bytes()), reviewOnly=True)
    save_json(OUT / 'selection.json', selection)
    save_json(OUT / 'pack-delta.json', dict(schemaVersion=1, taskId='E', edition='yr', revision=REVISION,
              expectedPredecessorRevision=old['revision'], expectedPredecessorSha256=sha(old_bytes),
              additions=[dict(item, operation='ADD', expectedPredecessor=None) for item in delta],
              acceptedEntriesPreserved=430, selectedRuntimeDensity=4, companionDensity=2,
              exclusions=[dict(identity='engnuico.shp', reason='Native member absent; retain placeholder')]))
    save_json(OUT / 'export-receipt.json', dict(schemaVersion=1, taskId='E', canonicalCount=31, aliases=12,
              newEntries=43, reused=8, masters=masters, exports=exports, manifest=relative(pack / 'manifest.json'),
              manifestSha256=selection['sha256'], selection=selection, runtimeValidated=False, fullBatchAccepted=False,
              visualAcceptance=acceptance, acceptedCanonicalCount=len(accepted),
              preservedApprovedRepresentatives=approval['approved'], masterOverrides=overrides,
              representativeAlternativeSelection={'muteicon.shp': 'RESTORED_PREVIOUS_APPROVAL',
                  'initicon.shp': 'PENDING_USER_COMPARISON', 'ltnkicon.shp': 'PENDING_USER_REVIEW_LONGER_BARREL',
                  'ypwricon.shp': 'PENDING_USER_COMPARISON'} if not acceptance else {
                  identity: 'USER_ACCEPTED_CURRENT_SELECTION' for identity in pins}))
    parts = ['<!doctype html><html lang="en"><meta charset="utf-8"><title>Yuri Cameos Task E Review</title>',
             '<style>:root{--scale:1}body{font:18px system-ui;background:#202429;color:#eee;margin:24px}h1{font-size:30px}h2{font-size:23px}.row{display:flex;gap:24px;align-items:start;margin-bottom:24px}figure{margin:0}figcaption{font-size:16px;margin-bottom:8px}.cameo,.rank-box{width:calc(60px * var(--scale));height:calc(48px * var(--scale))}.rank-box{position:relative}.detail{width:240px;height:192px}.rank{position:absolute;inset:0}button{font-size:18px;margin:8px;padding:8px}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #777}</style>',
             '<h1>Yuri HD Cameos — Task E</h1><p>31 canonical pictures, 12 shared-rank aliases, 8 accepted shared references. Genetic Mutation restores the previously approved version; Lasher Tank has a longer barrel. Keep native proportions, style, colors and composition; refine existing surfaces only. All 2x/4x exports derive directly from higher-resolution masters. Fixed 4x runtime policy; final batch visual acceptance remains pending.</p>',
             '<button onclick="document.documentElement.style.setProperty(\'--scale\',1)">60 x 48 native size</button><button onclick="document.documentElement.style.setProperty(\'--scale\',4)">4x inspection</button>']
    if acceptance:
        parts[2] = ('<h1>Yuri HD Cameos — Task E</h1><p>30 canonical pictures and their shared-rank aliases are user accepted. '
                    'Psychic Reveal has a targeted black-fog correction matching the native source and awaits review. '
                    'Every other selected master and both-density export remain byte-identical to the approved selection. '
                    'The restored Genetic Mutation remains selected. Runtime density stays fixed at 4x.</p>')
    parts.append('<h2>Four preserved approvals versus new native-guided alternatives</h2><p>The previous approvals remain intact. These new alternatives do not revoke or overwrite those decisions.</p>')
    for identity, pin in pins.items():
        name = identity.removesuffix('.shp')
        approved_export = ROOT / next(item['file'] for item in pin['exports'] if item['density'] == 4)
        candidate = OUT / '4x' / f'{name}.png'
        native = ART / 'references-v2' / f'{name}.png'
        caption = 'Restored approved version' if name == 'muteicon' and overrides.get(name) == pin['master'] else 'Current candidate'
        parts.append(f'<h2>{name}.shp</h2><div class="row"><figure><figcaption>Native source</figcaption>{embedded(native, "Native source", "detail")}</figure><figure><figcaption>Previously approved</figcaption>{embedded(approved_export, "Previously approved", "detail")}</figure><figure><figcaption>{caption}</figcaption>{embedded(candidate, caption, "detail")}</figure></div>')
    board = Image.new('RGB', (1200, ((31 + 3) // 4) * 145), '#202429')
    draw = ImageDraw.Draw(board)
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 19)
    for idx, entry in enumerate(canonical):
        name = entry['member'].removesuffix('.shp')
        title = DESIGNS.get(name, (name,))[0]
        original, hd = ART / 'references-v1' / f'{name}.png', OUT / '4x' / f'{name}.png'
        status = ' — User accepted' if entry['member'] in accepted else ' — Black-fog correction awaiting review' if acceptance else ''
        parts.append(f'<h2>{html.escape(title)} — {name}.shp{status}</h2><div class="row"><figure><figcaption>Retail source</figcaption>{embedded(original, "Retail source")}</figure><figure><figcaption>HD at sidebar size</figcaption>{embedded(hd, "HD native-size")}</figure><figure><figcaption>4x detail</figcaption>{embedded(hd, "HD detail", "detail")}</figure></div>')
        col, row = idx % 4, idx // 4
        draw.text((col * 300 + 10, row * 145 + 8), name, font=font, fill='white')
        board.paste(Image.open(original).convert('RGB'), (col * 300 + 10, row * 145 + 42))
        board.paste(Image.open(hd).convert('RGB').resize((60, 48), Image.Resampling.LANCZOS), (col * 300 + 92, row * 145 + 42))
        draw.text((col * 300 + 10, row * 145 + 98), 'Original / HD at 60 x 48', font=font, fill='#bbb')
    parts.append('<h2>Native alternate/rank bindings</h2><table><tr><th>Alternate</th><th>Base</th><th>HD + shared rank</th></tr>')
    overlay = pack / next(item['file'] for item in old['assets'] if item['id'] == 'cameo-rank')
    for alt, alias in aliases.items():
        hd = OUT / '4x' / (alias['selectedBase'].removesuffix('.shp') + '.png')
        parts.append(f'<tr><td>{alt}</td><td>{alias["selectedBase"]}</td><td><div class="rank-box">{embedded(hd, alt)}{embedded(overlay, "Shared rank", "cameo rank")}</div></td></tr>')
    parts.append('</table><p>Native absence: engnuico.shp. INIT localized alternate collides with Lasher; correct INIT base + existing rank selected. CAOS/MIND alternate declarations retained, naturally untrainable. Dynamic names, quantities and production controls remain runtime UI.</p></html>')
    save(OUT / 'Yuri-Cameos-Complete-Review.html', '\n'.join(parts).encode())
    save(OUT / 'native-size-comparison.png', png(board))
    print(json.dumps(dict(canonical=31, aliases=12, additions=43, combinedEntries=473, review=relative(OUT / 'Yuri-Cameos-Complete-Review.html'))))


if __name__ == '__main__':
    command = sys.argv[1]
    if command == 'plan':
        plan()
    elif command == 'record':
        record(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)
    elif command == 'export':
        export()
    elif command == 'correct':
        correct(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        raise ValueError('Expected plan, record, correct or export')
