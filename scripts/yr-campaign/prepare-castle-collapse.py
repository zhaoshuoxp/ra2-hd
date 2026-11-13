"""Prepare every source-pinned castle-collapse pose for independent HD authoring."""
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root = Path('.local/source-art/yr-campaign-v1/transylvania-castle-collapse')
source_file = root / 'original/source.json'
source = json.loads(source_file.read_text())
actor, = source['sources']
assert actor['member'] == 'cttr03dm.shp' and actor['bodyFrames'] == 87
assert actor['parentRules']['DestroyAnim'] == 'CATR03DM'
jobs = root / 'pose-jobs-r1'
jobs.mkdir(exist_ok=False)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 28)
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
records = []
boards = []
for offset in range(0, 87, 20):
    board = Image.new('RGBA', (1600, 2000), (65, 75, 65, 255))
    draw = ImageDraw.Draw(board)
    for slot in range(offset, min(87, offset + 20)):
        frame = actor['frames'][slot]
        original = root / 'original/native' / frame['png']
        image = Image.open(original).convert('RGBA')
        indices = (root / 'original/native' / f"{actor['member']}-{slot}.index").read_bytes()
        assert hashlib.sha256(indices).hexdigest() == frame['indexSha256']
        alpha = image.getchannel('A')
        alpha.putdata([value if index not in (0, 12) else 0 for value, index in zip(alpha.getdata(), indices, strict=True)])
        image.putalpha(alpha)
        image = image.crop(image.getbbox())
        reference = Image.new('RGBA', (1536, 1536), (65, 75, 65, 255))
        scale = min(1380 / image.width, 1350 / image.height)
        enlarged = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.NEAREST)
        reference.alpha_composite(enlarged, ((1536 - enlarged.width) // 2, 95 + (1400 - enlarged.height) // 2))
        ImageDraw.Draw(reference).text((28, 24), f'ORIGINAL CATR03DM FRAME {slot:02d}', font=font, fill='white')
        file = jobs / f'castle-collapse-{slot:02d}.png'
        reference.save(file)
        thumb = image.resize((round(image.width * 1.4), round(image.height * 1.4)), Image.Resampling.NEAREST)
        i = slot - offset
        x, y = i % 4 * 400, i // 4 * 400
        board.alpha_composite(thumb, (x + (400 - thumb.width) // 2, y + 42 + (350 - thumb.height) // 2))
        draw.text((x + 12, y + 10), f'FRAME {slot:02d}', font=font, fill='white')
        prompt = (f'Create one complete clean HD isometric game sprite for original Yuri Transylvania castle collapse frame {slot:02d}. '
            'Image 1 is the exact original state authority: preserve its remaining towers, falling pieces, roof slopes, masonry, '
            'metal/gold trim, walls, walkway, grass, gate, stairs, foundation, debris, smoke and small yellow flashes in their precise '
            'places. Image 2 is the already authored intact material reference; use its clean material quality, not its intact state. '
            'Reconstruct the exact source state, including every removed or collapsed section; never restore a missing tower. '
            'Keep the original isometric camera, composition, proportions, green/black/gray/gold palette and lighting. Smooth clean '
            'stone/metal surfaces, continuous crisp antialiased architectural lines, controlled clear smoke and light effects. '
            'No source pixel blocks, grain, added noise, blur, sharpening, new features, redesign or scene background. '
            'One full isolated castle sprite only, actual transparent background, no ground shadow, labels or border. '
            'Use a large square image and let the entire original sprite occupy at least 1150 pixels across with clear small margins '
            'so this master supports an independently sampled true 4X export.')
        (jobs / f'castle-collapse-{slot:02d}.txt').write_text(prompt + '\n')
        records.append(dict(id=f'castle-collapse-{slot:02d}', frame=slot, reference=str(file), referenceSha256=sha(file),
                            prompt=str(jobs / f'castle-collapse-{slot:02d}.txt'), nativeFrame=frame))
    file = jobs / f'contact-{offset:02d}-{min(86, offset + 19):02d}.png'
    board.save(file)
    boards.append(str(file))
(jobs / 'worklist.json').write_text(json.dumps(dict(schema='yr-source-castle-collapse-authoring-v1',
    sourceJsonSha256=sha(source_file), bodyFrames=87, originalShadowFrames=87, jobs=records, contactBoards=boards,
    userVisualAcceptance='PENDING'), indent=2) + '\n')
print(json.dumps(dict(bodyFrames=len(records), originalShadowFrames=87, contactBoards=boards)))
