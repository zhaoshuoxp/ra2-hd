"""Render labeled source-shot lookup sheets; original checkpoints remain unchanged."""
import hashlib
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

def make_contacts(survey_file):
    survey_file = Path(survey_file)
    survey = json.loads(survey_file.read_text())
    directory = survey_file.parent
    target = directory / 'contacts'
    target.mkdir(exist_ok=True)
    points = {row['frame']: row for row in survey['checkpoints']}
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
    small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 21)
    records = []
    for shot in survey['shots']:
        columns = max(2, min(3, len(shot['checkpoints'])))
        sheet = Image.new('RGB', (columns * 400, 86 + math.ceil(len(shot['checkpoints']) / columns) * 342), '#111820')
        draw = ImageDraw.Draw(sheet)
        draw.text((12, 8), f"{survey['identity']} | Shot {shot['number']} | Frames [{shot['first']}, {shot['lastExclusive']})", font=font, fill='#edf2f7')
        draw.text((12, 44), 'Original source lookup; inspect full checkpoints for a treatment decision.', font=small, fill='#b9c8d6')
        for index, frame in enumerate(shot['checkpoints']):
            point = points[frame]
            file = directory / point['file']
            assert hashlib.sha256(file.read_bytes()).hexdigest() == point['sha256']
            with Image.open(file) as original:
                preview = original.convert('RGB')
            preview.thumbnail((400, 300), Image.Resampling.LANCZOS)
            x, y = index % columns * 400, 86 + index // columns * 342
            sheet.paste(preview, (x, y))
            draw.text((x + 8, y + 305), f'Frame {frame} | {frame / 15:.3f} s', font=small, fill='#edf2f7')
        file = target / f"shot-{shot['number']:03}.png"
        sheet.save(file)
        records.append(dict(shot=shot['number'], file=str(file.relative_to(directory)),
                            sha256=hashlib.sha256(file.read_bytes()).hexdigest(), sourceFrames=shot['checkpoints']))
    (target / 'contacts.json').write_text(json.dumps(dict(schema='hd-movie-source-contact-v1', identity=survey['identity'],
                                                       scope='Resized lookup sheets; source checkpoint PNGs remain authoritative', sheets=records), indent=2) + '\n')
    return records
