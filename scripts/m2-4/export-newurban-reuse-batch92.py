"""Export five complete accepted-art families with target-owned native headers."""
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image
from newurban_batch89_io import atlas, logical, pin, read, sha, write
from newurban_batch92_materials import adapt, native_registered, warm_material_fit

ROOT = Path('.artifacts/m2-4/newurban-cross-name-reuse-batch92-20261020')
GUIDE = Path('.artifacts/m2-4/newurban-native-v1')
PRIOR = Path('.artifacts/m2-4/newurban-anchored-buildings-batch91-20261020')
assert read(PRIOR / 'user-acceptance-20261020.json')['status'] == 'USER_ACCEPTED_NEWURBAN_ACCEPTED_ART_REUSE_BATCH91'
baseline = read('desktop/environment-newurban-hd-contract.json')
assert baseline['selectedPack'] == read('.local/environment-newurban-selection.json')
assert baseline['selectedPack'] == read(PRIOR / 'export-and-preservation-v2.json')['candidate']
for name, file in [('baseline-contract.json', Path('desktop/environment-newurban-hd-contract.json')),
                   ('baseline-selector.json', Path('.local/environment-newurban-selection.json'))]:
    with (ROOT / name).open('xb') as stream:
        stream.write(file.read_bytes())
os.symlink((GUIDE / 'native').resolve(), ROOT / 'native')
donors = read(ROOT / 'selected-donor-inputs-v1.json')['records']
analysis = {r['member']: r for r in read(ROOT / 'registered-native-analysis-v1.json')['rows']}
guide = read(GUIDE / 'source.json')
sources = [s for s in guide['sources'] if s['member'] in {d['targetMember'] for d in donors}]
write(ROOT / 'source.json', dict(schema=guide['schema'], theater='NEWURBAN', originalGuide=pin(GUIDE / 'source.json'), sources=sources))
iso = dict(member='isoubn.pal', archive='ra2md.mix/cachemd.mix',
    sha256='1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676', bytes=768)
revision = 'newurban-environment-cross-name-reuse-batch92-v1-combined'
destination = Path('.local/environment-packs') / revision
destination.mkdir(exist_ok=False)
base = Path('.local/environment-packs') / baseline['selectedPack']['revision']
manifest = read(base / 'manifest.json')
preserved, originals, records = {}, {}, []
for file in base.rglob('*'):
    if file.is_file() and file != base / 'manifest.json':
        relative = file.relative_to(base)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        os.link(file, target)
        preserved[str(relative)] = sha(file)
combined = copy.deepcopy(baseline)
for donor in donors:
    source, = [s for s in sources if s['member'] == donor['targetMember']]
    name = source['member']
    count = source['totalFrames'] // (2 if source['hasShadow'] else 1)
    assert count == len(donor['frames'])
    frames = [logical(f) for f in source['frames'][:count]]
    metadata_file = Path(donor['acceptedMetadata']['file'])
    assert pin(metadata_file) == donor['acceptedMetadata']
    metadata = read(metadata_file)
    folder = destination / 'members' / name.replace('.', '-')
    folder.mkdir(parents=True)
    variants, adaptations = [], []
    color_matrix, color_proof = None, None
    if name == 'cnpars05.shp':
        target, old = source['frames'][3], donor['frames'][3]
        b = np.fromfile(GUIDE / 'native' / target['indexFile'], np.uint8).reshape(target['size'][::-1])
        a = np.fromfile(old['index']['file'], np.uint8).reshape(old['size'][::-1])
        a = native_registered(a, target['size'], analysis[name]['slots'][3]['offset'])
        ap = np.fromfile(old['palette']['file'], np.uint8).reshape(256, 3).astype(float) * 4
        bp = np.fromfile(GUIDE / 'native' / (iso['sha256'] + '.pal'), np.uint8).reshape(256, 3).astype(float) * 4
        color_matrix, color_proof = warm_material_fit(a, b, ap, bp)
    for density in [2, 4]:
        images = {}
        for slot in range(count):
            target, old = source['frames'][slot], donor['frames'][slot]
            b = np.fromfile(GUIDE / 'native' / target['indexFile'], np.uint8).reshape(target['size'][::-1])
            a = np.fromfile(old['index']['file'], np.uint8).reshape(old['size'][::-1])
            body, data, record = adapt(metadata_file, slot, density, target, old, b, a,
                analysis[name]['slots'][slot]['offset'], name, color_matrix if slot == 3 else None)
            images[slot] = body, data
            adaptations.append(record)
            if name != 'cnfncp.shp':
                picture = Image.new('RGBA', (body.shape[1], body.shape[0]), '#101820')
                picture.alpha_composite(Image.fromarray(body))
                picture.convert('RGB').save(ROOT / f'{name}-{slot}-{density}x-adapted.png')
        variants.append(atlas(folder, frames, images, density))
    metadata.update(packId='environment-' + name.replace('.', '-'), packRevision=revision,
        source=dict(member=name, sha256=source['sha256'], theater='NEWURBAN', kind='resolved-shp-member'),
        logical=dict(canvas=source['canvas'], frames=frames), variants=variants)
    metadata['color'].pop('authoredFrameCoverage', None)
    metadata['color']['acceptedArtworkRegistration'] = dict(donor=donor['acceptedMetadata'],
        analysis=pin(ROOT / 'registered-native-analysis-v1.json'), targetNativeHeadersAuthoritative=True,
        adaptations=adaptations, materialTransform=color_proof, selectedNewMothers=0,
        policy='Reuse accepted authored geometry and continuous texture. Register native canvas differences and preserve original target owner/contact semantics. Only CAPARS05 rubble receives a smooth warm material transform; no source pixel grain, new texture or image interpolation is introduced.')
    file = folder / 'manifest.json'
    write(file, metadata)
    identities = sorted({b['id'] for b in source['bindings']})
    family = 'newurban-' + identities[0].lower()
    descriptor = copy.deepcopy(donor['descriptor'])
    descriptor.update(sha256=source['sha256'], canvas=source['canvas'], totalFrames=source['totalFrames'],
        bodyFrames=count, palette=source['palette'], hasShadow=source['hasShadow'], remapable=source['remapable'])
    descriptor['framePalettes'] = {str(i): dict(**source['palette'], role='body',
        remapable=source['remapable'], runtimeUsed=True) for i in range(count)}
    if name != 'cnfncp.shp':
        descriptor['framePalettes']['3'] = dict(**iso, role='rubble', remapable=False, runtimeUsed=True)
    combined['sources'][name] = descriptor
    basis = dict(theater='NEWURBAN', members={name: descriptor}, identities=identities)
    family_hash = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    combined['families'][family] = dict(members=[name], identities=identities,
        kinds=sorted({b['kind'] for b in source['bindings']}), editions=['yr'], familyHash=family_hash)
    for identity in identities:
        combined['identities']['yr'][identity] = family
    manifest['families'][family] = dict(familyHash=family_hash,
        members=[dict(member=name, path=str(file.relative_to(destination)), sha256=sha(file))])
    for relative in [source['nativeFile'], source['palette']['sha256'] + '.pal'] + [
            f[key] for f in source['frames'] for key in ['file', 'indexFile']]:
        original = GUIDE / 'native' / relative
        originals[str(original)] = pin(original)
    records.append(dict(member=name, family=family, identities=identities, bodySlots=count,
        metadata=pin(file), donorMetadata=donor['acceptedMetadata'], donorMember=donor['member'],
        donorTheater=donor['theater'], sourceSha256=source['sha256'], adaptations=adaptations,
        materialTransform=color_proof, mapIds=sorted({m for b in source['bindings'] for m in b['mapIds']})))
manifest['revision'] = revision
write(destination / 'manifest.json', manifest)
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
combined['selectedPack'] = candidate
combined.setdefault('extensions', {})['crossNameReuseBatch92'] = dict(source=pin(ROOT / 'source.json'),
    crossNameAudit=pin(ROOT / 'cross-name-donor-audit-v1.json'), families=5, newMothers=0)
write(ROOT / 'contract-candidate-v1.json', combined)
write(ROOT / 'export-and-preservation-v1.json', dict(status='EXPORTED_FIVE_COMPLETE_REUSED_FAMILIES_NOT_SELECTED',
    candidate=candidate, records=records, originalFiles=list(originals.values()),
    inheritedPriorFamilies=len(baseline['families']), preservedPayloadHashes=preserved,
    completeFamilies=5, sourceMembers=5, sourceDensitySlots=96, originalShadowSlots=48,
    selectedNewMothers=0, changedArtwork='CAPARS05 rubble warm material and bounded native owner/contact registration',
    native='NOT_RUN', visual='PENDING_CHANGED_MATERIAL_AND_NATIVE_CONTEXT', windows='NOT_RUN', m24Complete=False))
print(dict(candidate=candidate, completeFamilies=5, densitySlots=96, newMothers=0))
