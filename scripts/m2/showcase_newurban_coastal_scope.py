"""Bound additional waterfront structures to their complete original family."""
import json
from pathlib import Path

from showcase_registration import sha


CONTRACT = 'terrain-newurban-water-retaining-wall-source-contract-r1.json'
CONTRACT_SHA256 = '41441a6f9928aae72602bb31501c2dd3b4b89112506e31f12f4d09549f70288c'
WALL_CONTRACT = 'terrain-newurban-coastal-wall-source-contract-r1.json'
WALL_CONTRACT_SHA256 = '6537aef263068c47959fd4131c2e6628f4ecfb3127e203f84ab0237b5be67f41'
WATER_ONLY_CONTRACT = 'terrain-newurban-coastal-water-only-wall-source-contract-r1.json'
WATER_ONLY_CONTRACT_SHA256 = 'd5e3c1c80d994525d9f026315eff8a4eecf0fa8d14cca781e612ba60c58b1dca'
CAP_CONTRACT = 'terrain-newurban-coastal-cap-source-contract-r1.json'
CAP_CONTRACT_SHA256 = '99a2531d7b6d4cf3a4a7c25cb8e3516913d60121e7d9933aa7f34278c99f1bc5'
BRIDGE_CONTRACT = 'terrain-newurban-bridge-pier-source-contract-r2.json'
BRIDGE_CONTRACT_SHA256 = 'f7b1106a86a637bf2fd0916b033984ce463ca38cd1498bbd0238fe80e13a87fa'
BEACH_CONTRACT = 'terrain-newurban-sand-foot-wall-source-contract-r1.json'
BEACH_CONTRACT_SHA256 = 'e4c99e51a66a5f4a7b102aec9bc132e5e83e2d8b267b9ae59103f635dda62dd3'


def coastal_set_indices(source):
    assert source['theater'] == 'NEWURBAN' and source['editions'] == ['yr']
    members = source['members']
    names = [member['member'] for member in members]
    assert names and len(names) == len(set(names)), 'Require distinct original coastal members'
    if all(name.startswith('wclifx') and name.endswith('.ubn') for name in names):
        assert all(member['native']['setIndex'] == 112 for member in members)
        return dict.fromkeys(names, 112)
    contracts = [
        (CONTRACT, CONTRACT_SHA256, 'yr-source-pinned-newurban-water-retaining-wall-contract-v1'),
        (WALL_CONTRACT, WALL_CONTRACT_SHA256, 'yr-source-pinned-newurban-coastal-wall-contract-v1'),
        (WATER_ONLY_CONTRACT, WATER_ONLY_CONTRACT_SHA256,
            'yr-source-pinned-newurban-coastal-water-only-wall-contract-v1'),
        (CAP_CONTRACT, CAP_CONTRACT_SHA256, 'yr-source-pinned-newurban-coastal-cap-contract-v1'),
        (BRIDGE_CONTRACT, BRIDGE_CONTRACT_SHA256, 'yr-source-pinned-newurban-bridge-pier-contract-v1'),
        (BEACH_CONTRACT, BEACH_CONTRACT_SHA256, 'yr-source-pinned-newurban-sand-foot-wall-contract-v1'),
    ]
    admitted = []
    for name, digest, schema in contracts:
        file = Path(__file__).resolve().parents[2] / 'docs/campaign-art/yr-v1' / name
        assert sha(file) == digest, 'Original waterfront source contract changed'
        contract = json.loads(file.read_text())
        assert contract['schema'] == schema
        if set(names) == set(contract['members']):
            admitted.append(contract)
    assert len(admitted) == 1, 'Require one complete source-pinned waterfront family'
    contract = admitted[0]
    assert contract['theater'] == source['theater'] and contract['editions'] == source['editions']
    assert source['preparedSourceSha256'] == contract['preparedSourceSha256']
    indices = contract.get('setIndices', dict.fromkeys(names, contract.get('setIndex')))
    assert set(indices) == set(names)
    for member in members:
        name, native = member['member'], member['native']
        assert native['member'] == name
        assert member['setIndex'] == native['setIndex'] == indices[name]
        assert native['sha256'] == contract['members'][name], 'Original waterfront TMP hash changed'
        assert all(native['palette'][key] == value for key, value in contract['palette'].items()), \
            'Original waterfront palette changed'
    return indices


def coastal_profile_indices(profile, source):
    indices = coastal_set_indices(source)
    required = {'continuousAuthoredRgb', 'sourcePinnedCoastalSea'}
    exposed = required | {'authoredSurfaceReconstruction'}
    floor_caps = set(indices) == {'cliffc05.ubn', 'cliffc06.ubn'}
    bridge_paint = set(indices) == {'ovrps07.ubn', 'ovrps09.ubn', 'ovrps12.ubn'} \
        and set(profile) == exposed | {'sourcePinnedBridgeRoadPaint'}
    sand_foot = set(indices) == {'wclifb01.ubn', 'wclifb05.ubn'} \
        and set(profile) == exposed | {'sourcePinnedCoastalBeach'}
    assert set(profile) == exposed or floor_caps and set(profile) == required or bridge_paint or sand_foot, \
        'Require the complete source-pinned coastal profile'
    return indices


def bridge_floor_contacts(source):
    assert coastal_set_indices(source) == dict.fromkeys(
        ['ovrps07.ubn', 'ovrps09.ubn', 'ovrps12.ubn'], 19)
    file = Path(__file__).resolve().parents[2] / 'docs/campaign-art/yr-v1' / BRIDGE_CONTRACT
    assert sha(file) == BRIDGE_CONTRACT_SHA256
    return json.loads(file.read_text())['floorContacts']
