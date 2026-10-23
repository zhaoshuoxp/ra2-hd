"""Reuse audited flag material while rebuilding current native slot metadata."""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from showcase_registration import sha


def accepted_flag_components(profile, native, prepared):
    declaration = profile.get('acceptedExactFlagComponents')
    if not declaration:
        return {}, {}
    proof_path, guides_root = Path(declaration['proof']), Path(declaration['originalGuides'])
    assert sha(proof_path) == declaration['proofSha256']
    proof = json.loads(proof_path.read_text())
    assert proof['status'] == 'PASS_PRIOR_FLAG_REUSE_EVIDENCE_CURRENT_NATIVE_INPUT_AND_ACCEPTED_PAYLOADS_PINNED'
    assert sha(prepared / 'source.json') == proof['currentNative']['sha256']
    audit_path = Path(proof['priorFlagAudit']['path'])
    assert sha(audit_path) == proof['priorFlagAudit']['sha256']
    audit = json.loads(audit_path.read_text())
    assert audit['status'] == 'PASS_SOURCE_GEOMETRY_INDICES_FIXED_PALETTE_AND_ACCEPTED_PAYLOADS'
    guides_file = guides_root / 'source.json'
    assert sha(guides_file) == declaration['originalGuidesSha256']
    guides = {s['snow']: s for s in json.loads(guides_file.read_text())['sources']}
    allowed = {'caoild_f.shp', 'cahosp_f.shp', 'caairp_f.shp', 'caoutp_f.shp'}
    assert {r['snow'] for r in audit['rows']} == allowed
    components, evidence = {}, {}
    for row in audit['rows']:
        name, source, donor = row['snow'], native[row['snow']], guides[row['snow']]
        assert source['sha256'] == row['snowSourceSha256']
        assert donor['sha256'] == row['tempSourceSha256']
        assert source['canvas'] == donor['canvas']
        metadata_path = Path(row['acceptedMetadata'])
        assert sha(metadata_path) == row['acceptedMetadataSha256']
        metadata = json.loads(metadata_path.read_text())
        assert metadata['source']['sha256'] == donor['sha256']
        palette = np.frombuffer((prepared / 'native' / (source['palette']['sha256'] + '.pal')).read_bytes(), np.uint8).reshape(256, 3)
        donor_palette = np.frombuffer((guides_root / (donor['palette']['sha256'] + '.pal')).read_bytes(), np.uint8).reshape(256, 3)
        body = source['totalFrames'] // (2 if source['hasShadow'] else 1)
        for frame in source['frames'][:body]:
            if frame['empty']:
                continue
            original = donor['frames'][frame['slot']]
            assert frame['origin'] == original['origin'] and frame['size'] == original['size']
            assert frame['indexSha256'] == original['indexSha256']
            assert sha(guides_root / original['file']) == original['indexSha256']
            indices = np.frombuffer((prepared / 'native' / frame['indexFile']).read_bytes(), np.uint8)
            fixed = np.unique(indices[(indices != 0) & ((indices < 16) | (indices > 31))])
            assert np.array_equal(palette[fixed], donor_palette[fixed])
        pages = {}
        for variant in metadata['variants']:
            density = variant['density']
            assert density in (2, 4)
            for page in variant['pages']:
                file = metadata_path.parent / str(density) / page['id'] / 'base.png'
                assert sha(file) == page['baseSha256']
                data = metadata_path.parent / str(density) / page['id'] / 'data.png'
                assert sha(data) == page['dataSha256']
                pages[density, page['id']] = np.asarray(Image.open(file).convert('RGBA'))
        components[name] = (metadata, pages)
        evidence[name] = dict(proofSha256=declaration['proofSha256'],
            donorMetadataSha256=row['acceptedMetadataSha256'], donorSourceSha256=donor['sha256'],
            targetSourceSha256=source['sha256'],
            policy='Accepted material only; fresh target geometry, owner data, empty slots and native shadows.')
    return components, evidence


def flag_frame_material(component, frame, density):
    metadata, pages = component
    variant, = [v for v in metadata['variants'] if v['density'] == density]
    record = variant['frames'][frame['slot']]
    logical = metadata['logical']['frames'][frame['slot']]
    assert logical['trimSize'] == frame['size'] and logical['trimOrigin'] == frame['origin']
    x, y, width, height = record['contentRect']
    assert [width, height] == [n * density for n in frame['size']]
    return pages[density, record['page']][y:y + height, x:x + width, :3].copy()


def accepted_outpost_motion(profile, native, prepared):
    """Transfer complete metal material only when native motion and ownership match."""
    declaration = profile.get('acceptedOutpostMotionMaterials')
    if not declaration:
        return {}, {}
    root = Path(declaration['originalGuides'])
    assert sha(root / 'source.json') == declaration['originalGuidesSha256']
    guides = {s['snow']: s for s in json.loads((root / 'source.json').read_text())['sources']}
    audit_path = Path(declaration['componentAudit'])
    assert sha(audit_path) == declaration['componentAuditSha256']
    audit = json.loads(audit_path.read_text())
    assert audit['nativeSourceSha256'] == sha(prepared / 'source.json')
    allowed = {'caoutp_d.shp', 'caoutp_a.shp', 'caoutp_b.shp', 'caoutp_c.shp'}
    rows = {r['snow']: r for r in audit['rows']}
    components, evidence = {}, {}
    for name in sorted(allowed):
        source, donor, row = native[name], guides[name], rows[name]
        assert source['sha256'] == row['snowSourceSha256']
        assert donor['sha256'] == row['tempSourceSha256']
        assert source['canvas'] == donor['canvas'] and source['hasShadow'] and source['remapable']
        body = source['totalFrames'] // 2
        assert body == len(donor['frames'])
        assert all(b['id'] == 'CAOUTP' and b['role'] in {'IDLE', 'SPECIAL'} for b in source['bindings'])
        palette = np.frombuffer((prepared / 'native' / (source['palette']['sha256'] + '.pal')).read_bytes(), np.uint8).reshape(256, 3)
        donor_palette = np.frombuffer((root / (donor['palette']['sha256'] + '.pal')).read_bytes(), np.uint8).reshape(256, 3)
        differences = []
        for target, original in zip(source['frames'][:body], donor['frames']):
            assert target['origin'] == original['origin'] and target['size'] == original['size']
            assert sha(prepared / 'native' / target['indexFile']) == target['indexSha256']
            assert sha(root / original['file']) == original['indexSha256']
            a = np.frombuffer((prepared / 'native' / target['indexFile']).read_bytes(), np.uint8)
            b = np.frombuffer((root / original['file']).read_bytes(), np.uint8)
            assert np.array_equal(a != 0, b != 0), 'Different motion silhouette requires new artwork'
            owner_a, owner_b = (a >= 16) & (a <= 31), (b >= 16) & (b <= 31)
            assert np.array_equal(owner_a, owner_b) and np.array_equal(a[owner_a], b[owner_b])
            # Distinct original quantization is retained in the evidence. Only
            # unchanged indices require identical fixed palette interpretation.
            fixed = np.unique(a[(a == b) & (a != 0) & ~owner_a])
            assert np.array_equal(palette[fixed], donor_palette[fixed])
            visible = (a != 0) & (a != 12) & ~owner_a
            color_delta = np.abs(palette[a].astype(int) * 4 - donor_palette[b].astype(int) * 4).max(1)[visible]
            differences.append(dict(frame=target['slot'], indexedMaterialDifferences=int((a != b).sum()),
                targetNativeContactPixels=int((a == 12).sum()),
                maximumOriginalRgbDifference=int(color_delta.max()) if color_delta.size else 0,
                p99OriginalRgbDifference=float(np.percentile(color_delta, 99)) if color_delta.size else 0))
        file = Path(row['acceptedMetadata'])
        assert sha(file) == row['acceptedMetadataSha256']
        metadata = json.loads(file.read_text())
        assert metadata['source']['sha256'] == donor['sha256']
        pages = {}
        for variant in metadata['variants']:
            for page in variant['pages']:
                for role in ['base', 'data']:
                    atlas = file.parent / str(variant['density']) / page['id'] / (role + '.png')
                    assert sha(atlas) == page[role + 'Sha256']
                pages[variant['density'], page['id']] = np.asarray(Image.open(
                    file.parent / str(variant['density']) / page['id'] / 'base.png').convert('RGBA'))
        components[name] = metadata, pages
        evidence[name] = dict(classification='GEOMETRY_MATCHED_ACCEPTED_MECHANICAL_MATERIAL_REUSE',
            donorMetadataSha256=row['acceptedMetadataSha256'], donorSourceSha256=donor['sha256'],
            targetSourceSha256=source['sha256'], frameComparison=differences,
            policy='Same native moving silhouette, offsets, unchanged fixed-palette interpretation and owner shades; accepted metal detail reused. Target contacts, shadows, rules and timing retained. Distinct original indexed shading and RGB differences are recorded, not labeled byte-identical.')
    return components, evidence
