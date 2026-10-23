"""Copy exactly the embedded review, metadata and complete ledger to Desktop."""
import base64
import hashlib
from io import BytesIO
from pathlib import Path
import re
import shutil
from PIL import Image
from newurban_batch96_io import ROOT, pin, read, write

destination = Path('/Users/Aone/Desktop/M2.4-Review-NewUrban-Final-Terrain-Batch96-20261021')
destination.mkdir(exist_ok=False)
review = read(ROOT / 'review-v2/review-metadata-v1.json')
source = Path(review['html']['file'])
assert pin(source) == review['html']
names = [source, ROOT / 'review-v2/review-metadata-v1.json', ROOT / 'resource-handoff-v1.json']
copies = []
for file in names:
    target = destination / file.name
    shutil.copyfile(file, target)
    expected, actual = pin(file), pin(target)
    assert {k: actual[k] for k in ['bytes', 'sha256']} == {k: expected[k] for k in ['bytes', 'sha256']}
    copies.append(dict(source=expected, destination=actual))
page = (destination / source.name).read_text()
payloads = re.findall(r'src="data:image/webp;base64,([^"]+)"', page)
assert len(payloads) == len(review['images'])
for encoded, expected in zip(payloads, review['images'], strict=True):
    data = base64.b64decode(encoded, validate=True)
    assert len(data) == expected['embeddedBytes']
    assert hashlib.sha256(data).hexdigest() == expected['embeddedSha256']
    image = Image.open(BytesIO(data)).convert('RGBA')
    assert list(image.size) == expected['size']
    assert hashlib.sha256(image.tobytes()).hexdigest() == expected['decodedRgbaSha256']
assert len(list(destination.iterdir())) == 3
write(ROOT / 'desktop-delivery-v1.json', dict(status='PASS_DESKTOP_EXACT_THREE_FILE_COPY_AND_ALL_EMBEDDED_PIXELS',
    directory=str(destination), files=copies, embeddedImages=len(payloads), originalPixelValuesExact=True,
    nativeScalePreserved=True, separateGamePackageCreated=False, separateResourceCopyCreated=False,
    browserInteractive='NOT_RUN_RETAINED_LOCAL_PROTOCOL_RESTRICTION', windows='NOT_RUN', m24Complete=False))
ledger = read(ROOT / 'resource-handoff-v1.json')
closure = read(ROOT / 'coverage-and-native-closure-v1.json')
assert read('.local/terrain-newurban-selection.json') == closure['candidate'] == ledger['candidate']
write(ROOT / 'delivery-checkpoint-v1.json', dict(status='DELIVERED_FOR_CONSOLIDATED_VISUAL_REVIEW',
    candidate=closure['candidate'], runtimeSourceCommit=closure['runtimeSourceCommit'],
    sourceHandoffCommit=ledger['sourceHandoffCommit'], review=pin(destination / source.name),
    resourceHandoff=pin(ROOT / 'resource-handoff-v1.json'), verifiedDependencyFiles=ledger['fileCount'],
    desktopVerification=pin(ROOT / 'desktop-delivery-v1.json'),
    technicalClosure=pin(ROOT / 'coverage-and-native-closure-v1.json'),
    remainingNewUrbanSourceGaps=16, nativeMac='PASS_SELECTED_NATIVE_CASES_AT_2X_AND_4X',
    changedVisualStatus='PENDING_USER_REVIEW', windows='NOT_RUN', mainIntegration='NOT_PERFORMED',
    separateGamePackageCreated=False, m24Complete=False))
print(dict(directory=str(destination), files=3, embeddedImages=len(payloads),
    html=pin(destination / source.name)))
