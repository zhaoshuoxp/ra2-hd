"""Deterministic slicing/cropping of the authored review atlas; no AI upscaling."""
from pathlib import Path
from PIL import Image, ImageOps
import json, hashlib
root = Path('.artifacts/menu-ui/art-v1')
out = Path('.local/ui-packs/direction-v1'); out.mkdir(parents=True, exist_ok=True)
master = Image.open(root / 'cameo-master.png')
names = ['giicon','e2icon','htnkicon','gtnkicon','powricon','npwricon','tslaicon','agisicon','v3icon','dogicon','harvicon','jjeticon']
assets = []
def save(image, id, filename, logical):
    path = out / filename
    image.save(path)
    assets.append(dict(id=id, file=filename, sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                       width=image.width, height=image.height, logicalWidth=logical[0], logicalHeight=logical[1]))
for index, name in enumerate(names):
    c,r = index%4,index//4
    crop = master.crop((round(c*master.width/4),round(r*master.height/3),round((c+1)*master.width/4),round((r+1)*master.height/3)))
    source = json.loads(Path(f'.artifacts/menu-ui/inventory-v1/{name}.shp.json').read_text())
    logical = (source['width'], source['height'])
    image = ImageOps.fit(crop, (logical[0]*4,logical[1]*4), Image.Resampling.LANCZOS)
    save(image,name+'.shp',name+'.png',logical)
background = Image.open(root / 'interface-master.png').convert('RGB')
# Keep native generated detail; no interpolated enlargement advertised as new detail.
save(background,'menu-background','background.png',(632,570))
assets.append(dict(assets[-1], id='loading-background', logicalWidth=800,logicalHeight=600))
manifest = dict(schemaVersion=1, revision='direction-v1', assets=assets)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
ledger = dict(status='DIRECTION_REVIEW_PENDING', generation='built-in image_gen', artApproval='PENDING_USER',
              productionPromotion=False, masters={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in root.glob('*.png')},
              assets=assets, fullRoster='NOT_AUTHORED_PENDING_DIRECTION',
              crop='Equal atlas cells, then center-fit to each native cameo aspect ratio; fixed 4x output, original hit geometry.')
(root/'ledger.json').write_text(json.dumps(ledger,indent=2)+'\n')
print(len(assets), 'review entries exported')
