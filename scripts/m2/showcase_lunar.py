"""Bound native Lunar smudge contour admission to the original YR source class."""
import re


def validate_lunar_smudge_contours(declaration, source, theater):
    assert declaration['schema'] == 'yr-lunar-smudge-contours-v1'
    assert theater == declaration['theater'] == 'LUNAR' and declaration['kind'] == 'smudge'
    assert re.fullmatch(r'(burnt|crater)(0[1-9]|1[0-2])\.lun', source['member'])
    assert source['archive'] == 'ra2md.mix/lunar.mix'
    assert source['palette']['member'] == 'isolun.pal'
    assert source['palette']['sha256'] == 'cdcbb615ede0d3e289adb0a16ef2b2b420eecd122de413bcc745a5f94939876a'
    assert source['bodyFrames'] == source['totalFrames'] == 2
    assert not source['hasShadow'] and not source['remapable']
    assert not source['frames'][0]['empty'] and source['frames'][1]['empty']
    assert source['frames'][1]['size'] == [0, 0]
    assert declaration['sourceSha256'] == source['sha256']
    assert declaration['paletteSha256'] == source['palette']['sha256']
    assert declaration['bodyIndexSha256'] == [frame['indexSha256'] for frame in source['frames']]
    assert all(binding['kind'] == 'smudge' and binding['role'] == 'body'
        and binding['identity'] == source['member'][:-4].upper() for binding in source['bindings'])
