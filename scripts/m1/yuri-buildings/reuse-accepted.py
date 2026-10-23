"""New YR contracts from accepted full-density art, without changing RA2 packs.

Reconstruct each accepted frame at its original canvas coordinates, translate
the complete NAPSIS art by the canvas-center delta, then apply YR source trims.
No per-frame rescaling, recoloring or regenerated mask is performed.
"""
import json
import sys
from functools import lru_cache
from pathlib import Path
from PIL import Image
from production_common import ROOT, Family, sha, indices, decode

OUTPUT = sys.argv[1]
reuse = json.loads((ROOT / 'reuse-native-v2.json').read_text())


@lru_cache(maxsize=24)
def page(path, digest):
    assert sha(path) == digest, ('Accepted page changed', path)
    return Image.open(path).convert('RGBA')


for identity in ('NAPSIS', 'NACLON'):
    for theater in ('TEMPERATE', 'SNOW'):
        evidence = next(r for r in reuse['rows'] if (r['id'], r['theater']) == (identity, theater))
        family_path = Path('.local') / evidence['acceptedFamilyPath']
        accepted = json.loads(family_path.read_text())
        for density in (2, 4):
            f = Family(identity, theater, density, OUTPUT)
            for index, member in enumerate(f.row['members']):
                binding = accepted['members'][index]
                manifest_path = Path('.local/hd-packs') / binding['packId'] / binding['revision'] / 'manifest.json'
                assert sha(manifest_path) == binding['sha256'] == evidence['members'][index]['manifestHash']
                manifest = json.loads(manifest_path.read_text())
                variant = next(v for v in manifest['variants'] if v['density'] == density)
                logical = manifest['logical']
                shadow_tail = (identity == 'NACLON' and 'ACTIVE' in member['roles']
                               and len(logical['frames']) * 2 == member['visibleFrames'])
                assert len(logical['frames']) == member['visibleFrames'] or shadow_tail
                dx, dy = [(member['canvas'][i] - logical['canvas'][i]) // 2 for i in range(2)]
                assert [dx * 2, dy * 2] == [member['canvas'][i] - logical['canvas'][i] for i in range(2)]
                assert (dx, dy) == ((-1, 1) if identity == 'NAPSIS' else (0, 0))
                f.registrations.append({'source': str(manifest_path), 'sourceHash': sha(manifest_path),
                    'acceptedFamily': str(family_path), 'acceptedFamilyHash': sha(family_path),
                    'sourceDensity': density, 'exportDensity': density, 'logicalTranslation': [dx, dy],
                    'physicalTranslation': [dx * density, dy * density], 'scale': [1, 1],
                    'upsampling': False, 'mask': 'Accepted pixels and categorical shades retained',
                    'rule': 'Constant canvas-center translation; YR native trim/empty slots applied independently'})
                for n, old in enumerate(logical['frames']):
                    placement = variant['frames'][n]
                    assert placement['nativeFrame'] == n
                    p = next(p for p in variant['pages'] if p['id'] == placement['page'])
                    x, y, width, height = placement['sampleRect']
                    assert [width, height] == [v * density for v in old['legacyRenderSize']]
                    image = f.blank()
                    data = Image.new('RGBA', f.size, (0, 0, 0, 255))
                    offset = tuple((old['trimOrigin'][i] + (dx, dy)[i]) * density for i in range(2))
                    for role, target in (('base', image), ('data', data)):
                        atlas = page(str(manifest_path.parent / p[role]), p[role + 'Sha256'])
                        patch = atlas.crop((x, y, x + width, y + height))
                        target.paste(patch, offset)
                    f.put(member, n, image,
                        'Accepted same-density complete state; fixed canvas-center translation; native YR trim, empty and shadow contracts', data)
                if shadow_tail:
                    # YR omits Shadow=yes in the active declaration, exposing
                    # 44 contract slots, although both native loops use 0..20.
                    # These additional indexed shadow-control slots are data,
                    # not newly authored photographic material.
                    for n in range(len(logical['frames']), member['visibleFrames']):
                        assert set(indices(member, n).ravel()) <= {0, 1}, ('Unexpected non-control tail', n)
                        image = decode(f.row, member, n).resize(f.size, Image.Resampling.NEAREST)
                        data = Image.new('RGBA', f.size, (0, 0, 0, 255))
                        f.put(member, n, image,
                            'Retained indexed native shadow-control tail outside normal/damaged loops; no new photographic detail claim', data)
            f.export()
            page.cache_clear()
