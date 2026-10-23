"""Reuse the accepted loading emblem for pause and the closed radar cover."""
import hashlib
import json
import pathlib
import shutil
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / '.artifacts/visual-feedback-followup-20261005'
OLD = ROOT / '.local/ui-packs/lunar-infantry-ui-v1'
NEW = ROOT / '.local/ui-packs/yuri-emblem-ui-v1'


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


assert sha(OLD / 'manifest.json') == 'a8cf998c042066c05c119a6392e9b703ccd03622d89030e1dbf45089cd90ca18'
source = OLD / 'loading-background-yuri.png'
assert sha(source) == '730b7819866cc593ec5979d46e069c596ba69e77c7716d1fe4a002608ddbc93f'
assert not NEW.exists()
shutil.copytree(OLD, NEW)
emblem = Image.open(source).convert('RGBA').crop((16, 408, 744, 1064))
pause = ROOT / 'public/res/ui'
pause.mkdir(parents=True, exist_ok=True)
for file, image in [('yuri-pause-emblem.png', emblem),
                    ('yuri-pause-emblem-original.png', emblem.resize((182, 164), Image.Resampling.LANCZOS))]:
    image.save(OUT / file)
    if (pause / file).exists():
        assert sha(pause / file) == sha(OUT / file)
    else:
        shutil.copy2(OUT / file, pause / file)

radar = Image.open(OLD / 'yuri-radar-base.png').convert('RGBA')
assert radar.size == (672, 440)
screen = (56, 0, 620, 440)
replacement = Image.new('RGBA', (564, 440), '#150b22')
fitted = emblem.resize((488, 440), Image.Resampling.LANCZOS)
replacement.paste(fitted, (38, 0))
radar.paste(replacement, screen)
radar.save(NEW / 'yuri-radar-base.png')
original = Image.open(OLD / 'yuri-radar-base.png').convert('RGBA')
for bounds in [(0, 0, 56, 440), (620, 0, 672, 440)]:
    assert original.crop(bounds).tobytes() == radar.crop(bounds).tobytes()

manifest = json.loads((OLD / 'manifest.json').read_text())
manifest['revision'] = NEW.name
changed = []
for entry in manifest['assets']:
    file = entry['file']
    if entry['id'] == 'yuri-radar-base':
        entry['sha256'] = sha(NEW / file)
        changed.append(file)
    else:
        assert sha(OLD / file) == sha(NEW / file)
assert changed == ['yuri-radar-base.png'] and len(manifest['assets']) == 490
(NEW / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
selection = dict(schemaVersion=1, revision=NEW.name, sha256=sha(NEW / 'manifest.json'), reviewOnly=False)
(ROOT / '.local/ui-selection.json').write_text(json.dumps(selection, indent=2) + '\n')
receipt = dict(status='PASS_ACCEPTED_EMBLEM_REUSE_AND_FRAME_PRESERVATION', selection=selection,
               previousRevision=OLD.name, previousSha256=sha(OLD / 'manifest.json'),
               source=str(source.relative_to(ROOT)), sourceSha256=sha(source), crop=[16, 408, 744, 1064],
               changedAssets=changed, unchangedAssets=489, radarScreen=list(screen),
               radarSha256=sha(NEW / 'yuri-radar-base.png'),
               pause=[dict(file=file.name, sha256=sha(file)) for file in sorted(pause.glob('*.png'))])
(OUT / 'ui-revision.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
