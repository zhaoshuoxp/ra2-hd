"""Append complete registered terrain groups while preserving accepted V13D bytes."""
import argparse
import copy
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from showcase_registration import capacity, extrude, independently_sample, matte, register, sha
from showcase_urban_roads import register_urban_road
from showcase_structure_contacts import continuous_structure_contacts
from showcase_reconstruction import (POLICY as CONTOUR_POLICY, extra_alpha,
                                     continuous_water_detail, continuous_water_weight)
from showcase_materials import (register_water, register_contacts, water_mask,
                               pinned_native_water_mask, register_coast_contacts, authored_pool_water_weight, reject_new_matte,
                               opaque_water_patch, register_snow_planar_photometry,
                               register_snow_continuous_light, sample_diffuse_rgb)

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('--root', type=Path, default=Path('.artifacts/m2-2/authoring-tmp-v2'))
parser.add_argument('--groups', nargs='+')
parser.add_argument('--material-profile', type=Path)
parser.add_argument('--prepared', type=Path, default=Path('.artifacts/m2-2/prepared-native-v2'))
parser.add_argument('--base-pointer', type=Path)
parser.add_argument('--set-indices', nargs='+', type=int)
parser.add_argument('--group-prefix', default='m2-2')
parser.add_argument('--max-groups', type=int, default=8)
parser.add_argument('--schema', default='m2-2-tmp-export-v1')
parser.add_argument('--replace-selected-groups', action='store_true')
parser.add_argument('--allow-empty-base', action='store_true')
args = parser.parse_args()
root = args.root
profile = json.loads(args.material_profile.read_text()) if args.material_profile else {}
prepared = args.prepared
source = json.loads((root / 'source.json').read_text())
assert source['preparedSourceSha256'] == sha(prepared / 'source.json')
layout = json.loads((root / 'layout.json').read_text())
overrides = json.loads((root / 'slot-overrides.json').read_text()) if (root / 'slot-overrides.json').exists() else {}
batches = {batch['name'] + '-master.png': batch for batch in json.loads((root / 'batches.json').read_text())}
groups = {'thickgrass': [13, 14], 'pavecrop': [35, 38, 39, 46], 'dirtroads': [16, 17, 18, 23],
          'shore': [12], 'watercontacts': [21, 49, 76]}
if args.set_indices:
    groups = {f'set{index:02d}': [index] for index in args.set_indices}
wanted = args.groups or list(groups)
assert all(group in groups for group in wanted)
members = [member for member in source['members'] if any(member['setIndex'] in groups[group] for group in wanted)]
member_sets = {member['member']: member['setIndex'] for member in members}
reconstructed = profile.get('authoredSurfaceReconstruction', {})
continuous_structure_members = profile.get('nativeContinuousStructureContacts', {})
for name, pin in continuous_structure_members.items():
    assert name in reconstructed and pin == reconstructed[name], 'Pin corrected structure contacts to their native source'
for name, pin in reconstructed.items():
    assert source.get('theater') in ('NEWURBAN', 'DESERT')
    assert name in member_sets and pin == next(row['native']['sha256'] for row in members if row['member'] == name)
assert not reconstructed or set(reconstructed) == set(member_sets), 'Reconstruct complete source groups'
water_sets = profile.get('waterRegistrationSetIndices')
if water_sets is not None:
    assert isinstance(water_sets, list) and all(type(index) is int for index in water_sets)
water_members = profile.get('waterRegistrationMembers')
if water_members is not None:
    assert isinstance(water_members, list) and water_members
    assert len(set(water_members)) == len(water_members) and set(water_members) <= member_sets.keys()
    assert set(water_members) == profile.get('mixedWaterMembers', {}).keys()
    assert all(member_sets[name] in water_sets for name in water_members)
urban_water_members = profile.get('nativeUrbanWaterMembers')
theater_water_members = profile.get('nativeTheaterWaterMembers')
assert urban_water_members is None or theater_water_members is None
if theater_water_members is not None:
    assert source.get('theater') in ('NEWURBAN', 'DESERT')
    urban_water_members = theater_water_members
if urban_water_members is not None:
    assert (theater_water_members is not None or source.get('theater') == 'URBAN') and urban_water_members
    assert set(urban_water_members).issubset(member_sets)
    assert set(profile.get('mixedWaterMembers', {})).issubset(urban_water_members)
    for name, declaration in urban_water_members.items():
        native_source = next(row['native'] for row in members if row['member'] == name)
        assert declaration['sourceSha256'] == native_source['sha256']
        allowed_sets = [12, 15, 21] if theater_water_members is not None else [12, 15, 21, 85, 106, 107, 110]
        structure_sets = ([19] if declaration['ownership'] == 'NATIVE_THEATER_STRUCTURE_WITH_WATER' else [19, 81])
        assert member_sets[name] in (structure_sets if declaration['ownership'] in (
            'NATIVE_URBAN_STRUCTURE_WITH_WATER', 'NATIVE_THEATER_STRUCTURE_WITH_WATER') else allowed_sets)
        assert declaration['ownership'] in ['PURE_NATIVE_WATER', 'NATIVE_URBAN_COAST_WITH_WATER',
                                             'NATIVE_URBAN_STRUCTURE_WITH_WATER', 'NATIVE_THEATER_COAST_WITH_WATER',
                                             'NATIVE_THEATER_STRUCTURE_WITH_WATER']
        if theater_water_members is not None:
            assert declaration['ownership'] in ['PURE_NATIVE_WATER', 'NATIVE_THEATER_COAST_WITH_WATER',
                                                'NATIVE_THEATER_STRUCTURE_WITH_WATER']
            if declaration['ownership'] == 'NATIVE_THEATER_STRUCTURE_WITH_WATER':
                assert source['theater'] == 'NEWURBAN' and name in ['ovrps02.ubn', 'ovrps05.ubn']
        if declaration['ownership'] == 'PURE_NATIVE_WATER':
            assert member_sets[name] == 21 and name not in profile.get('mixedWaterMembers', {})
            assert all(image['height'] == 0 and not image['hasExtraData'] for image in native_source['images'])
        else:
            assert name in profile['mixedWaterMembers']

base_pointer = dict(schemaVersion=1, revision='temperate-m2-1-seams-v13d',
                    sha256='47a93e1ae5c56150357dd3f040f654079de26f8c899ebbc923b3c099bbf97f38')
if args.base_pointer:
    base_pointer = json.loads(args.base_pointer.read_text())
base_root = Path('.local/terrain-packs') / base_pointer['revision']
assert sha(base_root / 'manifest.json') == base_pointer['sha256']
base = json.loads((base_root / 'manifest.json').read_text())
assert (0 if args.allow_empty_base else 1) <= len(base['groups']) <= args.max_groups
assert base['theater'] == source.get('theater', 'TEMPERATE'), 'Cross-theater base mismatch'
replaced_groups = []
if args.replace_selected_groups:
    assert args.set_indices, 'Group replacement requires an explicit native set allowlist.'
    replacement_names = {member['member'] for member in members}
    replaced_groups = [group for group in base['groups'] if any(
        member['member'] in replacement_names for member in group['members'])]
    assert replaced_groups and {member['member'] for group in replaced_groups
        for member in group['members']} == replacement_names, 'Replace complete selected groups only.'
    replaced_ids = {group['id'] for group in replaced_groups}
    base = copy.deepcopy(base)
    base['groups'] = [group for group in base['groups'] if group['id'] not in replaced_ids]
accepted_members = {member['member'] for group in base['groups'] for member in group['members']}
assert not accepted_members.intersection(member['member'] for member in members), 'Duplicate accepted source'
mother_audits = profile.get('motherAudits')
if mother_audits is not None:
    used = {str(root / {**layout[member['member']], **overrides.get(member['member'], {})}['board'])
            for member in members}
    assert set(mother_audits) == used, 'Pin every used primary mother audit exactly'
    for file, declaration in mother_audits.items():
        assert sha(file) == declaration['masterSha256']
        audit_file = Path(declaration['audit'])
        assert sha(audit_file) == declaration['auditSha256']
        audit = json.loads(audit_file.read_text())
        assert audit['status'] == 'PASS' and audit['rawSha256'] == declaration['masterSha256'], \
            f'Used mother must pass source-pinned cell containment: {file}'
masters, plates, originals, registered = {}, {}, {}, []
for member in members:
    name = member['member']
    info = {**layout[name], **overrides.get(name, {})}
    structure_key = ('nativeTheaterStructureMaterials' if name in profile.get('nativeTheaterStructureMaterials', {})
                     else 'nativeUrbanStructureMaterials')
    if name in profile.get(structure_key, {}):
        assert (source['theater'] in ('NEWURBAN', 'DESERT') and member['setIndex'] in [19, 25, 115, 117, 119]
                if structure_key == 'nativeTheaterStructureMaterials'
                else source['theater'] == 'URBAN' and member['setIndex'] in [19, 25, 81, 82])
        assert profile[structure_key][name]['sourceSha256'] == member['native']['sha256']
        info['rejectFluorescentFringe'] = True
    file = root / info['board']
    assert file.exists(), f'Missing substantial authored member: {name}'
    if file not in masters:
        masters[file] = Image.open(file).convert('RGBA')
    batch = batches.get(info['board'])
    board_size = info.get('boardSize', batch['boardSize'] if batch else None)
    assert board_size
    rect, plate = register(masters[file], info, board_size,
                           isolated=info.get('occupied', len(batch['members']) if batch else 1) == 1)
    available = capacity(rect, info['nativeAlphaBounds'])
    assert available >= 4, (name, available)
    originals[name] = np.asarray(Image.open(root / f'{name}-native.png').convert('RGBA'))
    plates[name] = plate
    registered.append(dict(member=name, master=str(file), sha256=sha(file), sourceRect=rect,
                           capacity=available, nativeBounds=info['nativeAlphaBounds']))

# Register color by native material region. Water has its own Original anchor,
# so warm sand and foliage cannot bias its subdued blue-gray/violet appearance.
palette = {}
material_corrections = {}
for member in members:
    name, info = member['member'], layout[member['member']]
    a = info['nativeAlphaBounds']
    native = originals[name][a[1]:a[3], a[0]:a[2]]
    rgb = native[..., :3].astype(float)
    active = native[..., 3] > 0
    projected = np.asarray(Image.fromarray(plates[name]).resize((a[2] - a[0], a[3] - a[1]), Image.Resampling.LANCZOS)).astype(float)
    regions = {'surface': active}
    if member['setIndex'] in [12, 21, 49, 76]:
        deep = active & (rgb[..., 2] > rgb[..., 1] + 8) & (rgb[..., 2] > rgb[..., 0] + 5)
        shallow = active & (rgb[..., 1] > rgb[..., 0] + 4) & ~deep
        regions = {'deep-water': deep, 'shallow-water': shallow, 'other': active & ~deep & ~shallow}
    corrected = plates[name].astype(float)
    entries = []
    for label, mask in regions.items():
        if not mask.any():
            continue
        offset = rgb[mask].mean(0) - projected[mask].mean(0)
        weight = np.asarray(Image.fromarray(mask.astype(np.float32)).resize(
            (corrected.shape[1], corrected.shape[0]), Image.Resampling.BILINEAR))
        corrected += weight[..., None] * offset
        entries.append(dict(region=label, offset=offset.tolist(), nativeMean=rgb[mask].mean(0).tolist()))
    plates[name] = np.uint8(np.clip(corrected, 0, 255))
    palette[name] = entries

red_paving = {}
for name, declaration in profile.get('nativeUrbanRedPavingOverrides', {}).items():
    assert name in member_sets and member_sets[name] in [102, 104, 109]
    assert source.get('theater') == 'URBAN'
    native_source = next(member['native'] for member in members if member['member'] == name)
    assert native_source['sha256'] == declaration['sourceSha256']
    file = Path(declaration['master'])
    assert sha(file) == declaration['masterSha256']
    info = {**layout[name], **overrides.get(name, {})}
    rect, plate = register(Image.open(file).convert('RGBA'), info, declaration['boardSize'],
                           isolated=info['occupied'] == 1)
    assert capacity(rect, info['nativeAlphaBounds']) >= 4
    a = info['nativeAlphaBounds']
    native = originals[name][a[1]:a[3], a[0]:a[2]]
    colors = native[..., :3].astype(float)
    mask = (native[..., 3] > 0) & (colors[..., 0] - colors[..., 1] >= 22) \
        & (colors[..., 0] - colors[..., 2] >= 28)
    assert mask.any() and ((native[..., 3] > 0) & ~mask).any()
    projected = independently_sample(plate, native.shape[1::-1]).astype(float)
    offset = colors[mask].mean(0) - projected[mask].mean(0)
    red_paving[name] = dict(mask=mask, rgb=np.uint8(np.clip(plate.astype(float) + offset, 0, 255)))
    registered.append(dict(member=name, master=str(file), sha256=sha(file), sourceRect=rect,
        capacity=capacity(rect, a), nativeBounds=a, role='SOURCE_PINNED_RED_PAVING_REGION_ONLY'))
    material_corrections.setdefault(name, {})['nativeUrbanRedPaving'] = dict(
        sourceSha256=native_source['sha256'], nativeRedPixels=int(mask.sum()),
        originalNonRedPixels=int(((native[..., 3] > 0) & ~mask).sum()),
        registration='Independent builtin fine-grain material sampled only inside Original red paving; other authored RGB retained')

red_forms = profile.get('nativeUrbanRedPavingForms', {})
road_forms = profile.get('nativeUrbanRoadForms', {})
continuous_roads = profile.get('continuousUrbanRoads', {})
road_geometry = {}
if spec := profile.get('continuousUrbanRoadGeometry'):
    assert spec['policy'] == 'SOURCE_PINNED_ANALYTIC_LINES_AND_PROJECTED_ARCS_V1'
    assert sha(spec['file']) == spec['sha256']
    catalog = json.loads(Path(spec['file']).read_text())
    assert set(catalog['members']) == set(continuous_roads)
    for name, geometry in catalog['members'].items():
        native_source = next(row['native'] for row in members if row['member'] == name)
        assert geometry['sourceSha256'] == native_source['sha256']
        assert geometry['nativePngSha256'] == sha(root / f'{name}-native.png')
        assert geometry['logical'] == list(originals[name].shape[1::-1])
    road_geometry = catalog['members']
continuous_road_style = profile.get('continuousUrbanRoadStyle')
if continuous_road_style is not None:
    assert continuous_roads and continuous_road_style['policy'] == 'ACCEPTED_TEMPERATE_WORN_MATERIALS_V1'
    reference = continuous_road_style['reference']
    assert sha(reference['file']) == reference['sha256']
    assert sha(reference['acceptedManifest']) == reference['acceptedManifestSha256']
    pixels = np.asarray(Image.open(reference['file']).convert('RGBA')).astype(float)
    colors, active = pixels[..., :3], pixels[..., 3] > 0
    masks = {
        'asphalt': active & (colors.max(2) < 105) & (colors.min(2) > 10) & (np.ptp(colors, axis=2) < 18),
        'paving': active & (colors.mean(2) > 130) & (np.ptp(colors, axis=2) < 35),
        'yellow': active & (colors[..., 0] > 140) & (colors[..., 1] > 100)
            & (colors[..., 2] < colors[..., 1] * .65) & (colors[..., 1] > colors[..., 0] * .6)}
    for role, mask in masks.items():
        assert mask.sum() > 100
        assert np.allclose(colors[mask].mean(0), continuous_road_style['targets'][role]['mean'])
assert set(continuous_roads) <= set(road_forms), 'Continuous roads need explicit Original road authority'
road_materials = {}
if continuous_roads:
    specs = profile['continuousUrbanRoadMaterials']
    assert set(specs) == {'asphalt', 'paving'}
    for role, spec in specs.items():
        file = Path(spec['file'])
        assert sha(file) == spec['sha256']
        material = Image.open(file).convert('RGBA')
        assert material.getextrema()[3] == (255, 255)
        required = [max(info['bounds'][axis] for name, info in layout.items()
                        if name in continuous_roads) for axis in (2, 3)]
        available = min(material.width / required[0], material.height / required[1])
        assert available >= 4, 'Independent road material must have actual 4X capacity'
        road_materials[role] = np.asarray(material)[..., :3]
        registered.append(dict(member='continuous-road-material-' + role, master=str(file),
            sha256=sha(file), capacity=available, role='INDEPENDENT_OPAQUE_BUILTIN_MATERIAL'))
for name, declaration in continuous_roads.items():
    assert source.get('theater') == 'URBAN' and member_sets[name] in [16, 17, 18, 23]
    assert declaration == dict(sourceSha256=road_forms[name]['sourceSha256'],
                              policy='CONTINUOUS_SOURCE_MATERIAL_BOUNDARIES_WITH_AUTHORED_DETAIL')
ground_forms = profile.get('nativeUrbanGroundForms', {})
coast_forms = profile.get('nativeUrbanCoastForms', {})
urban_paving_forms = {**red_forms, **road_forms, **ground_forms, **coast_forms}
assert len(urban_paving_forms) == len(red_forms) + len(road_forms) + len(ground_forms) + len(coast_forms), \
    'One explicit form policy per member'
for name, declaration in urban_paving_forms.items():
    assert name in member_sets and source.get('theater') == 'URBAN'
    native_source = next(member['native'] for member in members if member['member'] == name)
    assert declaration['sourceSha256'] == native_source['sha256']
    if name in coast_forms:
        assert declaration['region'] == 'FULL_NATIVE_COAST_MATERIAL_AND_STRUCTURE'
        assert member_sets[name] in [10, 12, 15, 21, 85, 106, 107, 110]
    elif name in ground_forms:
        assert declaration['region'] == 'FULL_NATIVE_GROUND_COLOR_AND_MATERIAL_BOUNDARIES'
        assert member_sets[name] in [13, 14, 33, 34, 35, 41, 42, 88]
    elif name in road_forms:
        assert declaration['region'] == 'FULL_NATIVE_ROAD_COLOR_AND_MARKINGS'
        assert member_sets[name] in [16, 17, 18, 20, 23, 36, 40, 47]
    else:
        assert declaration['region'] in ['FULL_NATIVE_RED_PAVING', 'NATIVE_RED_PAVING_HUE']
        assert member_sets[name] in ([39, 46] if declaration['region'] == 'FULL_NATIVE_RED_PAVING'
                                    else [102, 103, 104, 109])

theater_ground_forms = profile.get('nativeTheaterGroundForms', {})
assert not set(theater_ground_forms).intersection(urban_paving_forms)
for name, declaration in theater_ground_forms.items():
    assert source.get('theater') in ('NEWURBAN', 'DESERT')
    assert name in member_sets and member_sets[name] in [13, 14, 33, 34, 39, 41, 42, 46]
    native_source = next(member['native'] for member in members if member['member'] == name)
    assert declaration == dict(sourceSha256=native_source['sha256'],
        region='FULL_NATIVE_GROUND_COLOR_AND_MATERIAL_BOUNDARIES'), 'Pinned native ground form mismatch'
urban_paving_forms.update(theater_ground_forms)

coast_materials = profile.get('nativeUrbanCoastMaterials', {})
structure_materials = profile.get('nativeUrbanStructureMaterials', {})
assert not set(coast_materials).intersection(structure_materials)
for name, declaration in structure_materials.items():
    assert name in member_sets and source.get('theater') == 'URBAN'
    assert member_sets[name] in [19, 25, 81, 82]
    native_source = next(row['native'] for row in members if row['member'] == name)
    assert declaration == dict(sourceSha256=native_source['sha256'],
        policy='REGISTERED_AUTHORED_MATERIAL_WITH_NATIVE_ALPHA_AND_CONTACT_LIGHT')
coast_materials = {**coast_materials, **structure_materials}
assert not set(coast_materials).intersection(urban_paving_forms)
for name, declaration in coast_materials.items():
    assert name in member_sets and source.get('theater') == 'URBAN'
    assert member_sets[name] in ([19, 25, 81, 82] if name in structure_materials
                                else [10, 12, 15, 21, 85, 106, 107, 110])
    native_source = next(row['native'] for row in members if row['member'] == name)
    assert declaration == dict(sourceSha256=native_source['sha256'],
        policy='REGISTERED_AUTHORED_MATERIAL_WITH_NATIVE_ALPHA_AND_CONTACT_LIGHT')

theater_coast_materials = profile.get('nativeTheaterCoastMaterials', {})
assert not set(theater_coast_materials).intersection(coast_materials)
assert not set(theater_coast_materials).intersection(urban_paving_forms)
for name, declaration in theater_coast_materials.items():
    assert source.get('theater') in ('NEWURBAN', 'DESERT')
    assert name in member_sets and member_sets[name] in [10, 12, 15, 21]
    native_source = next(row['native'] for row in members if row['member'] == name)
    assert declaration == dict(sourceSha256=native_source['sha256'],
        policy='REGISTERED_AUTHORED_MATERIAL_WITH_NATIVE_ALPHA_AND_CONTACT_LIGHT')
coast_materials = {**coast_materials, **theater_coast_materials}

theater_structure_materials = profile.get('nativeTheaterStructureMaterials', {})
assert not set(theater_structure_materials).intersection(coast_materials)
assert not set(theater_structure_materials).intersection(urban_paving_forms)
for name, declaration in theater_structure_materials.items():
    assert source.get('theater') in ('NEWURBAN', 'DESERT')
    assert name in reconstructed and member_sets[name] in [19, 25, 115, 117, 119]
    assert source['theater'] == 'NEWURBAN' or member_sets[name] == 25
    native_source = next(row['native'] for row in members if row['member'] == name)
    assert declaration == dict(sourceSha256=native_source['sha256'],
        policy='REGISTERED_AUTHORED_MATERIAL_WITH_CONTINUOUS_EXTRA_CONTOURS')
coast_materials = {**coast_materials, **theater_structure_materials}

snow_photometry = profile.get('nativeSnowPlanarPhotometry', {})
assert set(snow_photometry).issubset(plates), 'Snow photometry requires explicit authored members'
for member in members:
    name = member['member']
    if name not in snow_photometry:
        continue
    declaration = snow_photometry[name]
    assert source.get('theater') == 'SNOW' and member['setIndex'] in [9, 41]
    assert declaration['classification'] == 'NATIVE_SNOW_ONLY_RAMP_RELIEF'
    assert declaration['sourceSha256'] == member['native']['sha256']
    a = layout[name]['nativeAlphaBounds']
    native = originals[name][a[1]:a[3], a[0]:a[2]]
    degree = declaration.get('degree', 1)
    assert type(degree) is int and degree in (1, 2)
    plates[name], correction = register_snow_planar_photometry(plates[name], native, degree)
    material_corrections[name] = dict(nativeSnowPlanarPhotometry=dict(
        sourceSha256=declaration['sourceSha256'], **correction))

snow_continuous = profile.get('nativeSnowContinuousLight', {})
assert set(snow_continuous).issubset(plates) and not set(snow_continuous).intersection(snow_photometry)
for member in members:
    name = member['member']
    if name not in snow_continuous:
        continue
    declaration = snow_continuous[name]
    assert source.get('theater') == 'SNOW' and member['setIndex'] in [9, 41]
    assert declaration['classification'] == 'NATIVE_SNOW_ONLY_RAMP_RELIEF'
    assert declaration['sourceSha256'] == member['native']['sha256']
    a = layout[name]['nativeAlphaBounds']
    native = originals[name][a[1]:a[3], a[0]:a[2]]
    plates[name], correction = register_snow_continuous_light(plates[name], native)
    material_corrections[name] = dict(nativeSnowContinuousLight=dict(
        sourceSha256=declaration['sourceSha256'], **correction))

snow_diffuse_contacts = profile.get('nativeSnowDiffuseContacts', {})
assert set(snow_diffuse_contacts).issubset(snow_continuous)
for name, declaration in snow_diffuse_contacts.items():
    assert declaration == snow_continuous[name]
    material_corrections[name]['nativeSnowDiffuseContacts'] = dict(
        sourceSha256=declaration['sourceSha256'], nativeFieldSigma=1.2,
        policy='Exact native alpha; source diffuse contact color replaces exposed retail pixel grain')

water_anchor = None
reef_materials = {}
theater_reef_materials = profile.get('nativeTheaterReefMaterials', {})
assert not set(theater_reef_materials).intersection(profile.get('nativeUrbanReefMaterials', {}))
for name, declaration in {**profile.get('nativeUrbanReefMaterials', {}), **theater_reef_materials}.items():
    expected_theater = 'NEWURBAN' if name in theater_reef_materials else 'URBAN'
    assert source.get('theater') == expected_theater and member_sets[name] == 21
    extension = 'ubn' if name in theater_reef_materials else 'urb'
    assert name in [f'water{index:02d}.{extension}' for index in [7, 8, 14]]
    native_source = next(row['native'] for row in members if row['member'] == name)
    assert declaration['sourceSha256'] == native_source['sha256']
    assert declaration['policy'] == 'SEPARATE_AUTHORED_BODY_WITH_NATIVE_SEA_AND_SHADOW_OWNERSHIP'
    native = originals[name]
    mask_info = declaration['bodyMask']
    assert mask_info['nativeRgbaSha256'] == hashlib.sha256(native.tobytes()).hexdigest()
    assert mask_info['logical'] == list(native.shape[1::-1])
    mask_file = Path(mask_info['file'])
    assert sha(mask_file) == mask_info['sha256']
    values = np.frombuffer(mask_file.read_bytes(), np.uint8).reshape(native.shape[:2])
    assert np.all(values <= 1)
    mask = values != 0
    assert mask.any() and not (mask & (native[..., 3] == 0)).any()
    master_file, audit_file = Path(declaration['master']), Path(declaration['audit'])
    assert sha(master_file) == declaration['masterSha256']
    assert sha(audit_file) == declaration['auditSha256']
    audit = json.loads(audit_file.read_text())
    assert audit['status'] == 'PASS' and audit['rawSha256'] == declaration['masterSha256']
    rect, body = register(Image.open(master_file).convert('RGBA'), declaration['layout'],
                          declaration['boardSize'])
    assert capacity(rect, declaration['layout']['nativeAlphaBounds']) >= 4
    bounds = declaration['nativeBodyBounds']
    yy, xx = np.where(mask)
    assert bounds == [int(xx.min()), int(yy.min()), int(xx.max()) + 1, int(yy.max()) + 1]
    raw = np.asarray(Image.open(master_file).convert('RGBA'))
    x, y, width, height = rect
    crop = raw[y:y + height, x:x + width]
    coverage = ((crop[..., 3] > 180) & ~matte(crop[..., :3])).astype(np.uint8) * 255
    reef_materials[name] = dict(rgb=body, mask=mask, bounds=bounds, coverage=coverage)

if declaration := profile.get('waterAnchor'):
    assert declaration['classification'] == 'SOURCE_PINNED_EXISTING_AUTHORED_WATER_MATERIAL'
    guide_file = Path(declaration['prepared']) / 'source.json'
    assert sha(guide_file) == declaration['preparedSourceSha256']
    guide = json.loads(guide_file.read_text())
    assert guide.get('theater', 'TEMPERATE') == source.get('theater', 'TEMPERATE')
    anchor_source = next(member for member in guide['sources'] if member['member'] == declaration['member'])
    assert anchor_source['sha256'] == declaration['sourceSha256']
    assert sha(Path(declaration['prepared']) / 'native' / anchor_source['nativeFile']) == anchor_source['sha256']
    layout_file, master_file = Path(declaration['layout']), Path(declaration['master'])
    assert sha(layout_file) == declaration['layoutSha256']
    assert sha(master_file) == declaration['masterSha256']
    info = json.loads(layout_file.read_text())[declaration['member']]
    rect, rgb = register(Image.open(master_file).convert('RGBA'), info, declaration['boardSize'])
    assert capacity(rect, info['nativeAlphaBounds']) >= 4
    native_file = Path(declaration['nativeAssembly'])
    assert sha(native_file) == declaration['nativeAssemblySha256']
    a = info['nativeAlphaBounds']
    native_anchor = np.asarray(Image.open(native_file).convert('RGBA'))[a[1]:a[3], a[0]:a[2]]
    projected = independently_sample(rgb, (native_anchor.shape[1], native_anchor.shape[0])).astype(float)
    active = native_anchor[..., 3] > 0
    offset = native_anchor[..., :3][active].mean(0) - projected[active].mean(0)
    water_anchor = dict(member=declaration['member'], bounds=a, nativeActive=active, native=native_anchor,
                        rgb=np.uint8(np.clip(rgb.astype(float) + offset, 0, 255)))


shared_urban_water = profile.get('sharedUrbanWaterMaterial')
shared_theater_water = profile.get('sharedTheaterWaterMaterial')
assert shared_urban_water is None or shared_theater_water is None
if shared_theater_water is not None:
    assert theater_water_members is not None
    shared_urban_water = shared_theater_water
if shared_urban_water is not None:
    assert urban_water_members is not None and water_anchor is not None
    assert shared_urban_water == dict(policy='PINNED_SHARED_WATER_DETAIL_ON_NATIVE_MAIN_LAYER',
                                     anchorMember=water_anchor['member'])
    extension = {'URBAN': 'urb', 'NEWURBAN': 'ubn', 'DESERT': 'des'}[source['theater']]
    assert water_anchor['member'] == f'water04.{extension}'


coast_water_masks = {}
pool_water_support = {}


def assembly(name, density):
    info = layout[name]
    a = info['nativeAlphaBounds']
    rgb = np.zeros((info['bounds'][3] * density, info['bounds'][2] * density, 3), np.uint8)
    target_size = ((a[2] - a[0]) * density, (a[3] - a[1]) * density)
    sampled = independently_sample(plates[name], target_size).copy()
    if name in red_paving:
        region = red_paving[name]
        mask = np.repeat(np.repeat(region['mask'], density, 0), density, 1)
        alternate = independently_sample(region['rgb'], target_size)
        sampled[mask] = alternate[mask]
    rgb[a[1] * density:a[3] * density, a[0] * density:a[2] * density] = sampled
    native = originals[name]
    if name in continuous_roads:
        material_corrections.setdefault(name, {})['continuousUrbanRoads'] = dict(
            **continuous_roads[name],
            registration='Area-preserving continuous source boundaries, one-pixel antialiasing, continuous builtin grain; no retail cell or subtile RGB restore')
        return register_urban_road(rgb, native, density, road_materials, continuous_road_style,
                                   road_geometry.get(name))
    if name in urban_paving_forms:
        height, width = native.shape[:2]
        cell_mean = rgb.reshape(height, density, width, density, 3).mean(axis=(1, 3))
        fine_detail = rgb.astype(float) - cell_mean.repeat(density, 0).repeat(density, 1)
        colors = native[..., :3].astype(float)
        mask = native[..., 3] > 0
        if urban_paving_forms[name]['region'] == 'NATIVE_RED_PAVING_HUE':
            mask &= (colors[..., 0] - colors[..., 1] >= 22) & (colors[..., 0] - colors[..., 2] >= 28)
        mask = mask.repeat(density, 0).repeat(density, 1)
        # Original fixes broad forms, road markings and light; independently
        # sampled builtin material supplies detail inside every native cell.
        form = ndimage.gaussian_filter(extrude(native[..., :3], native[..., 3] > 0).astype(float), (.35, .35, 0))
        if name in coast_forms:
            # Suppress generated contour displacement before material transfer.
            # Native structure and a continuous fine-grain signal remain distinct.
            fine_detail = rgb.astype(float) - ndimage.gaussian_filter(
                rgb.astype(float), (.65 * density, .65 * density, 0))
            fine_detail = np.clip(fine_detail, -12, 12) * .75
            form = ndimage.gaussian_filter(
                extrude(native[..., :3], native[..., 3] > 0).astype(float), (.65, .65, 0))
        field = np.stack([np.asarray(Image.fromarray(form[..., channel].astype(np.float32)).resize(
            (width * density, height * density), Image.Resampling.BICUBIC)) for channel in range(3)], axis=-1)
        faithful = np.uint8(np.clip(field + fine_detail, 0, 255))
        rgb[mask] = faithful[mask]
        policy = 'nativeTheaterGroundForms' if name in theater_ground_forms else 'nativeUrbanPavingForms'
        material_corrections.setdefault(name, {})[policy] = dict(
            sourceSha256=urban_paving_forms[name]['sourceSha256'],
            region=urban_paving_forms[name]['region'],
            registration='Original continuous stone-joint/color field with independent authored subpixel material detail')
    # A shore master may paint sand into a cell whose retail material is water.
    # Bind the existing independently sampled sea material only to those native
    # water pixels. This is a material registration fix, not a new silhouette.
    colors = native[..., :3].astype(float)
    deep = (native[..., 3] > 0) & (colors[..., 2] > colors[..., 1] + 8) & (colors[..., 2] > colors[..., 0] + 5)
    projected = np.asarray(Image.fromarray(rgb).resize(native.shape[1::-1], Image.Resampling.BOX)).astype(float)
    wrong = deep & (projected[..., 0] > projected[..., 2] + 18) & (projected.mean(2) > 140)
    if name.startswith('shore') and wrong.any():
        anchor = water_anchor
        if anchor is None:
            assert 'water04.tem' in plates, 'Native shore water registration requires a pinned full-water anchor'
            anchor = dict(member='water04.tem', bounds=layout['water04.tem']['nativeAlphaBounds'],
                          rgb=plates['water04.tem'])
        water_bounds = anchor['bounds']
        water = independently_sample(anchor['rgb'],
            ((water_bounds[2] - water_bounds[0]) * density, (water_bounds[3] - water_bounds[1]) * density))
        repeated = np.tile(water, (int(np.ceil(rgb.shape[0] / water.shape[0])),
                                  int(np.ceil(rgb.shape[1] / water.shape[1])), 1))[:rgb.shape[0], :rgb.shape[1]]
        region = np.repeat(np.repeat(wrong, density, 0), density, 1)
        rgb[region] = repeated[region]
        material_corrections.setdefault(name, {})[str(density)] = dict(nativeWaterPixels=int(wrong.sum()),
            materialSource=anchor['member'], registration='Native deep-water mask; existing independent sea sample')
    inside = native[..., 3] > 0
    contact = np.zeros(inside.shape, np.float32)
    for step in range(2):
        eroded = ndimage.binary_erosion(inside)
        contact[inside & ~eroded] = 1 - step / 2
        inside = eroded
    target = (rgb.shape[1], rgb.shape[0])
    weight = np.asarray(Image.fromarray(contact).resize(target, Image.Resampling.BILINEAR))
    nearest = np.asarray(Image.fromarray(contact).resize(target, Image.Resampling.NEAREST))
    weight = np.array(weight, copy=True)
    weight[nearest == 1] = 1
    original = (sample_diffuse_rgb(native, target, .65) if name in coast_forms else
                sample_diffuse_rgb(native, target) if name in snow_diffuse_contacts else
                np.asarray(Image.fromarray(native[..., :3]).resize(target, Image.Resampling.NEAREST)))
    result = np.uint8(np.clip(rgb.astype(float) * (1 - weight[..., None]) + original * weight[..., None], 0, 255))
    if name in coast_materials:
        result = rgb.copy()
        policy_key = ('nativeTheaterStructureMaterials' if name in theater_structure_materials else
                      'nativeTheaterCoastMaterials' if name in theater_coast_materials else
                      'nativeUrbanStructureMaterials' if name in structure_materials else 'nativeUrbanCoastMaterials')
        material_corrections.setdefault(name, {})[policy_key] = dict(
            **coast_materials[name], contactLight='Native diffuse contact field; authored fine texture retained')
    if name in reef_materials:
        result = (np.uint8(np.clip(sample_diffuse_rgb(native, target, 2), 0, 255))
                  if name in reconstructed else original.copy())
        policy_key = 'nativeTheaterReefMaterials' if name in theater_reef_materials else 'nativeUrbanReefMaterials'
        material_corrections.setdefault(name, {})[policy_key] = dict(
            **profile[policy_key][name],
            registration='Independent detailed reef body and antialiased material boundary within one native pixel of source body; Original shadow outside body retained; logical tile alpha unchanged')
    if (profile.get('waterRegistration') and (water_sets is None or member_sets[name] in water_sets)
            and (water_members is None or name in water_members)
            and (urban_water_members is None or name in urban_water_members)):
        mixed = profile.get('mixedWaterMembers', {}).get(name)
        mask = None
        if mixed:
            assert mixed['sourceSha256'] == next(member['native']['sha256'] for member in members
                                                  if member['member'] == name)
            assert type(mixed['maximumNativeWaterChannel']) is int
            if mixed['classification'] in ('NATIVE_SNOW_ICE_WITH_WATER', 'NATIVE_SNOW_BRIDGE_WITH_WATER',
                                            'NATIVE_URBAN_COAST_WITH_WATER', 'NATIVE_URBAN_STRUCTURE_WITH_WATER',
                                            'NATIVE_THEATER_COAST_WITH_WATER', 'NATIVE_THEATER_STRUCTURE_WITH_WATER'):
                if mixed['classification'] == 'NATIVE_THEATER_STRUCTURE_WITH_WATER':
                    assert source.get('theater') == 'NEWURBAN' and member_sets[name] == 19
                    assert name in ['ovrps02.ubn', 'ovrps05.ubn']
                if mixed['classification'] == 'NATIVE_THEATER_COAST_WITH_WATER':
                    assert source.get('theater') in ('NEWURBAN', 'DESERT') and member_sets[name] in [12, 15, 21]
                if mixed['classification'] in ('NATIVE_URBAN_COAST_WITH_WATER', 'NATIVE_URBAN_STRUCTURE_WITH_WATER'):
                    assert source.get('theater') == 'URBAN'
                    assert member_sets[name] in ([19, 81] if mixed['classification'] == 'NATIVE_URBAN_STRUCTURE_WITH_WATER'
                                                else [12, 15, 21, 85, 106, 107, 110])
                mask = pinned_native_water_mask(native, mixed, mixed['sourceSha256'], root)
            else:
                assert mixed['classification'] == 'NATIVE_SNOW_ROCKS_WITH_WATER'
                mask = water_mask(native) & (colors.max(2) <= mixed['maximumNativeWaterChannel'])
            assert mask.any() and ((native[..., 3] > 0) & ~mask).any()
            material_corrections.setdefault(name, {})['waterMask'] = dict(
                sourceSha256=mixed['sourceSha256'], waterPixels=int(mask.sum()),
                excludedLandPixels=int(((native[..., 3] > 0) & ~mask).sum()),
                classification=mixed['classification'],
                maximumNativeWaterChannel=mixed['maximumNativeWaterChannel'])
            if 'mask' in mixed:
                material_corrections[name]['waterMask']['sourceMask'] = mixed['mask']
        if shared_urban_water is not None:
            ownership = mask if mask is not None else native[..., 3] > 0
            coast_water_masks[name] = ownership
            bounds = water_anchor['bounds']
            sea = independently_sample(water_anchor['rgb'],
                ((bounds[2] - bounds[0]) * density, (bounds[3] - bounds[1]) * density))
            if name in reconstructed:
                sea = continuous_water_detail(sea, water_anchor['native'], density)
            patch_rect = None
            if name in structure_materials or name in theater_structure_materials:
                sea, patch_rect = opaque_water_patch(sea, water_anchor['nativeActive'], density)
                if name in theater_structure_materials:
                    material_corrections.setdefault(name, {})['structureOpaqueSeaInterior'] = dict(
                        nativeAnchorRect=patch_rect,
                        policy='Only accepted opaque sea interior is repeated; transparent-margin extrusion excluded')
            sea = np.tile(sea, (int(np.ceil(result.shape[0] / sea.shape[0])),
                               int(np.ceil(result.shape[1] / sea.shape[1])), 1))[:result.shape[0], :result.shape[1]]
            region = ownership.repeat(density, 0).repeat(density, 1)
            if name in structure_materials:
                detail = sea.astype(float) - ndimage.gaussian_filter(sea.astype(float), (2 * density, 2 * density, 0))
                native_mean = native[..., :3][ownership].mean(0)
                sea = np.uint8(np.clip(native_mean + np.clip(detail, -8, 14) * .35, 0, 255))
                material_corrections.setdefault(name, {})['structureWaterColor'] = dict(
                    nativeMean=native_mean.tolist(), nativeOpaqueAnchorRect=patch_rect,
                    policy='SOURCE_WATER_MEAN_AND_MIRRORED_ACCEPTED_OPAQUE_INTERIOR_WAVE_DETAIL')
            if name in structure_materials and member_sets[name] == 81:
                weight, pool_record = authored_pool_water_weight(result, ownership, density)
                result = np.uint8(np.clip(sea * weight[..., None] + result * (1 - weight[..., None]), 0, 255))
                pool_water_support[name] = weight > 0
                material_corrections.setdefault(name, {})['poolContour'] = pool_record
            else:
                if name in reconstructed:
                    blend = continuous_water_weight(ownership, native[..., 3] > 0, density)[..., None]
                    result = np.uint8(np.clip(sea * blend + result * (1-blend), 0, 255))
                else:
                    result[region] = sea[region]
            policy_key = 'sharedTheaterWaterMaterial' if shared_theater_water is not None else 'sharedUrbanWaterMaterial'
            material_corrections.setdefault(name, {})[policy_key] = dict(
                anchorMember=water_anchor['member'], nativeWaterPixels=int(ownership.sum()),
                sourceSha256=urban_water_members[name]['sourceSha256'])
        if name not in structure_materials and name not in reconstructed:
            result = register_water(result, native, density,
                                    pure_sea=name.startswith('water') and not mixed, mask=mask)
    if name in reef_materials:
        reef = reef_materials[name]
        x0, y0, x1, y1 = reef['bounds']
        size = ((x1 - x0) * density, (y1 - y0) * density)
        body = independently_sample(reef['rgb'], size)
        coverage = np.asarray(Image.fromarray(reef['coverage']).resize(size, Image.Resampling.LANCZOS)) / 255
        support = ndimage.binary_dilation(reef['mask'], iterations=1)[y0:y1, x0:x1]
        coverage *= support.repeat(density, 0).repeat(density, 1)
        region = result[y0 * density:y1 * density, x0 * density:x1 * density]
        region[:] = np.uint8(np.clip(body * coverage[..., None] + region * (1 - coverage[..., None]), 0, 255))
    if name in continuous_structure_members:
        result, correction = continuous_structure_contacts(result, native, density,
            profile.get('continuousStructureContactPolicy'))
        material_corrections.setdefault(name, {}).setdefault('continuousStructureContacts', {})[str(density)] = correction
    return result


metadata_keys = ['member', 'subTile', 'grid', 'block', 'logical', 'offset', 'origin', 'height',
                 'terrainType', 'rampType', 'extra', 'hasExtraData', 'hasZData', 'radar']
if replaced_groups:
    previous_members = {member['member']: member for group in replaced_groups for member in group['members']}
    for member in members:
        previous = previous_members[member['member']]
        assert previous['sourceHashes'] == {edition: member['native']['sha256'] for edition in ['ra2', 'yr']}
        assert previous['images'] == [{key: image[key] for key in metadata_keys}
            for image in member['native']['images']], 'Material correction must preserve native metadata.'


def packed_height(selected, density):
    width, x, y, row = (2048 if density == 2 else 4096), 2, 2, 0
    for member in selected:
        for image in member['native']['images']:
            w, h = [n * density for n in image['logical']]
            assert w + 4 <= width
            if x + w + 2 > width:
                x, y, row = 2, y + row + 4, 0
            x += w + 4
            row = max(row, h)
    return y + row + 2


expanded_groups = []
for identity in wanted:
    selected = [member for member in members if member['setIndex'] in groups[identity]]
    assert selected, f'Empty resource group: {identity}'
    if all(packed_height(selected, density) <= 8192 for density in [2, 4]):
        expanded_groups.append((identity, selected))
        continue
    families = {}
    for member in selected:
        key = re.sub(r'([0-9])[a-z](\.tem)$', r'\1\2', member['member'])
        families.setdefault(key, []).append(member)
    chunks, pending = [], []
    for family in families.values():
        assert all(packed_height(family, density) <= 8192 for density in [2, 4]), 'Native variant family exceeds one atlas'
        if pending and any(packed_height(pending + family, density) > 8192 for density in [2, 4]):
            chunks.append(pending)
            pending = []
        pending.extend(family)
    if pending:
        chunks.append(pending)
    expanded_groups.extend((f'{identity}-part{index:02d}', chunk) for index, chunk in enumerate(chunks, 1))
assert len(base['groups']) + len(expanded_groups) <= args.max_groups <= 64
destination = Path('.local/terrain-packs') / args.revision
destination.mkdir(parents=True, exist_ok=False)
evidence = root / args.revision
evidence.mkdir(exist_ok=False)
manifest = copy.deepcopy(base)
manifest.update(revision=args.revision, scope='ACCEPTED_BASE_PLUS_COMPLETE_AUTHORED_REUSABLE_RESOURCE_GROUPS')
if not base['groups']:
    manifest['scope'] = 'COMPLETE_AUTHORED_THEATER_REPRESENTATIVE_RESOURCE_GROUPS'
if replaced_groups:
    manifest['scope'] = 'ACCEPTED_BASE_WITH_AUTHORIZED_COMPLETE_GROUP_MATERIAL_CORRECTIONS'
for group in manifest['groups']:
    for variant in group['variants']:
        original = base_root / variant['file']
        assert sha(original) == variant['sha256']
        with (destination / variant['file']).open('xb') as stream:
            stream.write(original.read_bytes())
new_atlas_bytes = defaultdict(int)
for identity, selected in expanded_groups:
    declared = []
    for member in selected:
        native = member['native']
        declared.append(dict(member=member['member'], sourceHashes={'ra2': native['sha256'], 'yr': native['sha256']},
                             images=[{key: image[key] for key in metadata_keys} for image in native['images']]))
    assert selected, f'Empty resource group: {identity}'
    group = dict(id=args.group_prefix + '-' + identity, scope='COMPLETE_REUSABLE_NATIVE_RESOURCE_GROUP', members=declared, variants=[])
    if reconstructed:
        group['contourReconstruction'] = CONTOUR_POLICY
    for density in [2, 4]:
        frames = []
        for member in selected:
            name, native, info = member['member'], member['native'], layout[member['member']]
            whole = assembly(name, density)
            for image in native['images']:
                raw = prepared / 'native' / image['file']
                assert sha(raw) == image['rgbaSha256']
                original = Image.frombytes('RGBA', tuple(image['logical']), raw.read_bytes())
                expected = np.asarray(original.resize(tuple(n * density for n in original.size), Image.Resampling.NEAREST))
                if image['nativeOffset'] <= 0 or not expected[..., 3].any():
                    frame = Image.fromarray(expected)
                else:
                    rect = next(part['rect'] for part in info['parts'] if part['subTile'] == image['subTile'])
                    x, y, w, h = [n * density for n in rect]
                    rgb = extrude(whole[y:y + h, x:x + w], expected[..., 3] > 0)
                    if name in reconstructed:
                        # The mother provides all visible material detail. Do not
                        # restore native pixel RGB or per-cell photometry at cuts.
                        pass
                    elif profile.get('nativeSubTileContacts') and name in coast_materials:
                        rgb = register_coast_contacts(rgb, np.asarray(original), density)
                        if name in coast_water_masks:
                            water = (pool_water_support[name] if name in pool_water_support else
                                     coast_water_masks[name].repeat(density, 0).repeat(density, 1))
                            owned = water[y:y + h, x:x + w] & (expected[..., 3] > 0)
                            rgb[owned] = whole[y:y + h, x:x + w][owned]
                        rgb = extrude(rgb, expected[..., 3] > 0)
                    elif profile.get('nativeSubTileContacts') and name not in continuous_roads:
                        rgb = register_contacts(rgb, np.asarray(original), density,
                                                diffuse=name in snow_diffuse_contacts or name in coast_forms,
                                                diffuse_sigma=.65 if name in coast_forms else 1.2)
                        rgb = extrude(rgb, expected[..., 3] > 0)
                    if name in structure_materials or name in theater_coast_materials or name in theater_structure_materials:
                        rgb, residue = reject_new_matte(rgb, np.asarray(original), density)
                        if residue:
                            material_corrections.setdefault(name, {}).setdefault('removedCalibrationMattePixels', {})[
                                str(density) + ':' + str(image['subTile'])] = residue
                    alpha = extra_alpha(np.asarray(original), image, density) if name in reconstructed else expected[..., 3]
                    frame = Image.fromarray(np.dstack([rgb, alpha]))
                frames.append(frame)
        width, x, y, row, rects = (2048 if density == 2 else 4096), 2, 2, 0, []
        for frame in frames:
            if x + frame.width + 2 > width:
                x, y, row = 2, y + row + 4, 0
            rects.append([x, y, *frame.size])
            x += frame.width + 4
            row = max(row, frame.height)
        assert y + row + 2 <= 8192, 'Terrain maximum texture size exceeded'
        atlas = Image.new('RGBA', (width, y + row + 2))
        for frame, (x, y, w, h) in zip(frames, rects):
            atlas.paste(Image.fromarray(np.pad(np.asarray(frame), ((2, 2), (2, 2), (0, 0)), mode='edge')), (x - 2, y - 2))
        filename = f"{group['id']}-{density}x.rgba"
        with (destination / filename).open('xb') as stream:
            stream.write(atlas.tobytes())
        atlas.save(evidence / f'{group["id"]}-{density}x-atlas.png')
        group['variants'].append(dict(density=density, file=filename, size=list(atlas.size), rects=rects,
                                     sha256=sha(destination / filename)))
        new_atlas_bytes[str(density)] += atlas.width * atlas.height * 4
    manifest['groups'].append(group)
assert len(manifest['groups']) <= args.max_groups
with (destination / 'manifest.json').open('x') as stream:
    stream.write(json.dumps(manifest, separators=(',', ':')) + '\n')
pointer = dict(schemaVersion=1, revision=args.revision, sha256=sha(destination / 'manifest.json'))
recipe = dict(schema=args.schema, pack=pointer, acceptedBase=base_pointer,
              acceptedAtlases='Exact unaffected accepted base bytes; no re-export',
              authorizedReplacementGroups=[dict(id=group['id'], members=[member['member']
                  for member in group['members']], variants=group['variants']) for group in replaced_groups],
              groups=[identity for identity, _ in expanded_groups],
              newMembers=len(members), newImages=sum(len(m['native']['images']) for m in members),
              independentDensities=[2, 4], nativeAlphaAndMetadata=(
                  'EXACT_METADATA_AND_MAIN_FOOTPRINT_BOUNDED_EXTRA_CONTOURS' if reconstructed else 'EXACT'),
              placeholders='EXACT_NATIVE',
              newAtlasBytes=dict(new_atlas_bytes), masters=registered, paletteRegistration=palette,
              nativeMaterialCorrections=material_corrections,
              materialProfile=profile,
              runtimeAcceptance=False, wholeMapComplete=False)
(evidence / 'recipe.json').write_text(json.dumps(recipe, indent=2) + '\n')
print(json.dumps({key: recipe[key] for key in ['pack', 'groups', 'newMembers', 'newImages', 'newAtlasBytes']}))
