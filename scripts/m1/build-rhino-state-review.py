"""Build native-pixel review crops; no image resampling or artwork edits."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
source = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
rows = json.loads((source / 'captures.json').read_text())
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 18)
for start in range(0, len(rows), 8):
    group = rows[start:start+8]
    sheet = Image.new('RGB', (800, ((len(group)+1)//2)*232), (28,30,34))
    draw = ImageDraw.Draw(sheet)
    for i, row in enumerate(group):
        image = Image.open(source / row['file'])
        x, y = (round(v) for v in row['center'])
        crop = image.crop((x-200,y-118,x+200,y+82))
        crop.save(out / row['file'])
        xx, yy = (i%2)*400, (i//2)*232
        sheet.paste(crop, (xx,yy+32))
        draw.text((xx+8,yy+6),row['label']+' / '+row['mode'],font=font,fill='white')
    sheet.save(out / f'sheet-{start//8+1}.png')
(out/'captures.json').write_text(json.dumps(rows,indent=2)+'\n')
