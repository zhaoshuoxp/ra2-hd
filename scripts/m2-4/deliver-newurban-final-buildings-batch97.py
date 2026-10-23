"""Deliver only embedded review, metadata and complete resource authority to Desktop."""
import base64
import hashlib
import io
import shutil
from html.parser import HTMLParser
from pathlib import Path
import numpy as np
from PIL import Image
from newurban_batch89_io import pin, read, write
from newurban_batch97_materials import ROOT

source = ROOT / 'review-v1/M2.4-NewUrban-Final-Buildings-Batch97-Embedded.html'
metadata_file = ROOT / 'review-v1/review-metadata-v1.json'
ledger_file = ROOT / 'resource-handoff-v2.json'
metadata, ledger = read(metadata_file), read(ledger_file)
assert ledger['fileCount'] == len(ledger['files']) == 58255
assert metadata['imageInstances'] == 317 and len(metadata['videos']) == 4
assert metadata['review'] == pin(source)
destination = Path('/Users/Aone/Desktop/M2.4-Review-NewUrban-Final-Buildings-Batch97-20261021')
destination.mkdir(exist_ok=False)
copied = []
for file in [source, metadata_file, ledger_file]:
    out = destination / file.name
    shutil.copyfile(file, out)
    assert pin(out)['sha256'] == pin(file)['sha256']
    copied.append(pin(out))


class ReviewVerifier(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = self.videos = 0

    def handle_starttag(self, tag, attributes):
        values = dict(attributes)
        if tag not in ['img', 'video']:
            if tag == 'script':
                assert 'src' not in values
            return
        src = values.get('src', '')
        if tag == 'img':
            assert src.startswith('data:image/webp;base64,')
            payload = base64.b64decode(src.split(',', 1)[1], validate=True)
            declared = metadata['images'][self.images]
            assert hashlib.sha256(payload).hexdigest() == declared['embeddedSha256']
            with Image.open(io.BytesIO(payload)) as image:
                assert list(image.size) == declared['size']
                pixels = np.array(image.convert('RGBA'))
            assert hashlib.sha256(pixels.tobytes()).hexdigest() == declared['decodedRgbaSha256']
            self.images += 1
        else:
            assert src.startswith('data:video/webm;base64,')
            payload = base64.b64decode(src.split(',', 1)[1], validate=True)
            assert hashlib.sha256(payload).hexdigest() == metadata['videos'][self.videos]['source']['sha256']
            self.videos += 1


verifier = ReviewVerifier()
verifier.feed((destination / source.name).read_text())
assert verifier.images == 317 and verifier.videos == 4
assert sorted(file.name for file in destination.iterdir()) == sorted(file.name for file in [source, metadata_file, ledger_file])
receipt = dict(status='PASS_DESKTOP_THREE_FILES_317_LOSSLESS_IMAGES_FOUR_NATIVE_VIDEOS',
    destination=str(destination), files=copied, totalBytes=sum(f['bytes'] for f in copied),
    decodedImageInstances=verifier.images, embeddedNativeVideos=verifier.videos,
    gameOrResourceCopyCreated=False, review=pin(source), metadata=pin(metadata_file), ledger=pin(ledger_file),
    runtimeSourceCommit=ledger['runtimeSourceCommit'], visual='PENDING_CONSOLIDATED_USER_REVIEW',
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False)
write(ROOT / 'desktop-delivery-v1.json', receipt)
write(ROOT / 'delivery-checkpoint-v1.json', dict(status='BATCH97_DESKTOP_REVIEW_READY_FULL_M24_INCOMPLETE',
    delivery=pin(ROOT / 'desktop-delivery-v1.json'), closure=pin(ROOT / 'coverage-and-native-closure-v1.json'),
    runtimeSourceCommit=ledger['runtimeSourceCommit'], candidate=ledger['candidate'], finalLedger=pin(ledger_file),
    sourcePolicy='Versioned isolated resource packs and original source hashes; Desktop page has no external image or video dependency.',
    remainingAuthoredSources=['civ1.shp', 'dnoa.shp', 'ggfwll.shp'], conditionalScannerRows=22,
    visual='PENDING_CONSOLIDATED_USER_REVIEW', windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(destination=str(destination), files=len(copied), bytes=receipt['totalBytes'],
    images=verifier.images, nativeVideos=verifier.videos, finalLedger=pin(ledger_file)))
