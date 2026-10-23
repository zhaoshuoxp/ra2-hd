"""Decode exact source poses for representative authoring; never synthesize HD pixels."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path('.artifacts/allied-units')
out = root / 'references-v1'
out.mkdir(exist_ok=False)
audit = json.loads((root / 'rules-audit-v1.json').read_text())
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
selections = []
seen = set()
for edition in ['ra2', 'yr']:
    source = root / 'source-v2' / edition
    inv = json.loads((source / 'inventory.json').read_text())
    eligible = {r['id'] for r in audit['editions'][edition]['rows'] if r['included']}
    for family in inv['families']:
        if family['id'] not in eligible or family['representation'] != 'SHP':
            continue
        member = family['members'][0]
        key = inv['assets'][member]['sha256']
        if key in seen:
            continue
        seen.add(key)
        raw = json.loads((source / (member + '.json')).read_text())
        seq = family['sequences']
        if seq:
            states = [n for n in ['Ready','Walk','FireUp','Deploy','DeployedFire','Swim','SwimFire','FireProne','Die1'] if n in seq][:6]
            chosen = []
            for state in states:
                start, count, stride, *_ = map(int, seq[state].split(','))
                chosen.append((state, start + min(2, count - 1) + stride * 3))
        else:
            walk = int(family['art'].get('WalkFrames', 1))
            fire = int(family['art'].get('FiringFrames', 1))
            chosen = [('swim', walk * 3 + i) for i in [0, min(2,walk-1),min(4,walk-1)]]
            chosen += [('attack', (walk+int(family['art'].get('StandingFrames',1)))*8+fire*3+i) for i in [0,min(2,fire-1),min(3,fire-1)]]
        board = Image.new('RGB', (1024,1024), (72,88,78))
        draw = ImageDraw.Draw(board)
        cells=[]
        for i,(state,n) in enumerate(chosen):
            f=raw['frames'][n]
            tile=Image.new('RGBA',(f['width'],f['height']))
            tile.putdata([tuple(raw['palette'][p])+(255 if p else 0,) for p in f['pixels']])
            im=Image.new('RGBA',tuple(raw['canvas']))
            im.alpha_composite(tile,(f['x'],f['y']))
            x=(i%3)*340; y=(i//3)*480+42
            scale=min(6,300/im.width,390/im.height)
            large=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.NEAREST)
            board.paste(large,(x+(340-large.width)//2,y+(400-large.height)//2),large)
            draw.text((x+12,y+415),f'{state} / frame {n}',font=font,fill='white')
            filename=f'{edition}-{family["id"]}-{n}-original.png'
            im.save(out/filename)
            cells.append({'state':state,'nativeFrame':n,'original':filename,'cell':[x,y,340,400], 'nativeCanvas':raw['canvas'],'nativeBounds':[f['x'],f['y'],f['width'],f['height']]})
        name=f'{edition}-{family["id"]}'
        draw.text((16,12),f'{name} | Native source reference',font=font,fill='white')
        board.save(out/f'{name}-board.png')
        selections.append({'id':family['id'],'edition':edition,'member':member,'sourceHash':key,'reference':f'{name}-board.png','cells':cells})
(out/'selection.json').write_text(json.dumps(selections,indent=2)+'\n')
print('Prepared',len(selections),'unique SHP boards')
