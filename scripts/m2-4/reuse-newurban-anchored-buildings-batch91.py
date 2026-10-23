"""Replace an unselected redraw with accepted art and explicit native semantic adapters."""
import copy
import os
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from newurban_batch89_io import atlas, crop, logical, pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-anchored-buildings-batch91-20261020')
PROOF_ROOT = Path('.artifacts/m2-4/newurban-building-canvas-reuse-batch91-v1')
prior_export = read(ROOT / 'export-and-preservation-v1.json')
prep = read(ROOT / 'source-preparation-v1.json')
sources = {source['member']: source for source in read(ROOT / 'source.json')['sources']}
donors = {source['targetMember']: source for source in read(ROOT / 'accepted-native-donors-v1/source.json')['sources']}
baseline = read(ROOT / 'baseline-contract.json')
assert read('.local/environment-newurban-selection.json') == baseline['selectedPack']
assert read('desktop/environment-newurban-hd-contract.json') == baseline
checks = []
for record in prep['records']:
    if record['linked']:
        continue
    name = record['member']
    source = sources[name]
    accepted = donors[name]
    for slot in ([0, 3] if name == 'cnhosp.shp' else [3]):
        frame, donor_frame = source['frames'][slot], accepted['frames'][slot]
        a = np.fromfile(donor_frame['index']['file'], np.uint8).reshape(donor_frame['size'][::-1])
        b = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
        assert a.shape == b.shape
        ap = np.fromfile(donor_frame['palette']['file'], np.uint8).reshape(256, 3).astype(float) * 4
        palette_id = source['palette']['sha256'] if slot == 0 else '1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676'
        bp = np.fromfile(ROOT / 'native' / (palette_id + '.pal'), np.uint8).reshape(256, 3).astype(float) * 4
        active = (a != 0) & (b != 0)
        ca, cb = ap[a][active], bp[b][active]
        gain = cb.mean(0) / ca.mean(0)
        error = float(np.sqrt(np.mean((ca * gain - cb) ** 2)))
        correlation = float(np.corrcoef(ca.mean(1), cb.mean(1))[0, 1])
        difference = (a != 0) != (b != 0)
        labels, _ = ndimage.label(difference)
        components = np.bincount(labels.ravel())[1:]
        assert correlation >= .98 and error <= 9 and np.max(np.abs(gain - 1)) < .04
        assert not difference.any() if name != 'cnhosp.shp' or slot == 0 else (
            int(difference.sum()) == 27 and int(components.max()) <= 2)
        checks.append(dict(member=name, slot=slot, nativeMeanColorRatio=gain.tolist(),
            nativeColorRegistrationRmse=error, nativeLuminanceCorrelation=correlation,
            differingOriginalAlphaPixels=int(difference.sum()), alphaDifferenceComponentAreas=components.tolist(),
            acceptedRgbaPolicy='Reuse accepted authored RGB/alpha directly; no color fit, blur, interpolation, native pixel grain or new mother is applied. Tiny hospital raster islands do not redefine the accepted continuous HD contour.',
            nativeIndex=pin(ROOT / 'native' / frame['indexFile']), acceptedOriginalIndex=donor_frame['index']))
decision = dict(status='REUSE_ACCEPTED_ART_REPLACES_UNSELECTED_SEVEN_STUDY_REDRAW',
    userSteering='The user questioned unnecessary hospital/airport reproduction and asked why accepted material could not be reused.',
    rootCause='Earlier eligibility required absolute source canvas/trim identity and exact palette-index equality. Transparent padding can differ while rendered native anchors are equal; palette quantization can change indices without changing the depicted structure or material. Exact source equality was mistakenly treated as necessary for art reuse.',
    correction='Reuse all accepted bodies, all six rubble materials and complete linked loops. Preserve target native headers, original sources, palettes, gameplay and separate shadows. Apply only the source-pinned oil owner-shade cell and hospital native index-12 contact semantics.',
    unselectedRedraw=pin(ROOT / 'export-and-preservation-v1.json'), selectedNewMothers=0,
    unusedNewMothers=[pin(Path(job['destination'])) for job in read(ROOT / 'imagegen-jobs-v2.json')['jobs']],
    anchorProof=pin(PROOF_ROOT / 'accepted-anchor-donor-audit-v1.json'),
    structuralProof=pin(PROOF_ROOT / 'accepted-structural-donor-audit-v1.json'), materialChecks=checks,
    hospitalNormal='Same native trim, owner regions and outer contour. Only 86 original fixed RGB pixels differ; accepted architecture and continuous material remain authoritative. Preserve the 313 target original index-12 contact cells through the existing embedded-shadow renderer.',
    hospitalRubble='Same trim size and depicted debris footprint. The 27 changed alpha cells are 26 isolated one/two-pixel components; reuse the accepted continuous contour at the target original trim origin. Native placement, collision and separate shadows remain exact.',
    visual='INHERITED_ACCEPTED_ART_NO_SEVEN_NEW_STUDY_REVIEW', windows='NOT_RUN', m24Complete=False)
write(ROOT / 'accepted-art-reuse-decision-v1.json', decision)
prep2 = copy.deepcopy(prep)
prep2.update(status='SOURCE_PINNED_SIX_COMPLETE_FAMILIES_REUSE_ACCEPTED_ART', newStudies=0,
    reuseDecision=pin(ROOT / 'accepted-art-reuse-decision-v1.json'),
    unusedSourcePreparation=pin(ROOT / 'source-preparation-v1.json'), selectedNewMothers=0)
write(ROOT / 'source-preparation-v2.json', prep2)
revision = 'newurban-environment-anchored-reuse-batch91-v2-combined'
base = Path('.local/environment-packs') / baseline['selectedPack']['revision']
old = Path('.local/environment-packs') / prior_export['candidate']['revision']
destination = Path('.local/environment-packs') / revision
destination.mkdir(exist_ok=False)
manifest = read(base / 'manifest.json')
preserved = {}
for file in base.rglob('*'):
    if not file.is_file() or file == base / 'manifest.json':
        continue
    relative = file.relative_to(base)
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    os.link(file, target)
    preserved[str(relative)] = sha(file)
records = []
for previous in prior_export['records']:
    name = previous['member']
    source = sources[name]
    record, = [record for record in prep['records'] if record['member'] == name]
    donor_file = Path(record['donorMetadata']['file'])
    metadata = read(donor_file)
    frames = [logical(frame) for frame in source['frames'][:record['bodySlots']]]
    folder = destination / Path(previous['metadata']['file']).relative_to(old).parent
    folder.mkdir(parents=True)
    metadata.update(packId='environment-' + name.replace('.', '-').replace('_', '-'), packRevision=revision,
        logical=dict(canvas=source['canvas'], frames=frames),
        source=dict(member=name, sha256=source['sha256'], theater='NEWURBAN', kind='resolved-shp-member'))
    if record['linked']:
        for file in donor_file.parent.rglob('*'):
            if not file.is_file() or file == donor_file:
                continue
            target = folder / file.relative_to(donor_file.parent)
            target.parent.mkdir(parents=True, exist_ok=True)
            os.link(file, target)
    else:
        variants = []
        for density in [2, 4]:
            images = {slot: (crop(donor_file, slot, density), crop(donor_file, slot, density, 'data'))
                for slot in range(record['bodySlots'])}
            if name == 'cnoild.shp':
                for slot in [1, 2]:
                    region = images[slot][1][50 * density:51 * density, 46 * density:47 * density]
                    region[..., 1][region[..., 0] > 0] = 14
            if name == 'cnhosp.shp':
                frame = source['frames'][0]
                indices = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
                contact = (indices == 12).repeat(density, 0).repeat(density, 1)
                body, auxiliary = images[0]
                body[:contact.shape[0], :contact.shape[1]][contact] = [0, 0, 0, 255]
                auxiliary[:contact.shape[0], :contact.shape[1]][contact] = [0, 0, 0, 255]
            variants.append(atlas(folder, frames, images, density))
        metadata['variants'] = variants
    metadata['color']['acceptedNativeBodyFrames'] = dict(donor=record['donorMetadata'],
        exactOriginalSlots=record['exactAnchoredSlots'], acceptedRgbaSlots=list(range(record['bodySlots'])),
        proof=pin(ROOT / 'accepted-art-reuse-decision-v1.json'),
        disclosure='Original index equality and source-art reuse are separate. All accepted texture samples remain exact except the explicitly listed native contact and owner-shade adapters.')
    metadata['color'].pop('authoredFrameCoverage', None)
    metadata['color']['acceptedArtworkRegistration'] = dict(sourcePreparation=pin(ROOT / 'source-preparation-v2.json'),
        reuseDecision=pin(ROOT / 'accepted-art-reuse-decision-v1.json'), targetLogicalHeaderAuthoritative=True,
        hospitalContactCells=313 if name == 'cnhosp.shp' else 0,
        oilOwnerShadeCell=[46, 50, 30] if name == 'cnoild.shp' else None,
        newMothersUsed=0, separateOriginalShadowsUnchanged=True)
    metadata.setdefault('authored', {})['newurbanBatch91AcceptedReuse'] = dict(
        source=pin(ROOT / 'source.json'), preparation=pin(ROOT / 'source-preparation-v2.json'), donor=record['donorMetadata'])
    file = folder / 'manifest.json'
    write(file, metadata)
    row = {key: value for key, value in previous.items() if key not in ['frames', 'metadata']}
    row.update(metadata=pin(file), frames=[], artwork='REUSED_ACCEPTED', selectedNewMothers=0)
    records.append(row)
patch = read(ROOT / 'contract.json')
for family, definition in patch['families'].items():
    entries = [row for row in records if row['family'] == family]
    manifest['families'][family] = dict(familyHash=definition['familyHash'], members=[dict(member=row['member'],
        path=str(Path(row['metadata']['file']).relative_to(destination)), sha256=row['metadata']['sha256']) for row in entries])
manifest['revision'] = revision
write(destination / 'manifest.json', manifest)
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
combined = read(ROOT / 'contract-candidate-v1.json')
combined['selectedPack'] = candidate
combined['extensions']['newurbanAnchoredBuildingsBatch91'].update(newStudies=0,
    selectedNewMothers=0, reuseDecision=pin(ROOT / 'accepted-art-reuse-decision-v1.json'))
write(ROOT / 'contract-candidate-v2.json', combined)
write(ROOT / 'export-and-preservation-v2.json', dict(
    status='EXPORTED_SIX_COMPLETE_FAMILIES_WITH_ACCEPTED_ART_NOT_SELECTED', baseline=baseline['selectedPack'],
    candidate=candidate, preparation=pin(ROOT / 'source-preparation-v2.json'), records=records,
    reuseDecision=pin(ROOT / 'accepted-art-reuse-decision-v1.json'), completeFamilies=6, sourceMembers=12,
    newArtStudies=0, selectedNewMothers=0, sourceDensitySlots=prior_export['sourceDensitySlots'],
    originalShadowSlots=prior_export['originalShadowSlots'], unchangedPriorFamilies=len(baseline['families']),
    preservedPayloadHashes=preserved, native='NOT_RUN', visual='INHERITED_ACCEPTED_ART_MAPPING_PENDING',
    windows='NOT_RUN', m24Complete=False))
print(dict(candidate=candidate, families=6, members=12, newArtwork=0, selectedNewMothers=0,
    materialLuminanceCorrelations=[round(check['nativeLuminanceCorrelation'], 4) for check in checks]))
