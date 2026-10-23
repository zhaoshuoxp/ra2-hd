"""Independently verify all source slots, inherited bytes and map-dependent load families."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image
from newurban_batch93_io import ROOT, GUIDE, assemble, crop, native, pin, read, sha, write

export = read(ROOT / 'export-and-preservation-v5.json')
proof = read(ROOT / 'urban-road-reuse-preparation-v3.json')
baseline = export['baseline']
candidate = export['candidate']
base = Path('.local/terrain-packs') / baseline['revision']
destination = Path('.local/terrain-packs') / candidate['revision']
assert sha(destination / 'manifest.json') == candidate['sha256']
old, new = read(base / 'manifest.json'), read(destination / 'manifest.json')
assert len(old['groups']) == 22 and len(new['groups']) == 48
assert new['groups'][:22] == old['groups']
for group in old['groups']:
    for variant in group['variants']:
        assert sha(destination / variant['file']) == sha(base / variant['file']) == variant['sha256']
sources = {s['member']: s for s in read(ROOT / 'source.json')['sources']}
records = {r['member']: r for r in export['records']}
assert len(records) == 34
images, slots, compatibility, detail_count = [], 0, 0, 0
rows = []
for group in new['groups'][22:]:
    assert sorted(v['density'] for v in group['variants']) == [2, 4]
    count = sum(len(m['images']) for m in group['members'])
    for variant in group['variants']:
        assert max(variant['size']) <= 2048 and len(variant['rects']) == count
        assert sha(destination / variant['file']) == variant['sha256']
        assert (destination / variant['file']).stat().st_size == np.prod(variant['size']) * 4
    for member in group['members']:
        source = sources[member['member']]
        assert member['sourceHashes']['yr'] == source['sha256']
        metadata = [{k: v for k, v in i.items() if k not in ['nativeOffset', 'size', 'file', 'rgbaSha256']}
                    for i in source['images']]
        assert member['images'] == metadata
        row = dict(member=member['member'], group=group['id'], densitySlots=0)
        for density in [2, 4]:
            for frame in source['images']:
                p = crop(candidate, source['member'], frame['subTile'], density)
                before = native(source, frame)
                assert p.shape[:2] == tuple(n * density for n in frame['size'][::-1])
                assert np.array_equal(p[..., 3], before[..., 3].repeat(density, 0).repeat(density, 1))
                declared, = [f for f in records[source['member']]['frames']
                              if f['density'] == density and f['subTile'] == frame['subTile']]
                assert hashlib.sha256(p.tobytes()).hexdigest() == declared['rgbaSha256']
                if frame['nativeOffset'] <= 0:
                    assert np.array_equal(p, before.repeat(density, 0).repeat(density, 1))
                    assert declared['policy'] == 'UNREFERENCED_ZERO_POINTER_ORIGINAL_COMPATIBILITY_ONLY'
                    compatibility += 1
                else:
                    active = p[..., 3] > 0
                    enlarged = before.repeat(density, 0).repeat(density, 1)
                    assert ((p[..., :3] != enlarged[..., :3]).any(2) & active).sum() >= active.sum() * .5
                    detail_count += 1
                slots += 1
                row['densitySlots'] += 1
        rows.append(row)
for name in ['proad02.ubn', 'proad02a.ubn', 'proad02b.ubn', 'proad02c.ubn']:
    for density in [2, 4]:
        for frame in sources[name]['images']:
            assert np.array_equal(crop(candidate, name, frame['subTile'], density),
                                  crop(baseline, name, frame['subTile'], density))
for name in ['proad01.ubn', 'proad05.ubn', 'proad10.ubn', 'proad17.ubn', 'proad18.ubn', 'prslpe01.ubn', 'p_end03.ubn']:
    source = sources[name]
    for density in [2, 4]:
        panel, _ = assemble([(frame, crop(candidate, name, frame['subTile'], density))
                             for frame in source['images'] if frame['nativeOffset'] > 0], density)
        background = Image.new('RGBA', panel.size, '#101820')
        background.alpha_composite(panel)
        file = ROOT / f'{name}-{density}x-final-network.png'
        background.convert('RGB').save(file)
        images.append(pin(file))
write(ROOT / 'static-audit-v2.json', dict(status='PASS_34_COMPLETE_NEW_ROAD_SOURCES_22_EXACT_OLD_GROUPS_AND_TARGET_GEOMETRY',
    candidate=candidate, sourceDensitySlots=slots, authoredDensitySlots=detail_count,
    originalUnreferencedCompatibilityDensitySlots=compatibility, newCompleteLoadFamilies=26,
    newMembers=34, priorGroupsExact=22, priorBridgeCoreExact=4, inspection=images, rows=rows,
    policy='No source or native subtile is omitted. Each new paved-road load family contains a complete physical TMP source with every logical slot and both densities; no animation/state is split. Identical payload samples may share rectangles. Map dependencies select the needed complete source families.',
    selectedNewMothers=0, native='NOT_RUN', visual='PENDING_GROUPED_CONTEXT', windows='NOT_RUN', m24Complete=False))
assert read('desktop/terrain-theater-hd-contracts.json')['NEWURBAN'] == candidate
assert read('.local/terrain-newurban-selection.json') == candidate
for row in export['records']:
    if row['member'].startswith('prslpe'):
        continue
    for density in [2, 4]:
        for frame in sources[row['member']]['images']:
            assert np.array_equal(crop(candidate, row['member'], frame['subTile'], density),
                crop(read(ROOT / 'export-and-preservation-v4.json')['candidate'], row['member'], frame['subTile'], density))
print(dict(status='PASS_FINAL_STATIC_AND_THIRTY_NEW_SOURCE_PAYLOADS_EXACT', newMembers=34,
    densitySlots=slots, authoredDensitySlots=detail_count, inheritedNewSources=30, changedSlopes=4))
