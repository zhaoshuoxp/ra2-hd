"""Publish complete map-building families with reconstructed structural coverage."""
import argparse
import copy
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_contours import register_contours
from showcase_owner import register_owner_material
from showcase_registration import capacity, independently_sample, register, sha


def read(file):
    return json.loads(file.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('scope', type=Path)
    parser.add_argument('base', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('receipt', type=Path)
    parser.add_argument('--airport-jobs', type=Path)
    args = parser.parse_args()
    assert not args.output.exists() and not args.receipt.exists()
    scope, catalog = read(args.scope), read(args.base / 'manifest.json')
    contract = read(Path('desktop/environment-hd-contract.json'))
    assert catalog['revision'] == contract['selectedPack']['revision']
    assert sha(args.base / 'manifest.json') == contract['selectedPack']['sha256']
    sources = {row['member']: row for row in scope['baselineBuildingSources']}
    plates, authoring = {}, []
    if args.airport_jobs:
        for job_file in sorted(args.airport_jobs.glob('*/job.json')):
            job = read(job_file)
            if job.get('selected') is False:
                continue
            generation = read(job_file.parent / 'generation.json')
            assert generation['status'] == 'PASS_SOURCE_CAPACITY_PENDING_VISUAL_QA'
            master = Path(generation['master'])
            assert sha(master) == generation['masterSha256']
            assert sha(job_file.parent / 'prompt.txt') == generation['promptSha256']
            image = Image.open(master).convert('RGBA')
            for cell in job['cells']:
                rect, plate = register(image, cell, job['boardSize'], isolated=job['occupied'] == 1)
                assert capacity(rect, cell['nativeBounds']) >= 4
                for key in cell['duplicates']:
                    plates[key] = cell, plate
            authoring.append(dict(job=str(job_file.resolve()), receipt=str((job_file.parent / 'generation.json').resolve()),
                receiptSha256=sha(job_file.parent / 'generation.json'), masterSha256=sha(master)))
        assert set(plates) == {'ctairp.shp-000', 'ctairp.shp-001'}
    args.output.mkdir(parents=True)
    result = {**catalog, 'revision': args.output.name, 'families': {}}
    frames, changed_members, preserved_markers = [], [], []
    for family in scope['materialFamilies']:
        record = copy.deepcopy(catalog['families'][family])
        for entry in record['members']:
            name = entry['member']
            assert name in sources, ('Unclassified complete-family member', name)
            source = sources[name]
            native, guide = source['source'], Path(source['root'])
            old_file, file = args.base / entry['path'], args.output / entry['path']
            assert sha(old_file) == entry['sha256']
            shutil.copytree(old_file.parent, file.parent)
            manifest = read(old_file)
            assert manifest['source']['sha256'] == native['sha256']
            manifest['packRevision'] = args.output.name
            policy = dict(schema='native-structural-subpixel-coverage-v1',
                toleranceNativePixels=.7, maximumContourAreaChangeFraction=.025,
                stairCornerCutNativePixels=.5, maximumShortStairRunNativePixels=8,
                diagonalOwnerStrips='Eight-connected contour and area-preserving straight-strip reconstruction',
                tinyContourAreaPreserved=4, supersamplesPerOutputAxis=8,
                shadowContact='Exact native index-12 contact and separate shadow geometry',
                ownerShades='Nearest native owner index, all sixteen palette entries',
                authoredMaterials='Accepted RGB preserved except new coverage gutters and fractional owner boundary underpaint',
                canvasAndFrameMetadata='Exact original logical canvas, offsets, dimensions, slots and timing')
            manifest['color']['structuralCoverage'] = policy
            for variant in manifest['variants']:
                density = variant['density']
                for page in variant['pages']:
                    folder = file.parent / str(density) / page['id']
                    arrays = [np.array(Image.open(folder / filename).convert('RGBA')) for filename in ['base.png', 'data.png']]
                    base, data = arrays
                    seen = set()
                    for frame in variant['frames']:
                        if frame['page'] != page['id']:
                            continue
                        rect = tuple(frame['sampleRect'])
                        number = frame['nativeFrame']
                        original = native['frames'][number]
                        index_file = guide / 'native' / original.get('indexFile', f'{name}-{number}.index')
                        assert sha(index_file) == original['indexSha256']
                        width, height = original['size']
                        indices = np.frombuffer(index_file.read_bytes(), np.uint8).reshape(height, width)
                        if rect in seen:
                            continue
                        seen.add(rect)
                        x, y, w, h = rect
                        b, d = base[y:y+h, x:x+w].copy(), data[y:y+h, x:x+w].copy()
                        before_b, before_d = b.copy(), d.copy()
                        marker = manifest['color'].get('nativePaletteMarkerFrames', {}).get('frames', {}).get(str(number))
                        if marker or original['empty']:
                            preserved_markers.append(dict(member=name, frame=number, density=density))
                        else:
                            key = f'{name}-{number:03d}'
                            if key in plates:
                                cell, plate = plates[key]
                                left, top, right, bottom = cell['nativeBounds']
                                rgb = independently_sample(plate, ((right-left)*density, (bottom-top)*density))
                                # Restrict the image edit to the wall containing displaced
                                # lettering. The accepted hangar, fixtures and apron stay exact.
                                lx, ty, rx, by = ([14, 64, 27, 100] if number == 0 else [18, 64, 31, 78])
                                b[ty*density:by*density, lx*density:rx*density, :3] = rgb[
                                    (ty-top)*density:(by-top)*density, (lx-left)*density:(rx-left)*density]
                                rgba_file = guide / 'native' / original['file']
                                assert sha(rgba_file) == original['rgbaSha256']
                                rgba = np.asarray(Image.frombytes('RGBA', (width, height), rgba_file.read_bytes()))
                                b[:height*density, :width*density, :3] = register_owner_material(
                                    b[:height*density, :width*density, :3], rgba, indices, density)[0]
                                contact=(indices==12).repeat(density,0).repeat(density,1)
                                b[:height*density,:width*density][contact]=before_b[:height*density,:width*density][contact]
                            semantic = contract['sources'][name]
                            remap = semantic.get('framePalettes', {}).get(str(number), semantic)['remapable']
                            b, d = register_contours(b, d, indices, density, remap)
                        base[y:y+h, x:x+w], data[y:y+h, x:x+w] = b, d
                        old_area, new_area = before_d[..., 0].sum()/255, d[..., 0].sum()/255
                        assert not old_area or abs(new_area / old_area - 1) <= .06, (name, number, density, old_area, new_area)
                        assert not np.any((d[..., 0] > 0) & (b[..., 3] == 0))
                        assert d[..., 1].max(initial=0) <= 15 and not d[..., 2].any() and (d[..., 3] == 255).all()
                        frames.append(dict(member=name, frame=number, density=density,
                            alphaChangedPixels=int((b[..., 3] != before_b[..., 3]).sum()),
                            alphaFractionalPixels=int(((b[..., 3] > 0) & (b[..., 3] < 255)).sum()),
                            ownerChangedPixels=int((d[..., 0] != before_d[..., 0]).sum()),
                            ownerFractionalPixels=int(((d[..., 0] > 0) & (d[..., 0] < 255)).sum()),
                            ownerAreaBefore=float(old_area), ownerAreaAfter=float(new_area),
                            nativeIndexSha256=original['indexSha256']))
                    for array, filename, field in zip(arrays, ['base.png', 'data.png'], ['baseSha256', 'dataSha256']):
                        Image.fromarray(array).save(folder / filename)
                        page[field] = sha(folder / filename)
                        page[field.replace('Sha256', 'Bytes')] = (folder / filename).stat().st_size
            file.write_text(json.dumps(manifest, separators=(',', ':')) + '\n')
            entry['sha256'] = sha(file)
            changed_members.append(name)
        result['families'][family] = record
    output_manifest = args.output / 'manifest.json'
    output_manifest.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    report = dict(schema='m2-3-r5-building-contour-export-v1', status='PASS_COMPLETE_FAMILIES_VALID_COVERAGE',
        baseManifestSha256=sha(args.base/'manifest.json'), outputManifestSha256=sha(output_manifest),
        scopeSha256=sha(args.scope), families=len(result['families']), members=changed_members,
        authoring=authoring, preservedNativeMarkers=preserved_markers, frames=frames,
        exporterSources=[dict(file=str(p.resolve()),sha256=sha(p)) for p in
            [Path(__file__),Path(__file__).resolve().parents[1]/'showcase_contours.py']],
        logicalGeometry='UNCHANGED', runtime='PENDING', visualAcceptance='PENDING')
    args.receipt.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k:v for k,v in report.items() if k not in ['frames','members','authoring','preservedNativeMarkers']}))


if __name__ == '__main__':
    main()
