"""Audit the four remaining Desert families and prepare untouched original source guides."""
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

BASE = Path('.artifacts/m2-4')
ROOT = BASE / 'desert-final-buildings-native-batch86-v1'
ART = BASE / 'desert-final-buildings-authoring-batch86-v1'
GUIDE = BASE / 'desert-native-v1'
PRIOR = BASE / 'desert-morocco-batch85-20261020/coverage-and-native-closure-v1.json'
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
pin = lambda path: dict(file=str(path), sha256=sha(path), bytes=path.stat().st_size)


def write(path, value):
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


prior = read(PRIOR)
remaining = next(row for row in prior['theaters'] if row['theater'] == 'DESERT')['remainingGaps']
identities = {'CAAIRP', 'CAPARK06', 'CAHSE06', 'CAEGYP02'}
assert len(remaining) == 4 and {row['identities'][0] for row in remaining} == identities
original = read(GUIDE / 'source.json')
sources = [copy.deepcopy(source) for source in original['sources']
           if any(binding['id'] in identities for binding in source['bindings'])]
assert len(sources) == 6
source_by_member = {source['member']: source for source in sources}
selector = Path('.local/environment-desert-selection.json')
before = pin(selector)
current = read(Path('desktop/environment-desert-hd-contract.json'))
assert read(selector) == current['selectedPack'] == prior['candidate']
ROOT.mkdir(exist_ok=False)
ART.mkdir(exist_ok=False)
os.symlink((GUIDE / 'native').resolve(), ROOT / 'native')
guide = dict(schema=original['schema'], theater='DESERT', originalGuide=pin(GUIDE / 'source.json'),
    sources=sources, scope='Four remaining complete original families, including all airport linked phases. Source preparation only; no resource selection or coverage claim.')
write(ROOT / 'source.json', guide)
contract = dict(schema=current['schema'], theater='DESERT', preparedSourceSha256=sha(ROOT / 'source.json'),
    sources={}, families={}, identities={'ra2': {}, 'yr': {}}, aliases={})
iso = '5d6e40fcd11a592a31494c635d93c21796cfe86a2743f0258b1f7d0aff850795'
assert sha(GUIDE / 'native' / (iso + '.pal')) == iso
records, original_guides = [], []
for identity in sorted(identities):
    members = [source for source in sources if any(binding['id'] == identity for binding in source['bindings'])]
    family_sources = {}
    for source in members:
        member = source['member']
        assert sha(GUIDE / 'native' / source['nativeFile']) == source['sha256']
        palette = GUIDE / 'native' / (source['palette']['sha256'] + '.pal')
        assert sha(palette) == source['palette']['sha256']
        descriptor = {key: copy.deepcopy(source[key]) for key in
                      ['sha256', 'canvas', 'totalFrames', 'palette', 'hasShadow', 'remapable']}
        count = source['totalFrames'] // (2 if source['hasShadow'] else 1)
        descriptor['bodyFrames'] = count
        body = any(binding['role'] == 'body' for binding in source['bindings'])
        if body and count == 4:
            descriptor['framePalettes'] = {'3': dict(member='isodes.pal', archive='ra2md.mix/cachemd.mix',
                sha256=iso, role='rubble', remapable=False,
                runtimeUsed=str(source['nativeRules'].get('LeaveRubble', '')).lower() in ['yes', 'true', '1'])}
        contract['sources'][member] = descriptor
        family_sources[member] = descriptor
        duplicates, empty = [], []
        for frame in source['frames']:
            for key, digest in [('file', 'rgbaSha256'), ('indexFile', 'indexSha256')]:
                assert sha(GUIDE / 'native' / frame[key]) == frame[digest]
            if frame['slot'] >= count:
                continue
            slot = frame['slot']
            if frame['empty']:
                empty.append(slot)
                continue
            earlier = next((item for item in source['frames'][:slot] if all(item[key] == frame[key]
                for key in ['origin', 'size', 'empty', 'indexSha256'])), None)
            if earlier:
                duplicates.append(dict(slot=slot, canonicalSlot=earlier['slot']))
            indices = np.fromfile(GUIDE / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
            frame_palette = descriptor.get('framePalettes', {}).get(str(slot), source['palette'])
            colors = np.fromfile(GUIDE / 'native' / (frame_palette['sha256'] + '.pal'), np.uint8)
            colors = colors.reshape(256, 3).astype(np.uint16) * 4
            rgba = np.zeros((*indices.shape, 4), np.uint8)
            rgba[..., :3], rgba[..., 3] = colors[indices].astype(np.uint8), (indices != 0) * 255
            file = ART / f'{member}-{slot:03d}-original-only.png'
            Image.fromarray(rgba).save(file)
            original_guides.append(dict(**pin(file), member=member, slot=slot,
                role='UNTOUCHED_ORIGINAL_GEOMETRY_AND_COLOR_REFERENCE_NOT_NEW_HD'))
        records.append(dict(identity=identity, member=member, sourceSha256=source['sha256'],
            bodyFrames=count, originalShadowFrames=count if source['hasShadow'] else 0,
            originalEmptySlots=empty, exactWithinSourceDuplicates=duplicates,
            bindings=source['bindings']))
    family = 'desert-' + identity.lower()
    basis = dict(theater='DESERT', members=family_sources, identities=[identity])
    contract['families'][family] = dict(members=sorted(family_sources), identities=[identity],
        editions=['yr'], kinds=['building'],
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    contract['identities']['yr'][identity] = family
write(ROOT / 'contract.json', contract)

urban = read(Path('desktop/environment-urban-hd-contract.json'))
donor_pack = Path('.local/environment-packs') / urban['selectedPack']['revision']
assert sha(donor_pack / 'manifest.json') == urban['selectedPack']['sha256']
donor_manifest = read(donor_pack / 'manifest.json')
donor_sources = {}
for file in [BASE / 'urban-civilians-native-batch49-v1/source.json',
             BASE / 'urban-building-rubble-native-batch52-v1/source.json']:
    for source in read(file)['sources']:
        donor_sources[source['member']] = (source, file.parent)
proofs, payloads = [], []
for member, donor_member, donor_family in [
    ('cgpark06.shp', 'cgpark06.shp', 'urban-capark06'),
    ('cdairp_f.shp', 'cuairp_f.shp', 'urban-caairp'),
    ('cdhse06.shp', 'cuhse06.shp', 'urban-cahse06')]:
    source, (donor, donor_root) = source_by_member[member], donor_sources[donor_member]
    entry, = [row for row in donor_manifest['families'][donor_family]['members'] if row['member'] == donor_member]
    metadata_file = donor_pack / entry['path']
    assert sha(metadata_file) == entry['sha256']
    metadata = read(metadata_file)
    assert [variant['density'] for variant in metadata['variants']] == [2, 4]
    assert metadata['source']['sha256'] == donor['sha256']
    exact = []
    for frame, target in zip(source['frames'], donor['frames']):
        if all(frame[key] == target[key] for key in ['origin', 'size', 'empty', 'indexSha256']):
            assert (GUIDE / 'native' / frame['indexFile']).read_bytes() == (donor_root / 'native' / target['indexFile']).read_bytes()
            exact.append(frame['slot'])
    assert source['canvas'] == donor['canvas']
    assert source['palette']['sha256'] == donor['palette']['sha256']
    assert (GUIDE / 'native' / (source['palette']['sha256'] + '.pal')).read_bytes() == \
           (donor_root / 'native' / (donor['palette']['sha256'] + '.pal')).read_bytes()
    count = source['totalFrames'] // (2 if source['hasShadow'] else 1)
    assert metadata['logical']['canvas'] == source['canvas']
    assert len(metadata['logical']['frames']) == count
    for variant in metadata['variants']:
        for page in variant['pages']:
            for role in ['base', 'data']:
                file = metadata_file.parent / str(variant['density']) / page['id'] / (role + '.png')
                assert sha(file) == page[role + 'Sha256']
                payloads.append(pin(file))
    proofs.append(dict(member=member, donorMember=donor_member, donorFamily=donor_family,
        donorMetadata=pin(metadata_file), sourceSha256=source['sha256'], donorSourceSha256=donor['sha256'],
        exactOriginalSlots=exact, bodyFrames=count, paletteSha256=source['palette']['sha256'],
        status='EXACT_COMPLETE_ORIGINAL_AND_ACCEPTED_PAYLOAD_REUSE_CANDIDATE' if len(exact) == source['totalFrames']
        else 'EXACT_NORMAL_DAMAGED_BODY_CANDIDATE_OTHER_STATES_REQUIRE_SPECIFIC_ART'))
assert proofs[0]['exactOriginalSlots'] == [0, 1]
assert proofs[1]['exactOriginalSlots'] == list(range(32))
assert all(slot in proofs[2]['exactOriginalSlots'] for slot in [0, 1, 4, 5])
assert pin(selector) == before
result = dict(status='FOUR_COMPLETE_FAMILIES_SOURCE_AUDITED_ART_EXPORT_AND_NATIVE_PENDING',
    priorClosure=pin(PRIOR), currentSelection=read(selector), preparedGuide=pin(ROOT / 'source.json'),
    sourceContract=pin(ROOT / 'contract.json'), families=4, originalMembers=6,
    sourceBodyFrames=sum(row['bodyFrames'] for row in records),
    originalShadowFrames=sum(row['originalShadowFrames'] for row in records),
    records=records, originalGuides=original_guides, acceptedReuseCandidates=proofs,
    verifiedAcceptedPayloads=payloads,
    airportPolicy='Different original airport canvas/body/active geometry requires dedicated authoring. Preserve all twenty active slots, including native empty slots and unused phases. Use one stable fixed mechanism and original phase-specific moving parts; do not redraw the entire structure independently per frame.',
    selectionChanged=False, coverageAdded=0, userReview='Batch 85 remains a separate pending gate.',
    windows='NOT_RUN', m24Complete=False)
write(ART / 'source-and-reuse-preflight-v1.json', result)
print(json.dumps(dict(status=result['status'], families=4, sourceMembers=6,
    sourceBodyFrames=result['sourceBodyFrames'], originalShadowFrames=result['originalShadowFrames'],
    sourceGuides=len(original_guides), reuseCandidates=[dict(member=row['member'], status=row['status']) for row in proofs],
    coverageAdded=0)))
