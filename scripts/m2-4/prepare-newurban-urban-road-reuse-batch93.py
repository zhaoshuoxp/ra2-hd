"""Prefer accepted Urban variants where NewUrban changes a dirt junction into paving."""
from pathlib import Path
import numpy as np
from PIL import Image
from newurban_batch93_io import ROOT, GUIDE, crop, native, pin, read, sha, write

first = read(ROOT / 'road-reuse-preparation-v1.json')
urban_guide = Path('.artifacts/m2-4/urban-native-v2/source.json')
urban_native = urban_guide.parent / 'native'
accepted = read('.local/terrain-urban-selection.json')
base = Path('.local/terrain-packs') / accepted['revision']
assert sha(base / 'manifest.json') == accepted['sha256']
manifest = read(base / 'manifest.json')
targets = {s['member']: s for s in read(GUIDE / 'source.json')['sources']}
donors = read(urban_guide)['sources']
records = []
preferred_temperate = {f'proad{n:02d}.ubn' for n in [10, 11, 12, 13, 14, 15]}
preferred_temperate |= {'p_end01.ubn', 'p_end03.ubn'}
preferred_temperate |= {f'prslpe{n:02d}.ubn' for n in range(1, 5)}
for old in first['records']:
    name = old['targetMember']
    member = name.replace('.ubn', '.urb')
    groups = [g for g in manifest['groups'] if any(m['member'] == member for m in g['members'])]
    if groups and name not in preferred_temperate:
        group, = groups
        definition, = [m for m in group['members'] if m['member'] == member]
        source, = [s for s in donors if s['member'] == member and s['sha256'] in definition['sourceHashes'].values()]
        pointer = accepted
        original = pin(urban_native / source['nativeFile'])
        theater = 'URBAN'
    else:
        assert name in preferred_temperate
        member = old['donorMember']
        group = dict(id=old['donorGroup'])
        source = dict(images=old['images'], sha256=old['donorOriginal']['sha256'])
        pointer = first['acceptedTemperate']
        original = old['donorOriginal']
        theater = 'TEMPERATE'
    target = targets[name]
    assert sha(original['file']) == source['sha256']
    assert len(source['images']) == len(target['images'])
    frames = []
    for a, b in zip(source['images'], target['images'], strict=True):
        for key in ['subTile', 'grid', 'block', 'origin', 'height', 'hasZData']:
            assert a[key] == b[key], (name, a['subTile'], key)
        differences = {key: dict(donor=a[key], target=b[key]) for key in ['logical', 'offset', 'hasExtraData']
                       if a[key] != b[key]}
        file = urban_native / a['file'] if theater == 'URBAN' else Path(a['rgba']['file'])
        assert sha(file) == (a['rgbaSha256'] if theater == 'URBAN' else a['rgba']['sha256'])
        aa = np.fromfile(file, np.uint8).reshape(*reversed(a['size']), 4)
        bb = native(target, b)
        canvas = Image.new('RGBA', tuple(b['size']))
        delta = tuple(int(n) for n in np.array(a['offset']) - b['offset'])
        canvas.paste(Image.fromarray(aa), delta)
        aa = np.array(canvas)
        active = (aa[..., 3] > 0) & (bb[..., 3] > 0)
        correlation = float(np.corrcoef(aa[..., :3][active].mean(1), bb[..., :3][active].mean(1))[0, 1]) if active.any() else 1
        frames.append(dict(slot=a['subTile'], donorOriginal=pin(file), targetOriginal=pin(GUIDE / 'native' / b['file']),
            rectangleDifferences=differences, donorToTargetOffset=list(delta),
            alphaDifferences=int((aa[..., 3] != bb[..., 3]).sum()),
            differingRgb=int((np.any(aa[..., :3] != bb[..., :3], axis=2) & active).sum()),
            luminanceCorrelation=correlation,
            originalRgbRmse=float(np.sqrt(np.mean((aa[..., :3][active].astype(float) - bb[..., :3][active]) ** 2))) if active.any() else 0))
    records.append(dict(targetMember=name, donorMember=member, donorGroup=group['id'], donorTheater=theater,
        acceptedPack=pointer,
        donorSourceSha256=source['sha256'], targetSourceSha256=target['sha256'],
        targetSet=target['setIndex'], alreadySelected=old['alreadySelected'], frames=frames,
        originalDonor=original, mapIds=old['mapIds']))
style = {}
for density in [2, 4]:
    values = {}
    for label, pointer, name in [('newurban', first['baselineNewUrban'], 'proad02.ubn'),
                                 ('urban', accepted, 'proad02.urb')]:
        pixels = np.concatenate([crop(pointer, name, slot, density).reshape(-1, 4) for slot in range(3)])
        rgb = pixels[..., :3].astype(float)
        asphalt = (pixels[..., 3] > 0) & (rgb.max(1) < 130) & (np.ptp(rgb, axis=1) < 35)
        values[label] = rgb[asphalt].mean(0).tolist()
    style[str(density)] = values
write(ROOT / 'urban-road-reuse-preparation-v3.json', dict(
    status='PASS_38_NATIVE_ROAD_POSES_WITH_EXPLICIT_TARGET_RECTANGLE_REGISTRATION_NOT_SELECTION',
    acceptedUrban=accepted, baselineNewUrban=first['baselineNewUrban'], targetGuide=pin(GUIDE / 'source.json'),
    urbanGuide=pin(urban_guide), priorTemperateScreen=pin(ROOT / 'road-reuse-preparation-v1.json'),
    records=records, asphaltComparison=style,
    correction='Temperate dirt-road junctions are meaningful material differences. Accepted Urban variants depict the actual NewUrban paved junctions. Accepted Temperate curves, ends and slopes match their target forms more closely. Compare defining native structure and material before choosing a donor; source names or correlation alone are insufficient.',
    policy='All geometry, source slot order, terrain rules and depth remain target-owned. Color correlation is supporting evidence, not sole eligibility. Original raster holes do not justify redrawing accepted road geometry.',
    windows='NOT_RUN', m24Complete=False))
print(dict(members=len(records), newMembers=sum(not r['alreadySelected'] for r in records),
    alphaDifferences=sum(f['alphaDifferences'] for r in records for f in r['frames']),
    minimumCorrelation=min(f['luminanceCorrelation'] for r in records for f in r['frames']), asphalt=style))
