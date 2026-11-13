"""Validate the complete original low-concrete-bridge render dependency."""
import hashlib
from pathlib import Path


def retire_bridge_predecessor_routes(campaign, directory, predecessor):
    """Unpublish only one replaced bridge revision; retain every payload byte."""
    assert predecessor['theater'] == 'URBAN' and predecessor['mission']['mission'] == campaign['mission'] == 'all08u.map'
    assert len(predecessor['bundle']['members']) == 26
    old = {row['name']: row for row in predecessor['files']}
    assert len(old) == len(predecessor['files']) == 131
    revision = predecessor['bundle']['revision']
    assert Path(directory).name == 'all08u'
    current = {row['name']: row for row in campaign['files']}
    for name, row in old.items():
        assert Path(name).name == name
        assert name.startswith(revision + '-') or name == 'environment-family-' + revision + '.json'
        assert current.get(name) == row, 'Inactive bridge route must retain its exact original identity'
        file = Path(directory) / name
        assert file.is_file() and file.stat().st_size == row['bytes']
        assert hashlib.sha256(file.read_bytes()).hexdigest() == row['sha256']
    campaign['files'] = [row for row in campaign['files'] if row['name'] not in old]
    return list(old.values())


def bridge_aggregate_admission(original, root):
    assert original['theater'] == 'URBAN' and original['mission'] == 'all08u.map'
    assert original['nativeRegistryQualification']['schema'] == 'retail-shp-object-kind-v1'
    names = [f'LOBRDB{number:02d}' for number in range(1, 27)]
    sources = original['sources']
    assert [source['identity'] for source in sources] == names, 'All26 original bridge dependencies are required'
    renderer = Path(root) / 'src/engine/renderable/entity/Overlay.ts'
    registry = Path(root) / 'src/game/map/BridgeOverlayTypes.ts'
    assert 'shpFile.addImage(imageFile.getImage(1))' in renderer.read_text()
    assert 'registerAggregateHd(shpFile, hdFrames)' in renderer.read_text()
    assert 'minLowBridgeConcreteId = 205' in registry.read_text()
    assert 'maxLowBridgeConcreteId = 230' in registry.read_text()
    members = []
    for number, source in enumerate(sources, 1):
        assert source['member'] == f'lobrdb{number:02d}.urb'
        assert source['format'] == 'shp' and source['nativeObjectType'] == 4
        assert source['nativeKind'] == 'overlay' and source['nativeRegistry'] == 'OverlayTypes'
        assert source['canvas'] == [180, 120]
        assert source['bodyFrames'] == 3 and source['totalFrames'] == 6 and source['hasShadow']
        assert source['remapable'] is False and not source.get('framePalettes')
        assert source['palette']['member'] == 'isourb.pal'
        assert source['palette']['sha256'] == 'b1f4c15b7b91130736b4dffeb189ca32621bf606afbc0b2d02eb5584b6921fe3'
        assert len(source['frames']) == 6
        assert [frame['slot'] for frame in source['frames']] == list(range(6))
        assert source['frames'][0]['empty'] and source['frames'][2]['empty']
        frame = source['frames'][1]
        assert not frame['empty'] and min(frame['size']) > 0
        assert source['nativeRules']['Land'] == 'Road'
        assert str(source['nativeRules']['NoUseTileLandType']).lower() in ['yes', 'true', '1']
        members.append(dict(member=source['member'], sourceSha256=source['sha256'], nativeFrame=1,
            origin=frame['origin'], size=frame['size'], indexSha256=frame['indexSha256']))
    return dict(schema='source-pinned-low-concrete-bridge-aggregate-v1', mission=original['mission'],
        missionSha256=original['missionSha256'], theater='URBAN', nativeOverlayIds=[205, 230],
        members=members, rendererSha256=hashlib.sha256(renderer.read_bytes()).hexdigest(),
        registrySha256=hashlib.sha256(registry.read_bytes()).hexdigest(),
        policy='All26 frame1 variants form the visible aggregate; file frames0/2 remain empty. The original low-bridge factory disables separate sprite shadows. Existing terrain lighting and simulation stay unchanged.')
