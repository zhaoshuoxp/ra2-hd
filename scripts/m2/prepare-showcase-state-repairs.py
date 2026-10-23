"""Prepare source-only state repairs for visually rejected native objects."""
import hashlib
import json
from pathlib import Path

source = Path('.artifacts/m2-2/authoring-shp-v1')
root = Path('.artifacts/m2-2/authoring-shp-state-repairs-v1')
root.mkdir(exist_ok=False)
work = json.loads((source / 'worklist.json').read_text())
batches = {batch['name']: batch for batch in work['batches']}
notes = {
    'shp-building-1254-1x2-003': 'Both cells show their exact original collapsed building rubble. '
        'Preserve the original low debris shapes, twisted industrial metal and recognizable native signs and parts.',
    'shp-building-1254-1x2-007': 'Both cells are the original fully collapsed building debris. '
        'Trace each low rubble silhouette, native roof slabs, masonry, metal and separate debris exactly.',
    'shp-building-1254-3x2-001': 'Cell 1 is the original DAMAGED TWO FARM SILOS: two cylindrical corrugated '
        'metal farm grain silos, one broken with an opening, their native connecting ladder and roofs. '
        'Cells 2 and 3 are the original intact and damaged statue and circular plinth. '
        'Keep each exact different native object type and state.',
    'shp-building-1254-3x4-001': 'The first two cells are ONLY the native torn collapsed tent roofs '
        'and separate roof fragments, preserving every gap and the original shallow flat roof shapes. '
        'The next cells are the exact original swing frame, circular timber base and long shallow '
        'building debris. Trace each original object separately.',
    'shp-overlay-1254-4x4-003': 'Cells 1 through 8 are BLACK IRON PICKET FENCE parts in broken native states, '
        'with thin vertical black metal uprights and horizontal iron rails, exact original joints and gaps. '
        'Cells 9 and 10 are the original individual tan rocks. Cells 11 through 16 are the exact '
        'RED BROWN BRICK wall parts, with small individual rectangular red brown masonry bricks and pale mortar.',
    'shp-overlay-1254-4x4-005': 'Every cell contains the original damaged RED BROWN BRICK masonry wall '
        'or collapsed brick debris. Keep the rectangular small masonry bricks, pale mortar, hollow gaps, '
        'broken native wall outline and its native brown-red fixed material. Subdued masonry texture.',
    'shp-overlay-1254-4x4-007': 'Every cell contains WHITE PAINTED WOOD PICKET FENCE parts in original '
        'intact and damaged states. Preserve ALL thin vertical pointed WHITE pickets, WHITE horizontal '
        'rails, native heights, native joints and original broken gaps. White fixed paint throughout.',
    'shp-overlay-1254-4x4-008': 'The SIX occupied first cells contain WHITE PAINTED WOOD PICKET FENCE '
        'parts in original damaged states. Preserve their thin pointed WHITE vertical pickets, WHITE '
        'horizontal rails, native heights, gaps and exact native joint shapes. The other ten cells stay empty.',
}
records = []
for name, subject in notes.items():
    batch = batches[name]
    reference = Path('.artifacts/m2-2/rubble-native-guides-v3') / (name + '-reference.png')
    if not reference.exists():
        reference = source / (name + '-reference.png')
    (root / (name + '-reference.png')).write_bytes(reference.read_bytes())
    grid = name.split('-')[-2].split('x')
    prompt = subject + f'\n\nEdit this sole native guide into a fine hand-painted realistic transparent '
    prompt += f'RTS game sprite atlas: EXACTLY {grid[0]} columns and {grid[1]} rows. '
    prompt += 'Each occupied cell depicts precisely its own native subject, its original fixed colors and '
    prompt += 'its exact normal, damaged, occupied or rubble state. Native positions, proportions, orientation, '
    prompt += 'silhouettes and scale remain the geometry authority. Trace the native guide; improve only fine '
    prompt += 'painted texture detail. Subdued native contrast and upper-left lighting. Transparent background '
    prompt += 'and gutters. No ground plane, cast shadows, labels, unrelated parts or extra cells. '
    prompt += 'Preserve all empty cells. Output full composition 1254 by 1254.\n'
    (root / (name + '-prompt.txt')).write_text(prompt)
    master = source / (name + '-master.png')
    records.append(dict(name=name, slots=batch['slots'], rejectedMaster=str(master),
        sha256=hashlib.sha256(master.read_bytes()).hexdigest(),
        reason='Visual inspection found copied reference objects or incorrect native fixed material or frame state.',
        status='SOURCE_ONLY_STATE_REPAIR_PENDING'))
(root / 'audit.json').write_text(json.dumps(dict(schema='m2-2-shp-state-repair-v1', boards=records), indent=2) + '\n')
print(json.dumps(dict(boards=list(notes))))
