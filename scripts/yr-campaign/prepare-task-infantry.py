"""Prepare original NPC slots, source sequences and complete HD authoring guides."""
import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.local/source-art/yr-campaign-v1/task-infantry'
read = lambda file: json.loads(Path(file).read_text())
sha = lambda file: hashlib.sha256(Path(file).read_bytes()).hexdigest()
write = lambda file, value: Path(file).write_text(json.dumps(value, indent=2) + '\n')
sequence_file = BASE / 'sequences-r1.json'
sequences = read(sequence_file)
inventory = read(ROOT / '.artifacts/yr-campaign/art-inventory-r30/inventory.json')
requests = [('original-desert-r1', ['CAML', 'EINS', 'MUMY']),
    ('original-romanov-desert-r1', ['RMNV']), ('original-newurban-r1', ['PENTGEN']),
    ('original-dinosaur-r1', ['DNOB'])]
args.output = args.output.resolve()
args.output.mkdir(parents=True, exist_ok=False)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 28)
work = dict(kind='NATIVE_SLOT_AUTHORING_WORKLIST', taskId='YR_ALL14', runtimeActivation=False,
    sourceSequenceFile=str(sequence_file), sourceSequenceSha256=sha(sequence_file), families={})
for directory, identities in requests:
    original_file = BASE / directory / 'source.json'
    original = read(original_file)
    assert original['edition'] == 'yr' and original['theater'] in ('DESERT', 'NEWURBAN')
    for identity in identities:
        native, = [item for item in original['sources'] if item['identity'] == identity]
        assert native['hasShadow'] and native['totalFrames'] == 2 * native['bodyFrames']
        assert sha(original_file.parent / 'native' / native['member']) == native['sha256']
        palette_file = original_file.parent / 'native' / native['palette']['member']
        assert sha(palette_file) == native['palette']['sha256']
        colors = np.frombuffer(palette_file.read_bytes(), np.uint8).reshape(256, 3).astype(int) * 4
        source_frames, bodies = [], {}
        for frame in native['frames']:
            index_file = original_file.parent / 'native' / (native['member'] + f"-{frame['slot']}.index")
            assert sha(index_file) == frame['indexSha256']
            width, height = frame['size']
            pixels = np.frombuffer(index_file.read_bytes(), np.uint8).reshape(height, width)
            assert frame['empty'] == (not pixels.any())
            if width and height:
                rgba = np.asarray(Image.open(original_file.parent / 'native' / frame['png']).convert('RGBA'))
                active = pixels > 0
                assert np.array_equal(rgba[..., 3] > 0, active)
                assert np.array_equal(rgba[..., :3][active], colors[pixels][active])
            source_frames.append(dict(index=frame['slot'], x=frame['origin'][0], y=frame['origin'][1],
                width=width, height=height, empty=frame['empty'], pixels=pixels.ravel().tolist(),
                sha256=frame['indexSha256']))
            if frame['slot'] < native['bodyFrames'] and not frame['empty']:
                body = Image.fromarray(np.uint8((pixels != 0) & (pixels != 12)) * 255).getbbox()
                assert body, 'A nonempty original slot must retain body color'
                bodies[frame['slot']] = body
        contexts = [row for row in inventory['rows'] if row['kind'] == 'infantry' and row['id'] == identity]
        assert contexts and all(row['source']['sha256'] == native['sha256'] for row in contexts)
        missions = sorted({mission for row in contexts for mission in row['usage']})
        sequence = sequences['sequences'][native['nativeArt']['Sequence']]
        membership = [[] for _ in range(native['bodyFrames'])]
        anomalies = []
        for action, specification in sequence.items():
            fields = specification.split(',')
            assert len(fields) >= 3
            start, count, stride = map(int, fields[:3])
            for facing in range(8 if stride else 1):
                for phase in range(count):
                    slot = start + facing * stride + phase
                    if 0 <= slot < len(membership):
                        membership[slot].append(dict(action=action, facing=facing, phase=phase))
                    else:
                        anomalies.append(dict(action=action, facing=facing, phase=phase, slot=slot))
        folder = args.output / identity
        folder.mkdir()
        source_file = folder / (native['member'] + '.json')
        document = dict(schema='yr-original-task-infantry-slots-v1', identity=identity, member=native['member'],
            sha256=native['sha256'], canvas=native['canvas'], palette=colors.tolist(),
            paletteIdentity=native['palette'], bodyFrames=native['bodyFrames'], frames=source_frames,
            nativeArt=native['nativeArt'], nativeRules=native['nativeRules'],
            originalShadowRendering=native['nativeRules'].get('NoShadow', 'no').lower() != 'yes',
            sequences=sequence, originalGuide=dict(file=str(original_file), sha256=sha(original_file)),
            sourceContexts=[dict(theater=row['theater'], source=row['source'], missions=list(row['usage']))
                for row in contexts])
        if identity == 'RMNV':
            duplicate_file = BASE / 'original-newurban-r1/source.json'
            duplicate, = [item for item in read(duplicate_file)['sources'] if item['identity'] == identity]
            assert duplicate['sha256'] == native['sha256'] and duplicate['palette']['sha256'] == native['palette']['sha256']
            assert duplicate['canvas'] == native['canvas'] and duplicate['frames'] == native['frames']
            document['crossTheaterClosure'] = dict(status='EXACT_ORIGINAL_BODY_AND_PALETTE_BYTES_BOTH_THEATERS',
                duplicateSource=str(duplicate_file), duplicateSourceSha256=sha(duplicate_file))
        write(source_file, document)
        slots, groups = [], []
        for frame in source_frames[:native['bodyFrames']]:
            index = frame['index']
            slots.append(dict(frame=index, empty=frame['empty'], sourceSha256=frame['sha256'],
                trim=[frame[key] for key in ['x', 'y', 'width', 'height']],
                sequenceMembership=membership[index], status='EMPTY_NATIVE' if frame['empty'] else 'AWAITING_AUTHORING'))
            if frame['empty']:
                continue
            action = membership[index][0]['action'] if membership[index] else 'NativeExtra'
            if not groups or groups[-1][0] != action:
                groups.append((action, []))
            groups[-1][1].append(index)
        batches = []
        for action, group in groups:
            maximum = max(max(bodies[index][2]-bodies[index][0], bodies[index][3]-bodies[index][1]) for index in group)
            limit = 16 if maximum <= 54 else 9 if maximum <= 80 else 4 if maximum <= 110 else 2 if maximum <= 160 else 1
            for offset in range(0, len(group), limit):
                ids = group[offset:offset+limit]
                columns = min(len(ids), math.ceil(math.sqrt(limit)))
                rows = math.ceil(len(ids)/columns)
                cell_width, cell_height = (1536, 1024) if limit == 1 else (768, 1024) if limit == 2 else (512, 512)
                board = Image.new('RGB', (columns*cell_width, rows*cell_height), (72, 88, 78))
                draw, samples = ImageDraw.Draw(board), []
                batch_id = f'{Path(native["member"]).stem}-{action.lower()}-{ids[0]:03d}-{ids[-1]:03d}'
                batch_folder = folder / batch_id
                batch_folder.mkdir()
                for position, index in enumerate(ids):
                    frame = source_frames[index]
                    pixels = np.array(frame['pixels'], np.uint8).reshape(frame['height'], frame['width'])
                    rgba = np.dstack([colors[pixels].astype(np.uint8), np.uint8(pixels != 0)*255])
                    body = bodies[index]
                    ground = pixels == 12
                    ground[body[1]:body[3], body[0]:body[2]] = False
                    rgba[ground] = 0
                    sprite = Image.fromarray(rgba).crop(body)
                    scale = min(24, (cell_width-96)/sprite.width, (cell_height-132)/sprite.height)
                    size = tuple(round(value*scale) for value in sprite.size)
                    x, y = position % columns*cell_width, position // columns*cell_height
                    origin = [x+(cell_width-size[0])//2, y+88+(cell_height-132-size[1])//2]
                    enlarged = sprite.resize(size, Image.Resampling.NEAREST)
                    board.paste(enlarged, origin, enlarged)
                    draw.text((x+18,y+18),f'FRAME {index:03d}',font=font,fill='white')
                    samples.append(dict(frame=index,cell=[x,y,cell_width,cell_height],contentOrigin=origin,
                        referenceScale=scale,bodyColorBounds=body,nativeGroundPixels=int(ground.sum())))
                reference = batch_folder / 'native-poses.png'
                board.save(reference)
                species = ('the original partially submerged Brachiosaurus (DNOB), preserving only '
                    'the exact visible head/neck/back/tail segments and their source separations'
                    if identity == 'DNOB' else 'the exact original ' + identity)
                prompt = ('Use case: precise-object-edit. Edit target: this exact native game sprite guide. '
                    f'Rebuild {species}, original action {action}, frames {ids}, in the same {columns} columns and {rows} rows. '
                    'Keep each original pose, facing, phase, anatomy, equipment, clothing, original colors, light, body scale and position. '
                    'Every occupied guide cell remains occupied and every empty cell remains empty. Material references may guide finish only. '
                    'Reconstruct smooth clear materials and crisp continuous antialiased features; original pixels are design controls only. '
                    'Preserve every original red region and all fixed materials exactly; add no new red or ownership regions. '
                    'No invented costume, equipment, anatomical parts, effects, alternate pose, grain, pixel blocks, blur or sharpening. '
                    'No text or labels anywhere, including guide frame numbers. No floor, base, cast shadows, halos, outlines or checkerboard. '
                    'Genuinely transparent background and gutters. Keep all subjects large enough for true independent 4X exports.')
                if identity == 'DNOB':
                    prompt += (' The original source creature is partly submerged in its lake. Preserve every '
                        'disconnected visible segment at its exact relative position and keep all omitted '
                        'submerged regions transparent. Do not connect the segments or invent a complete '
                        'body, belly, legs, shore, water or effects absent from this exact source frame.')
                prompt_file = batch_folder / 'prompt.txt'
                prompt_file.write_text(prompt+'\n')
                batch = dict(id=batch_id,boardSize=list(board.size),grid=[columns,rows],action=action,
                    samples=samples,reference=str(reference),referenceSha256=sha(reference),prompt=str(prompt_file),
                    styles=[],nativeMaximumBodyExtent=maximum,status='AWAITING_AUTHORING')
                batches.append(batch)
                write(batch_folder/'batch.json',batch)
        assert sorted(sample['frame'] for batch in batches for sample in batch['samples']) == sorted(bodies)
        ready = list(map(int, sequence['Ready'].split(',')[:3]))
        work['families'][identity] = dict(acceptance='ORIGINAL_DESIGN_RECONSTRUCTION_AUTHORIZED',complete=False,
            sourceCampaigns=[dict(mission=mission,sha256=sha(ROOT/'.local/campaign/yr'/mission[:-4]/mission)) for mission in missions],
            readyDirectionSlots=[ready[0]+facing*ready[2] for facing in range(8)],
            members=[dict(sourceMember=native['member'],sourceFile=str(source_file),sourceSha256=native['sha256'],
                requiredSlots=native['bodyFrames'],slots=slots,batches=batches,sequenceOutOfRange=anomalies,complete=False)])
write(args.output/'worklist.json',work)
print(json.dumps(dict(status='COMPLETE_ORIGINAL_NPC_SLOT_GUIDES_READY_UNSELECTED',families=len(work['families']),
    bodySlots=sum(member['requiredSlots'] for family in work['families'].values() for member in family['members']),
    authoredSlots=sum(len(batch['samples']) for family in work['families'].values() for member in family['members'] for batch in member['batches']),
    batches=sum(len(member['batches']) for family in work['families'].values() for member in family['members']),
    selectedResourcesChanged=0,output=str(args.output))))
