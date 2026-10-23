"""Compare selected faction-building owner channels against pinned native indices."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from selected_building_pixels import frame_pixels, read_page


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('selection', type=Path)
    parser.add_argument('native', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    assert not args.output.exists(), 'Preserve previous evidence.'
    selection = json.loads(args.selection.read_text())
    native = json.loads((args.native / 'source.json').read_text())
    assert not native['failures']
    sources = {row['key']: row for row in native['sources']}
    records, geometry_findings = [], []
    for member in selection['members']:
        file = Path(member['file'])
        assert sha(file) == member['sha256']
        manifest = json.loads(file.read_text())
        source = sources[f"{member['source']['member']}:{member['source']['sha256']}"]
        logical = {frame['nativeFrame']: frame for frame in manifest['logical']['frames']}
        assert manifest['logical']['canvas'] == source['canvas']
        for variant in manifest['variants']:
            density, pages = variant['density'], {}
            for frame in variant['frames']:
                number = frame['nativeFrame']
                original, declaration = source['frames'][number], logical[number]
                assert original['origin'] == declaration['trimOrigin']
                assert original['size'] == declaration['trimSize']
                width, height = original['size']
                index_file = args.native / original['file']
                assert sha(index_file) == original['sha256']
                indices = np.frombuffer(index_file.read_bytes(), np.uint8).reshape(height, width)
                indices = indices.repeat(density, 0).repeat(density, 1)
                native_owner = (indices >= 16) & (indices <= 31)
                if frame['page'] not in pages:
                    page = next(page for page in variant['pages'] if page['id'] == frame['page'])
                    pages[frame['page']] = read_page(file.parent, page)
                arrays = pages[frame['page']]
                x, y, w, h = frame['contentRect']
                assert (w, h) == (width * density, height * density)
                page_size = arrays.get('map', arrays['base']).shape[:2]
                page_scale = 4 if 'map' in arrays else 1
                if y + h > page_size[0] * page_scale or x + w > page_size[1] * page_scale:
                    geometry_findings.append(dict(manifest=str(file), density=density, frame=number,
                        contentRect=frame['contentRect'], actualVirtualSize=[page_size[1] * page_scale, page_size[0] * page_scale],
                        status='FRAME_EXCEEDS_ACTUAL_VIRTUAL_PAGE'))
                    continue
                base, data = frame_pixels(arrays, frame['contentRect'])
                owner, visible = data[..., 0] > 0, base[..., 3] > 0
                missing = native_owner & ~owner
                red, green, blue = np.moveaxis(base[..., :3].astype(float), 2, 0)
                red_paint = (red > 35) & (red > green * 1.5) & (red > blue * 1.5) & (green - blue < (red - blue) * .25)
                purple_paint = (blue > red * 1.1) & (red > green * 1.5) & (blue-green > 25)
                paint = red_paint | (purple_paint if member['source']['member'].startswith(('y', 'ngtbnk', 'natbnk', 'nntbnk')) else False)
                records.append(dict(member=member['source']['member'], manifest=str(file), density=density,
                    frame=number, nativeOwnerPixels=int(native_owner.sum()), actualOwnerPixels=int(owner.sum()),
                    missingNativeOwnerPixels=int(missing.sum()), missingVisibleNativeOwnerPixels=int((missing & visible).sum()),
                    ownerPixelsOutsideNativeRegion=int((owner & ~native_owner).sum()),
                    nativeShadeMismatches=int((data[..., 1][native_owner & owner] != indices[native_owner & owner] - 16).sum()),
                    nativeSupportedUnmaskedOwnerPaint=int((missing & visible & paint).sum()),
                    invalidOwnerShades=int(((data[..., 1] > 15) & owner).sum()),
                    ownerPixelsOutsideVisibleBody=int((owner & ~visible).sum())))
    findings = [row for row in records if row['nativeSupportedUnmaskedOwnerPaint'] or row['invalidOwnerShades']]
    result = dict(schema='m2-3-selected-faction-building-owner-audit-v1',
        status='FINDINGS_REQUIRE_GEOMETRY_AWARE_REVIEW' if findings or geometry_findings else 'PASS_NATIVE_OWNER_COVERAGE',
        selectedManifests=len(selection['members']), uniqueNativeMembers=len(sources), densityFrames=len(records),
        framesWithNativeOwner=sum(row['nativeOwnerPixels'] > 0 for row in records),
        framesWithFindings=len(findings), geometryFindings=geometry_findings, records=records, findings=findings,
        policy='Historical faction artwork preserves authored geometry and paint components; native pixel differences are findings, not automatically defects.',
        nativeRuntimeOwnerChange='PENDING')
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({key: value for key, value in result.items() if key not in ['records', 'findings', 'geometryFindings']}))


if __name__ == '__main__':
    main()
