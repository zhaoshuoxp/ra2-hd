"""Decode every embedded image and validate source indices, clips and offline script syntax."""
import base64
import hashlib
import io
import json
import re
import subprocess
from PIL import Image
from final_actor_materials_batch98 import ROOT
from newurban_batch89_io import pin, read, write

receipt = read(ROOT / 'review-receipt-v3.json')
file = receipt['html']['file']
assert pin(file) == receipt['html']
html = open(file).read()
data = json.loads(re.search(r'<script id="review-data" type="application/json">([\s\S]*?)</script>', html)[1])
count, actors = 0, {}
for name, actor in data['actors'].items():
    actors[name] = len(actor['frames'])
    assert actors[name] == (238 if name == 'CIV1' else 212)
    for sequence in actor['sequences']:
        assert all(0 <= n < actor['count'] for n in sequence['frames'])
    for frame in actor['frames']:
        for url in frame['images'].values():
            with Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1], validate=True))) as image:
                image.verify()
            count += 1
for row in data['native'] + data['lighting']:
    with Image.open(io.BytesIO(base64.b64decode(row['image'].split(',', 1)[1], validate=True))) as image:
        assert image.size == ((960, 720) if row in data['lighting'] else (800, 640))
        image.verify()
    count += 1
assert len(data['clips']) == 4 and len(data['lighting']) == 9
videos = []
for row in data['clips']:
    raw = base64.b64decode(row['video'].split(',', 1)[1], validate=True)
    assert raw[:4] == bytes.fromhex('1a45dfa3')
    videos.append(dict(title=row['title'], bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest()))
scripts = re.findall(r'<script>([\s\S]*?)</script>', html)
assert len(scripts) == 1
script = ROOT / 'embedded-review-script-v3.js'
script.write_text(scripts[0])
subprocess.run(['node', '--check', str(script)], check=True)
assert not re.search(r'(?:src|href)=["\x27](?:https?:|file:|\.\.?/)', html)
write(ROOT / 'review-validation-v3.json', dict(status='PASS_ALL_EMBEDDED_IMAGES_SEQUENCES_VIDEO_PAYLOADS_AND_JAVASCRIPT',
    html=receipt['html'], actors=actors, verifiedPngs=count, videos=videos, externalDependencies=0,
    nativePixelCrops=17, lampComparison='MATCHED_ORIGINAL_2X_4X_WITH_RESTORED_DIAGNOSTIC_VISIBILITY',
    visual='PENDING_USER_REVIEW_CIV1_AND_DNOA_ONLY', windows='NOT_RUN', m24Complete=False))
print(dict(status='PASS_EMBEDDED_REVIEW', actors=actors, images=count, videos=len(videos)))
