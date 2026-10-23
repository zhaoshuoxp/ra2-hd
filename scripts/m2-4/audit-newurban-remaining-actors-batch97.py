"""Screen the final actor sources against accepted authorities without new selection."""
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from newurban_batch96_io import GUIDE, ROOT as PRIOR, pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-remaining-actors-batch97-20261021')
VERSION = sys.argv[1] if len(sys.argv) > 1 else 'v3'
ROOT.mkdir(exist_ok=True)
parent = read(PRIOR / 'inventory-reconciliation-v1.json')
gaps = parent['remainingGaps']
assert len(gaps) == 16 and all(g['kind'] != 'tmp' for g in gaps)
guide_file = GUIDE / 'source.json'
guide = read(guide_file)
sources = {s['member']: s for s in guide['sources']}
authorities = []
for theater in ['TEMPERATE', 'SNOW', 'URBAN', 'DESERT', 'NEWURBAN']:
    suffix = '' if theater == 'TEMPERATE' else '-' + theater.lower()
    file = Path(f'desktop/environment{suffix}-hd-contract.json')
    contract = read(file)
    pointer = contract['selectedPack']
    pack_file = Path('.local/environment-packs') / pointer['revision'] / 'manifest.json'
    assert sha(pack_file) == pointer['sha256']
    authorities.append(dict(theater=theater, contract=contract, contractPin=pin(file),
        selectedPack=pointer, pack=read(pack_file)))

old_file = Path('.artifacts/m2-4/newurban-building-canvas-reuse-batch91-v1/accepted-anchor-donor-audit-v1.json')
old = read(old_file)
rows = []
for gap in gaps:
    source = sources[gap['member']]
    assert source['sha256'] == gap['sha256']
    ids = {binding['id'] for binding in source['bindings']}
    linked = [s for s in guide['sources'] if any(binding['id'] in ids for binding in s['bindings'])]
    candidates = []
    for authority in authorities:
        contract = authority['contract']
        identity_families = {contract['identities'].get('yr', {}).get(id) for id in ids} - {None}
        for family, entry in sorted(authority['pack']['families'].items()):
            definition = contract['families'][family]
            members = []
            for member in entry['members']:
                descriptor = contract['sources'][member['member']]
                same_stem = member['member'][2:] == source['member'][2:]
                exact_hash = descriptor['sha256'] == source['sha256']
                if not same_stem and not exact_hash:
                    continue
                metadata_file = Path('.local/environment-packs') / authority['selectedPack']['revision'] / member['path']
                assert sha(metadata_file) == member['sha256']
                members.append(dict(member=member['member'], sourceSha256=descriptor['sha256'],
                    sameStem=same_stem, exactOriginalHash=exact_hash, bodyFrames=descriptor['bodyFrames'],
                    palette=descriptor.get('palette'), framePalettes=descriptor.get('framePalettes'),
                    remapable=descriptor.get('remapable'), metadata=pin(metadata_file)))
            if members:
                candidates.append(dict(theater=authority['theater'], family=family,
                    identityMatched=family in identity_families,
                    completeDonorMembers=definition['members'], sourceScope=definition.get('sourceScope'),
                    selectedPack=authority['selectedPack'], members=members))
    previous = next((r for r in old['rows'] if r['member'] == source['member']), None)
    previous_candidates = [] if previous is None else [dict(theater=c['theater'], family=c['family'],
        member=c['member'], exactAnchoredSlots=c['exactAnchoredSlots'],
        slots=[{k: f[k] for k in ['slot', 'sameAnchoredTrim', 'nativeSize', 'donorSize',
            'differingRgb', 'differingOwner', 'differingAlpha', 'differingIndex12']} for f in c['slots']])
        for c in previous['candidates']]
    rows.append(dict(kind=gap['kind'], member=source['member'], sourceSha256=source['sha256'],
        identities=sorted(ids), name=source.get('nativeRules', {}).get('Name'), maps=gap['maps'],
        palette=source['palette'], nativeCanvas=source.get('canvas'), nativeFrames=source.get('totalFrames'),
        bodyFrames=source.get('totalFrames', 0) // (2 if source.get('hasShadow') else 1),
        linkedSources=[dict(member=s['member'], sha256=s['sha256'], roles=sorted({b['role'] for b in s['bindings'] if b['id'] in ids})) for s in linked],
        acceptedCandidates=candidates, inheritedNativeComparison=previous_candidates,
        decision='REQUIRES_ROLE_MATERIAL_POSE_AND_FULL_FAMILY_REVIEW_BEFORE_EXPORT',
        originalRgbUsedAsNewDetail=False))

buildings = [r for r in rows if r['kind'] == 'building']
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 23)
iso_file = GUIDE / 'native/1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676.pal'
assert sha(iso_file) == iso_file.stem
iso = np.fromfile(iso_file, np.uint8).reshape(256, 3) * 4
for page in range((len(buildings) + 3) // 4):
    chosen = buildings[page * 4:(page + 1) * 4]
    board = Image.new('RGB', (1800, len(chosen) * 340), '#14202a')
    draw = ImageDraw.Draw(board)
    for index, row in enumerate(chosen):
        source = sources[row['member']]
        draw.text((10, index * 340 + 5), row['identities'][0] + ' / ' + (row['name'] or row['member'])
            + ' / Original guide x2, not HD', font=font, fill='white')
        for column, frame in enumerate(source['frames'][:min(4, row['bodyFrames'])]):
            file = GUIDE / 'native' / frame['file']
            assert sha(file) == frame['rgbaSha256']
            pixels = np.fromfile(file, np.uint8).reshape(*reversed(frame['size']), 4)
            if row['bodyFrames'] == 4 and frame['slot'] == 3:
                # Runtime building rubble uses the theater iso palette, with no remap.
                # Whole-file guide RGBA is a raw unit/lib palette and is not this view.
                index_file = GUIDE / 'native' / frame['indexFile']
                assert sha(index_file) == frame['indexSha256']
                indices = np.fromfile(index_file, np.uint8).reshape(*reversed(frame['size']))
                pixels = np.dstack((iso[indices], (indices > 0).astype(np.uint8) * 255))
            image = Image.fromarray(pixels).resize(tuple(n * 2 for n in frame['size']), Image.Resampling.NEAREST)
            image.thumbnail((435, 280))
            board.paste(image, (column * 450 + 10, index * 340 + 42), image)
            draw.text((column * 450 + 10, index * 340 + 307), f'Original body slot {frame["slot"]}', font=font, fill='white')
    file = ROOT / f'original-building-role-inspection-part{page + 1}-{VERSION}.png'
    assert not file.exists(); board.save(file)
write(ROOT / f'reuse-screen-{VERSION}.json', dict(status='READ_ONLY_SCREEN_NO_NEW_ART_OR_COVERAGE_CREDIT',
    priorInventory=pin(PRIOR / 'inventory-reconciliation-v1.json'), originalGuide=pin(guide_file),
    inheritedAnchorAudit=pin(old_file), rows=rows,
    originalRubblePalette=pin(iso_file), originalRubbleRemap=False,
    acceptedAuthorities=[{k: a[k] for k in ['theater', 'contractPin', 'selectedPack']} for a in authorities],
    policy='Rendered original pose, material role, anchor, ownership and complete dependencies determine reuse. Different names, canvas margins, palettes or source hashes do not alone require new art. Original pixels remain reference data. Seasonal variants may reuse accepted structures with explicit material adaptation.',
    resourcesOrSelectorsChanged=False, native='NOT_RUN_NEW_BATCH', windows='NOT_RUN', m24Complete=False))
print(dict(sources=len(rows), buildingBodies=len(buildings),
    acceptedCandidateSources=sum(bool(r['acceptedCandidates']) for r in rows),
    rows=[dict(member=r['member'], name=r['name'], bodyFrames=r['bodyFrames'],
        donorTheaters=[c['theater'] for c in r['acceptedCandidates']]) for r in rows]))
