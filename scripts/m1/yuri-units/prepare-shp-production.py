"""Prepare source-first complete native-slot production after representative acceptance."""
import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path('.artifacts/yuri-units')
POLICY = {
    'INIT': 'Slender bald gas-masked man, dark charcoal uniform, modest red torso and knees, raised gray back equipment behind the head. Preserve the distinct bend in every phase. Ready left arm hangs down where shown. A firing phase uses ONE shared small flame between both hands, only if present in that exact source frame; its fabric can brighten. Never helmet, bulky armor, invented hand-held block, or two separate flames.',
    'BRUTE': 'Large muscular gray mutant, small bald head, exposed gray torso and arms, native red face covering and trousers, olive boots. Follow the original fists, stride, facing and collapse; front-facing backward falls remain front-facing.',
    'VIRUS': 'Lean adult female sniper with native black hair, a plain short-sleeved dark red uniform shirt, gray waist belt, olive-gray trousers, modest red knee bands, slate-black tall boots and dark gray forearm gloves. Preserve exact rifle length, stock, handedness and pitch. No bald head, gas mask, helmet, backpack or shoulder armor.',
    'YURIPR': 'Bald human Yuri inside an open flying platform; entire lower body contained inside. Plain close-fitting red and dark charcoal tunic, narrow sleeves, no head crest, gold trim or badges. Red strips belong ON each upright rail post and curve downward and outward; spaces BETWEEN posts remain open. A narrower solid cylindrical lower base tapers gently downward and ends in a red band. Preserve source and accepted base/platform proportions. No legless cyborg, exposed engine, robe cuffs or chrome redesign.',
    'SLAV': 'Native lean hunched worker with visible bare head and arms, simple worn clothing and red owner pants. Preserve original shovel, carried load, stance and work motion. No combat armor, gas mask, psychic equipment or invented weapon.'
}
STYLES = {
    'INIT': {'default': ['INIT-ready-native-v8.png'], 'Walk': ['INIT-walk-native-v9.png'], 'FireUp': ['INIT-fire-native-v8.png'], 'Die1': ['INIT-die-native-v8.png']},
    'BRUTE': {'default': ['BRUTE-v2-raw.png'], 'Die1': ['BRUTE-v2-raw.png', 'BRUTE-death-front-v3.png'], 'Die2': ['BRUTE-v2-raw.png', 'BRUTE-death-front-v3.png']},
    'YURIPR': {'default': ['YURIPR-ready-native-v11.png']}
}


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def prepare(output):
    acceptance = json.loads(Path('docs/yuri-units-representative-acceptance.json').read_text())
    assert acceptance['decision'] == 'REPRESENTATIVE_DIRECTION_ACCEPTED_PRODUCTION_AUTHORIZED'
    ledger = json.loads((ROOT / 'ledger.json').read_text())
    entries = [r for r in ledger['rows'] if r['included'] and not r.get('reuse')] + ledger['children']
    output.mkdir(parents=True, exist_ok=False)
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 28)
    worklist = {'kind': 'NATIVE_SLOT_AUTHORING_WORKLIST', 'taskId': 'D', 'runtimeActivation': False,
                'acceptanceReceipt': 'docs/yuri-units-representative-acceptance.json', 'families': {}}
    for row in entries:
        if row['representation'] != 'SHP':
            continue
        identity = row['id']
        family = {'acceptance': 'DIRECTION_ACCEPTED', 'members': [], 'complete': False}
        for member in row['members']:
            source_path = ROOT / 'source-v2' / (member + '.json')
            source = json.loads(source_path.read_text())
            count = len(source['frames']) if row.get('nativeContract', {}).get('noShadow', False) else len(source['frames']) // 2
            membership = [[] for _ in range(count)]
            anomalies = []
            priority = ['Ready', 'Walk', 'Idle1', 'Idle2', 'Crawl', 'Die1', 'Die2', 'FireUp', 'FireProne', 'Down', 'Up', 'Deploy', 'DeployedFire', 'SecondaryFire', 'Shovel', 'Carry', 'Cheer', 'Paradrop']
            ordered = sorted(row['sequences'], key=lambda name: priority.index(name) if name in priority else 100)
            for action in ordered:
                spec = row['sequences'][action]
                values = spec.split(',')
                if len(values) < 3:
                    continue
                start, length, stride = map(int, values[:3])
                for facing in range(8 if stride else 1):
                    for phase in range(length):
                        index = start + stride * facing + phase
                        if 0 <= index < count:
                            membership[index].append({'action': action, 'facing': facing, 'phase': phase})
                        else:
                            anomalies.append({'action': action, 'facing': facing, 'phase': phase, 'index': index})
            slots, groups, bodies = [], [], {}
            for index, frame in enumerate(source['frames'][:count]):
                state = membership[index][0]['action'] if membership[index] else 'NativeExtra'
                slots.append({'frame': index, 'empty': frame['empty'], 'sourceSha256': frame['sha256'],
                              'trim': [frame[k] for k in ['x', 'y', 'width', 'height']],
                              'sequenceMembership': membership[index],
                              'status': 'EMPTY_NATIVE' if frame['empty'] else 'AWAITING_AUTHORING'})
                if frame['empty']:
                    continue
                data = np.array(frame['pixels'], dtype=np.uint8).reshape(frame['height'], frame['width'])
                body = Image.fromarray(((data != 0) & (data != 12)).astype(np.uint8) * 255).getbbox()
                if not body:
                    raise ValueError(f'Nonempty body has no color: {identity}/{index}')
                bodies[index] = body
                if not groups or groups[-1][0] != state:
                    groups.append((state, []))
                groups[-1][1].append(index)
            batches = []
            for state, group in groups:
                maximum = max(max(bodies[i][2] - bodies[i][0], bodies[i][3] - bodies[i][1]) for i in group)
                limit = 16 if maximum <= 54 else 9 if maximum <= 64 else 4 if maximum <= 100 else 2
                for offset in range(0, len(group), limit):
                    ids = group[offset:offset + limit]
                    columns = min(len(ids), math.ceil(math.sqrt(limit)))
                    rows = math.ceil(len(ids) / columns)
                    cell = 512
                    board = Image.new('RGB', (columns * cell, rows * cell), (72, 88, 78))
                    draw = ImageDraw.Draw(board)
                    samples = []
                    batch_id = f'{Path(member).stem}-{state.lower()}-{ids[0]:03d}-{ids[-1]:03d}'
                    folder = output / identity / batch_id
                    folder.mkdir(parents=True)
                    for position, index in enumerate(ids):
                        frame = source['frames'][index]
                        data = np.array(frame['pixels'], dtype=np.uint8).reshape(frame['height'], frame['width'])
                        rgba = np.zeros((*data.shape, 4), dtype=np.uint8)
                        rgba[:, :, :3] = np.array(source['palette'], dtype=np.uint8)[data]
                        rgba[:, :, 3] = (data != 0).astype(np.uint8) * 255
                        body = bodies[index]
                        ground = data == 12
                        ground[body[1]:body[3], body[0]:body[2]] = False
                        rgba[ground] = 0
                        sprite = Image.fromarray(rgba).crop(body)
                        factor = min(16, 360 / sprite.width, 360 / sprite.height)
                        size = tuple(round(n * factor) for n in sprite.size)
                        x, y = position % columns * cell, position // columns * cell
                        origin = (x + (cell - size[0]) // 2, y + 68 + (380 - size[1]) // 2)
                        sprite = sprite.resize(size, Image.Resampling.NEAREST)
                        board.paste(sprite, origin, sprite)
                        draw.text((x + 18, y + 16), f'FRAME {index:03d}', font=font, fill='white')
                        samples.append({'frame': index, 'cell': [x, y, cell, cell], 'contentOrigin': origin,
                                        'referenceScale': factor, 'bodyColorBounds': body,
                                        'nativeGroundPixels': int(ground.sum())})
                    for position in range(len(ids), columns * rows):
                        draw.text((position % columns * cell + 18, position // columns * cell + 16), 'EMPTY', font=font, fill='white')
                    reference = folder / 'native-poses.png'
                    board.save(reference)
                    styles = [str(ROOT / 'representatives-v1' / name) for name in STYLES.get(identity, {}).get(state, STYLES.get(identity, {}).get('default', []))]
                    views = ['back / away', 'back-left', 'left profile', 'front-left', 'front', 'front-right', 'right profile', 'back-right']
                    hints = []
                    for index in ids:
                        info = membership[index][0] if membership[index] else None
                        if info and int(row['sequences'][info['action']].split(',')[2]):
                            hints.append(f"{index:03d}: {views[info['facing']]} phase {info['phase']}")
                    prompt = f'''Use case: precise-object-edit, native game sprite production.
Image 1 is the EDIT TARGET: exact original {identity} {state} frames {ids}. Additional images, if any, are the user-approved SAME-UNIT MATERIAL reference, never replacement poses. Native poses and equipment placement take priority over those style images.
Create a high-resolution transparent sprite board with exactly {columns} columns, {rows} rows, and {len(ids)} occupied cells in the ORIGINAL row-major order. Keep any remaining cells completely empty. Each character is centered in its cell and occupies about 72 percent of the cell's largest dimension, with clear transparent gutters. Omit all text and labels. Preserve board aspect ratio {columns}:{rows}.
{POLICY[identity]}
Redraw EVERY source cell with fine painted-realistic material detail, coherent anatomy/mechanics and upper-left lighting. Preserve its OWN facing, body bend, head height, limbs, hand/tool positions, silhouette proportions, animation phase and visible equipment. Never reuse a static pose or rotate a flat picture to stand in for another view. Native orientation notes: {'; '.join(hints) or 'Follow each exact native pose.'}
The original controls what exists: do not invent ornaments, extra tools, armor, effects, flames, gore, glows or detached pieces. Death and work phases must retain native motion. Preserve modest RED team-painted areas, dark gray equipment and intentional fixed skin/effect colors. Ground shadows are game-owned and exported separately: no black pedestal, ground patch, cast shadow, scenery or background. Genuine transparent alpha outside the figures, no checkerboard painted into the output. Preserve all feet, fine parts and native crop content. Check both arms and both hands in every view: a naturally hanging near-side arm must be complete, joined to the sleeve and visible beside the thigh. Do not accidentally erase a limb behind equipment. Do not simplify into cartoon or merely enlarge pixel art. Deliver the full exact grid; no missing, merged or extra figures.'''
                    prompt_path = folder / 'prompt.txt'
                    prompt_path.write_text(prompt + '\n')
                    batch = {'id': batch_id, 'boardSize': board.size, 'grid': [columns, rows], 'action': state,
                             'samples': samples, 'reference': str(reference), 'referenceSha256': sha(reference),
                             'prompt': str(prompt_path), 'styles': styles, 'styleSha256': [sha(Path(p)) for p in styles],
                             'nativeMaximumBodyExtent': maximum, 'status': 'AWAITING_AUTHORING'}
                    batches.append(batch)
                    (folder / 'batch.json').write_text(json.dumps(batch, indent=2) + '\n')
            assert sorted(s['frame'] for b in batches for s in b['samples']) == [s['frame'] for s in slots if not s['empty']]
            family['members'].append({'sourceMember': member, 'sourceFile': str(source_path), 'sourceSha256': source['sha256'],
                                      'requiredSlots': count, 'slots': slots, 'batches': batches,
                                      'sequenceOutOfRange': anomalies, 'complete': False})
        worklist['families'][identity] = family
    (output / 'worklist.json').write_text(json.dumps(worklist, indent=2) + '\n')
    print(json.dumps({'families': len(worklist['families']), 'slots': sum(m['requiredSlots'] for f in worklist['families'].values() for m in f['members']),
                      'batches': sum(len(m['batches']) for f in worklist['families'].values() for m in f['members']), 'runtimeActivation': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    prepare(parser.parse_args().output)
