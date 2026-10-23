"""Read accepted body states whose original geometry, color and owner data match exactly."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from showcase_registration import sha


def accepted_body_frames(profile, native):
    result = {}
    for name, declaration in profile.get('acceptedNativeBodyFrames', {}).items():
        assert native[name]['sha256'] == declaration['sourceSha256']
        proof_file = Path(declaration['proofFile'])
        assert sha(proof_file) == declaration['proofSha256']
        proof = json.loads(proof_file.read_text())
        assert proof['status'] == 'PASS_READ_ONLY_RENDERED_BODY_COMPARISON_NOT_FAMILY_COVERAGE'
        row, = [row for row in proof['rows'] if row['member'] == name and row['sourceSha256'] == native[name]['sha256']]
        assert row['donorMember'] == declaration['donorMember']
        manifest_file = Path(declaration['manifestFile'])
        assert sha(manifest_file) == declaration['manifestSha256']
        manifest = json.loads(manifest_file.read_text())
        assert manifest['source']['member'] == row['donorMember']
        assert manifest['source']['sha256'] == row['donorSourceSha256']
        assert manifest['logical']['canvas'] == native[name]['canvas']
        assert manifest['color'].get('structuralCoverage') == profile.get('nativeStructuralCoverage')
        unused_rubble = declaration.get('sourceIdenticalUnusedRubble') is True
        complete_animation = declaration.get('completeOriginalAnimation') is True
        normal_damaged = declaration.get('sourceIdenticalNormalDamagedOnly') is True
        complete_body = declaration.get('completeSingleFrameBody') is True
        assert sum([unused_rubble, complete_animation, normal_damaged, complete_body]) <= 1
        if complete_animation:
            count = native[name]['totalFrames'] // (2 if native[name]['hasShadow'] else 1)
            assert all(binding['role'] == 'ACTIVE' for binding in native[name]['bindings'])
            assert declaration['slots'] == list(range(count))
            assert count == row['targetBodyFrames'] == row['donorBodyFrames'] == len(manifest['logical']['frames'])
            assert all(slot['status'] == 'ELIGIBLE_EXACT_RENDERED_BODY_DONOR' for slot in row['slots'])
        elif unused_rubble:
            assert declaration['slots'] == [0, 1, 2, 3]
            assert native[name]['sha256'] == row['donorSourceSha256']
            assert str(native[name]['nativeRules'].get('LeaveRubble', 'no')).lower() not in ('yes', 'true', '1')
            assert row['slots'][3]['sameGeometry'] and row['slots'][3]['differingNativeIndices'] == 0
        elif normal_damaged or complete_body:
            count = native[name]['totalFrames'] // (2 if native[name]['hasShadow'] else 1)
            assert all(binding['role'] == 'body' for binding in native[name]['bindings'])
            assert count == row['targetBodyFrames'] == row['donorBodyFrames'] == len(manifest['logical']['frames'])
            assert declaration['slots'] == ([0, 1] if normal_damaged else [0])
            assert count == (4 if normal_damaged else 1)
            if complete_body:
                assert native[name]['sha256'] == row['donorSourceSha256']
            for number in declaration['slots']:
                slot = row['slots'][number]
                assert slot['sameGeometry'] and slot['differingNativeIndices'] == 0
                assert slot['nativeIndexSha256'] == native[name]['frames'][number]['indexSha256']
                assert slot['paletteSha256'] == native[name]['palette']['sha256']
        else:
            assert declaration['slots'] == [0, 1, 2]
        assert [variant['density'] for variant in manifest['variants']] == [2, 4]
        frames = {}
        for number in declaration['slots']:
            assert number == 3 and unused_rubble or row['slots'][number]['status'] == 'ELIGIBLE_EXACT_RENDERED_BODY_DONOR'
            frame = native[name]['frames'][number]
            logical = dict(nativeFrame=number, trimOrigin=frame['origin'], trimSize=frame['size'],
                           legacyRenderSize=[value + value % 2 for value in frame['size']], empty=frame['empty'])
            assert manifest['logical']['frames'][number] == logical
            for variant in manifest['variants']:
                density = variant['density']
                region, = [value for value in variant['frames'] if value['nativeFrame'] == number]
                page, = [value for value in variant['pages'] if value['id'] == region['page']]
                images = []
                for role in ['base', 'data']:
                    file = manifest_file.parent / page[role]
                    if not file.exists():
                        file = manifest_file.parent / str(density) / page['id'] / (role + '.png')
                    assert sha(file) == page[role + 'Sha256']
                    x, y, width, height = region['sampleRect']
                    assert [width, height] == [value * density for value in logical['legacyRenderSize']]
                    with Image.open(file) as image:
                        images.append(np.asarray(image.convert('RGBA').crop((x, y, x + width, y + height))).copy())
                frames[number, density] = tuple(images)
        result[name] = frames
    return result
