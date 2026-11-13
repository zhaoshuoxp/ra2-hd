"""Admit exact original Snow source families for independent HD authoring."""
import json
from pathlib import Path

from showcase_reconstruction import COHERENT_POLICY


SPECS = {
    'sourcePinnedSnowCliffContours': ('sourcePinnedSnowCliffPlanarLight',
        'terrain-snow-ice-cliffs-contour-contract-r1.json', 'yr-source-pinned-snow-cliff-contours-v1', 17, 75),
    'sourcePinnedSnowRampContours': ('sourcePinnedSnowRampPlanarLight',
        'terrain-snow-large-ramps-contour-contract-r1.json', 'yr-source-pinned-snow-large-ramp-contours-v1', 6, 77),
    'sourcePinnedSnowGroundContours': ('sourcePinnedSnowGroundPlanarLight',
        'terrain-snow-ground-patches-contour-contract-r1.json', 'yr-source-pinned-snow-ground-patch-contours-v1', 2, None),
    'sourcePinnedSnowCrevasseContours': ('sourcePinnedSnowCrevassePlanarLight',
        'terrain-snow-crevasses-contour-contract-r1.json', 'yr-source-pinned-snow-crevasse-contours-v1', 6, 81),
    'sourcePinnedSnowRoadContours': ('sourcePinnedSnowRoadPlanarLight',
        'terrain-snow-roads-contour-contract-r1.json', 'yr-source-pinned-snow-road-contours-v1', 3, None),
    'sourcePinnedSnowCoastalContours': ('sourcePinnedSnowCoastalPlanarLight',
        'terrain-snow-water-cliffs-contour-contract-r1.json', 'yr-source-pinned-snow-coastal-contours-v1', 2, 79),
}
MIXED_SETS = {
    'sourcePinnedSnowGroundContours': {'clifxl02.sno': 82, 'slope19.sno': 9},
    'sourcePinnedSnowRoadContours': {'droadc01.sno': 16, 'droadj05.sno': 17, 'droads30.sno': 18},
}


def admit_snow_scope(profile, source):
    """Reject mixed families, missing members and mismatched source geometry."""
    keys = [key for key in SPECS if key in profile]
    assert len(keys) == 1, 'Author one complete pinned Snow source family at a time'
    key, = keys
    light_key, filename, schema, count, set_index = SPECS[key]
    contract = json.loads((Path(__file__).resolve().parents[2]
        / 'docs/campaign-art/yr-v1' / filename).read_text())
    assert source['theater'] == 'SNOW' and source['editions'] == ['yr']
    assert contract['schema'] == schema and contract['policy'] == COHERENT_POLICY
    pins = {member['member']: member['native']['sha256'] for member in source['members']}
    assert len(source['members']) == len(pins) == count
    assert profile[key] == contract['members'] == pins
    assert profile['continuousAuthoredRgb'] == profile['authoredSurfaceReconstruction'] == pins
    if set_index is None:
        assert contract['memberSetIndices'] == MIXED_SETS[key]
        assert contract['setIndices'] == sorted(set(MIXED_SETS[key].values()))
    else:
        assert contract['setIndex'] == set_index
    for member in source['members']:
        name = member['member']
        expected_set = contract['memberSetIndices'][name] if set_index is None else set_index
        assert name.endswith('.sno') and member['setIndex'] == expected_set
        assert member['native']['palette'] == contract['palette']
    for candidate, *_ in SPECS.values():
        if candidate in profile:
            assert candidate == light_key
            assert profile[candidate] == dict(degree=1, members=pins)
    return contract, key, light_key if light_key in profile else None
