"""Prepare source-pinned pose batches for the two original Hollywood heroes."""
import hashlib
import json
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

base = Path('.local/source-art/yr-campaign-v1/hollywood-heroes')
original = base / 'original'
source = json.loads((original / 'source.json').read_text())
sequences = json.loads((original / 'sequences.json').read_text())
output = base / 'pose-jobs-r1'
output.mkdir(exist_ok=False)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 24)
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
jobs, actors = [], []
for actor in source['sources']:
    frames = actor['frames'][:actor['bodyFrames']]
    membership, unused = {frame['slot']: [] for frame in frames}, []
    for name, raw in sequences[actor['nativeArt']['Sequence']].items():
        values = raw.split(',')
        assert len(values) >= 3 and all(re.fullmatch(r'\d+', value) for value in values[:3])
        start, count, stride = map(int, values[:3])
        for facing in range(8 if stride else 1):
            for phase in range(count):
                slot = start + facing * stride + phase
                record = dict(sequence=name, facing=facing if stride else values[3:] or None, phase=phase)
                if slot in membership:
                    membership[slot].append(record)
                else:
                    unused.append(dict(slot=slot, **record))
    groups = {}
    for frame in frames:
        action = membership[frame['slot']][0]['sequence'] if membership[frame['slot']] else 'NativeExtra'
        groups.setdefault(action, []).append(frame['slot'])
    actor_jobs = []
    for action, slots in groups.items():
        for offset in range(0, len(slots), 12):
            batch = slots[offset:offset + 12]
            columns, rows = min(4, len(batch)), math.ceil(len(batch) / 4)
            board = Image.new('RGBA', (columns * 384, rows * 384), (65, 75, 65, 255))
            draw = ImageDraw.Draw(board)
            for i, slot in enumerate(batch):
                frame = frames[slot]
                image = Image.open(original / 'native' / frame['png']).convert('RGBA')
                indices = (original / 'native' / f"{actor['member']}-{slot}.index").read_bytes()
                assert hashlib.sha256(indices).hexdigest() == frame['indexSha256']
                alpha = image.getchannel('A')
                alpha.putdata([value if index not in (0, 12) else 0 for value, index in zip(alpha.getdata(), indices, strict=True)])
                image.putalpha(alpha)
                image = image.crop(image.getbbox())
                scale = min(8, 310 / image.width, 305 / image.height)
                image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.NEAREST)
                x, y = i % columns * 384, i // columns * 384
                board.alpha_composite(image, (x + (384 - image.width) // 2, y + 54 + (310 - image.height) // 2))
                draw.text((x + 16, y + 12), f"{actor['identity']} FRAME {slot:03}", font=font, fill='white')
            name = f"{actor['identity'].lower()}-{action.lower()}-{batch[0]:03}-{batch[-1]:03}"
            file = output / (name + '.png')
            board.save(file)
            prompt = (f"Native HD sprite authoring for original YR {actor['identity']}. Image 1 is the exact original pose authority; "
                      f"image 2 is the selected material reference. Redraw exactly {len(batch)} isolated full-body figures in a {columns}-column "
                      f"{rows}-row grid, source frames {batch} in row-major order. Preserve each original facing, camera, silhouette, pose, "
                      "weapon direction and action phase. Back views stay back views. Match the original clothing, palette, proportions "
                      "and lighting; the material reference controls clean materials only. Reconstruct smooth fabric, skin and metal "
                      "with clear continuous antialiased contours. Preserve every distinct walking, crawling, firing and dying phase. "
                      "No added armor or equipment, pixel texture, grain, red fringe, blur or sharpening. Center each subject in its "
                      "own cell with clear margins. Actual transparent background, no ground shadows, labels, borders or scenery. "
                      "Leave unused grid cells fully transparent.")
            (output / (name + '.txt')).write_text(prompt + '\n')
            job = dict(id=name, identity=actor['identity'], action=action, frames=batch, grid=[columns, rows],
                       reference=str(file), referenceSha256=sha(file), prompt=str(output / (name + '.txt')),
                       status='AWAITING_AUTHORED_MASTER_AND_NATIVE_DENSITY_REVIEW')
            jobs.append(job)
            actor_jobs.append(name)
    actors.append(dict(identity=actor['identity'], sourceSha256=actor['sha256'], canvas=actor['canvas'],
                       bodyFrames=actor['bodyFrames'], totalFrames=actor['totalFrames'],
                       originalShadows='Retain native second-half shadow slots unchanged.',
                       declaredOutOfBodySlots=unused, jobs=actor_jobs,
                       frames=[dict(slot=frame['slot'], origin=frame['origin'], size=frame['size'],
                                    indexSha256=frame['indexSha256'], membership=membership[frame['slot']]) for frame in frames]))
receipt = dict(schema='yr-original-hollywood-hero-authoring-worklist-v1', status='SOURCE_PINNED_AUTHORING_IN_PROGRESS_NOT_REGISTERED',
               mission=source['mission'], missionSha256=source['missionSha256'], sourceJsonSha256=sha(original / 'source.json'),
               sequencesSha256=sha(original / 'sequences.json'), actors=actors, jobs=jobs,
               userVisualAcceptance='PENDING', qualification='All native body slots are inventoried, including unreferenced extras. Source sequence slots outside the body range remain explicit original-data quirks; no new frame or gameplay use is invented.')
(output / 'worklist.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(actors=len(actors), bodyFrames=sum(actor['bodyFrames'] for actor in actors), jobs=len(jobs))))
