"""Deliver the corrected embedded review and verify every decoded image pixel."""
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
review = read(ROOT / 'review-v3/review-metadata-v1.json')
source = Path(review['html']['file'])
assert pin(source) == review['html']
copies = []
for file in [source, ROOT / 'review-v3/review-metadata-v1.json', ROOT / 'resource-handoff-v2.json']:
    target = destination / file.name
    shutil.copyfile(file, target)
    expected, actual = pin(file), pin(target)
    assert all(actual[key] == expected[key] for key in ['bytes', 'sha256'])
    copies.append(dict(source=expected, destination=actual))
payloads = re.findall(r'src="data:image/webp;base64,([^"]+)"', (destination / source.name).read_text())
assert len(payloads) == len(review['images']) == 118
for encoded, expected in zip(payloads, review['images'], strict=True):
    data = base64.b64decode(encoded, validate=True)
    assert len(data) == expected['embeddedBytes']
    assert hashlib.sha256(data).hexdigest() == expected['embeddedSha256']
    decoded = Image.open(BytesIO(data)).convert('RGBA')
    assert list(decoded.size) == expected['size']
    assert hashlib.sha256(decoded.tobytes()).hexdigest() == expected['decodedRgbaSha256']
assert len(list(destination.iterdir())) == 3
write(ROOT / 'desktop-delivery-v1.json', dict(status='PASS_DESKTOP_EXACT_THREE_FILE_COPY_AND_ALL_EMBEDDED_PIXELS',
    directory=str(destination), files=copies, embeddedImages=118, decodedOriginalPixelsExact=True,
    nativeDisplayScalePreserved=True, separateGamePackageCreated=False, separateResourceCopyCreated=False,
    browserInteractive='NOT_RUN_RETAINED_LOCAL_PROTOCOL_RESTRICTION', windows='NOT_RUN', m24Complete=False))
ledger = read(ROOT / 'resource-handoff-v2.json')
closure = read(ROOT / 'coverage-and-native-closure-v2.json')
assert read('.local/terrain-newurban-selection.json') == closure['candidate'] == ledger['candidate']
write(ROOT / 'delivery-checkpoint-v1.json', dict(status='DELIVERED_FOR_CONSOLIDATED_VISUAL_REVIEW',
    candidate=closure['candidate'], runtimeSourceCommit=closure['runtimeSourceCommit'],
    sourceHandoffCommit=ledger['sourceHandoffCommit'], review=pin(destination / source.name),
    resourceHandoff=pin(ROOT / 'resource-handoff-v2.json'), verifiedDependencyFiles=ledger['fileCount'],
    inheritedVerifiedFiles=ledger['inheritedVerifiedFileCount'],
    desktopVerification=pin(ROOT / 'desktop-delivery-v1.json'), technicalClosure=pin(ROOT / 'coverage-and-native-closure-v2.json'),
    remainingNewUrbanSourceGaps=16, nativeMac='PASS_SELECTED_NATIVE_CASES_AT_2X_AND_4X',
    changedVisualStatus='PENDING_USER_REVIEW', windows='NOT_RUN', mainIntegration='NOT_PERFORMED',
    separateGamePackageCreated=False, m24Complete=False))
print(dict(directory=str(destination), files=3, embeddedImages=118, html=pin(destination / source.name)))
