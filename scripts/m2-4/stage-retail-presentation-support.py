"""Add compact native evidence, portable review and ignored authoring inputs to the frozen app."""
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '.artifacts/m2-4/retail-presentation-v1'
DELIVERY = ROOT / '.artifacts/m2-4/retail-presentation-delivery-20261021-v1'
package = json.loads((DELIVERY / 'package-receipt.json').read_text())
folder = Path(package['folder'])
native = ROOT / '.artifacts/m2-4/retail-presentation-native-final-v1'
review = ROOT / '.artifacts/m2-4/retail-presentation-review-final-v3'
qa = ROOT / '.artifacts/m2-4/retail-presentation-review-qa-final-v1'
report = json.loads((native / 'report-compact.json').read_text())
assert report['status'] == 'PASS_NATIVE_CATALOG_LANGUAGES_NAMES_TOOLTIPS_RESULTS'
assert json.loads((qa / 'report.json').read_text())['status'].startswith('PASS_')
assert package['sourceDirty'] == ''

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n')

shutil.copytree(review, folder / 'Review')
(folder / 'Review/Open-Review.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=M2.4-Map-Language-Fixes-Embedded.html"><title>M2.4 Review</title><a href="M2.4-Map-Language-Fixes-Embedded.html">Open the embedded M2.4 correction review</a></html>\n')
evidence = folder / 'Evidence'
evidence.mkdir()
shutil.copyfile(native / 'report-compact.json', evidence / 'native-mac.json')
shutil.copyfile(qa / 'report.json', evidence / 'embedded-review.json')
for name in ['tests-final.log', 'typecheck.log', 'native-final.log']:
    shutil.copyfile(WORK / name, evidence / name)
(evidence / 'Native-PNG').mkdir()
for image in native.glob('*.png'):
    shutil.copyfile(image, evidence / 'Native-PNG' / image.name)
authoring = folder / 'Authoring'
authoring.mkdir()
shutil.copytree(ROOT / '.local/source-art/m2-4-result-banners-v1', authoring / 'Result-Banner-Sources')
shutil.copyfile(ROOT / '.artifacts/m2-4/retail-presentation-v1/english-original.json', authoring / 'english-original-label-reference.json')
shutil.copyfile(ROOT / '.artifacts/m2-4/retail-presentation-v1/english-reference-LICENSE', authoring / 'English-Reference-LICENSE.txt')
records = folder / 'Records'
records.mkdir()
for name in ['m2-4-original-map-lists-20261021.json', 'm2-4-retail-locales-20261021.json',
             'm2-4-result-banners-20261021.json', 'm2-4-retail-presentation-corrections-20261021.md']:
    shutil.copyfile(ROOT / 'docs' / name, records / name)

previous = json.loads((ROOT / 'docs/m2-4-final-delivery-20261021.json').read_text())
correspondence = {
    'schema': 'm2-4-retail-presentation-source-resource-correspondence-v1',
    'status': 'MAC_TECHNICAL_PASS_NEW_PRESENTATION_VISUAL_REVIEW_PENDING',
    'runtimeSourceHead': package['runtimeSourceHead'], 'runtimeSource': str(ROOT),
    'app': Path(package['app']).name, 'target': 'darwin-arm64',
    'resourceRoot': 'RA2-HD-Editions-Resources', 'uiRoot': 'RA2-HD-UI-Resources',
    'privateProfile': 'M2.4-Review-Profile', 'privateProfileArchived': False,
    'profilePolicy': 'The packaged app creates only its own sibling profile and resolves these sibling resources. No source checkout or previous app/profile is needed.',
    'independentCopies': True, 'priorAcceptedDeliveriesOverwritten': False,
    'publishedOriginalCatalog': {'ra2': 62, 'yr': 151, 'independentSourceFiles': 213,
        'overlappingOriginalModeMemberships': 285, 'nonstandardOnlyEntries': {'ra2': 31, 'yr': 60},
        'archiveOnlyHidden': 92, 'publishedOriginalDataBlockers': 0, 'retainedHiddenSourceAnomalies': 4},
    'mapPolicy': 'Original edition PKT order. All published legacy modes use the current unified standard rules. Actual source starts cap player count. Original map/archive bytes and mechanisms remain unchanged.',
    'technicalMac': {'status': report['status'], 'nativeCases': 6,
        'languages': ['zh-CN', 'zh-TW', 'en-US'], 'editions': ['ra2', 'yr'],
        'focusedCases': 27, 'assertions': 4061, 'entryTypecheck': 'PASS', 'isolatedBuild': 'PASS',
        'nativeReceipt': 'Evidence/native-mac.json', 'nativeReceiptSha256': sha(evidence / 'native-mac.json'),
        'embeddedReview': 'PASS_BOTH_OFFLINE_PAGES_ALL_IMAGES_AND_TWELVE_TEXT_SLOTS',
        'uiPeakBytes': max(row['result']['ui']['reservedBytes'] for row in report['cases']),
        'uiBudgetBytes': 16 * 1024 * 1024, 'defaultRelocatedStartup': 'PENDING_DESKTOP_CHECK'},
    'reusedEvidence': {'record': 'docs/m2-4-final-delivery-20261021.json',
        'acceptedNativeSourceEntries': 301, 'selectionChangeAddsMaps': 0,
        'reason': 'Published sources are the unchanged original-catalog subset. All new routing/rules had prior source/native evidence; this correction removes archive extras and changes text/presentation only.',
        'selectedTheaters': previous['selectedTheaters'], 'preparedContract': package['preparedContract'],
        'preparedMembers': 448, 'preparedPages': 1189,
        'preparedPolicy': 'Existing index and member bytes are reused only because world image/palette/art dependency pins are unchanged. Locale text and separate result UI art do not relabel or invalidate world prepared data.'},
    'newArt': {'backgrounds': 2, 'completeDensityExports': 4, 'logicalSize': [436, 112],
        'twoX': [872, 224], 'fourX': [1744, 448], 'labelSlots': 4,
        'slotPurpose': ['campaign-standby-victory', 'campaign-standby-defeat', 'skirmish-victory', 'skirmish-defeat'],
        'authoring': 'Authoring/Result-Banner-Sources', 'exportedPngsInGitAndApp': True,
        'ignoredMasterInputsIncluded': True, 'visualAcceptance': 'PENDING'},
    'newHoverTypography': 'HIGH_DENSITY_FONT_OUTLINES_MAC_PASS_VISUAL_REVIEW_PENDING',
    'priorTheaterArtwork': 'USER_ACCEPTED_THROUGH_BATCH98_REUSED_WITHOUT_REVIEW',
    'languagePolicy': 'Menu language changes reload the edition; in-match changes apply at Home without interrupting the current match.',
    'userRuntimeFeedback': 'Several maps across theaters tested without an issue; limited user feedback, not an exhaustive full-matrix claim.',
    'windows': 'NOT_RUN_ON_THIS_MAC', 'remotePush': False, 'published': False, 'm24Complete': False,
    'cleanup': 'Dependency-checked retirement of obsolete temporary builds/intermediates/branches is authorized after correction acceptance. Current deliveries, active dependencies and compact provenance remain retained.',
    'continuation': 'Continue this execution conversation for this correction and acceptance.'}
save(folder / 'SOURCE-AND-RESOURCES.json', correspondence)
(folder / 'START-HERE.txt').write_text('''M2.4 Original Maps and Three-Language HD Presentation

Open "Red Alert 2 HD M2.4 R2.app". Keep both resource folders beside it.
Open Review/Open-Review.html for the fast embedded review (about 6 MB).
The optional Native-Context-Embedded.html contains all full game captures.

RA2 publishes 62 original maps; YR publishes 151, in original PKT order.
92 archive-only extras stay preserved and hidden. No maps/archives were edited.
Choose Simplified Chinese, Traditional Chinese or English on the version selector
or in Options. During a match, a language change applies on return to Home.
Edit your human name directly in the first skirmish player row; it is saved per edition.

World hover labels use native high-density fonts. Result banners have complete
2X/4X backgrounds and live localized text. Slots 0/1 remain campaign standby;
slots 2/3 are the actual skirmish victory/defeat path. Campaign execution is not enabled.

Six actual packaged Mac cases, 27 focused tests, entry typecheck, both embedded
review pages, full family hashes, Original/failure fallback and release passed.
New banner artwork and hover presentation remain for user visual confirmation.
Accepted theater/faction artwork is reused. Windows has not been run on this Mac.

SOURCE-AND-RESOURCES.json links app, source commit, resources and private profile.
The app creates M2.4-Review-Profile here; the ZIP excludes mutable user settings.
Authoring contains ignored generated masters, exact prompts and source hashes.
Prior accepted apps, source installs, imports and user profiles were preserved.
No remote push or publication occurred. Cleanup follows correction acceptance.
''')
print(json.dumps({'status': correspondence['status'], 'folder': str(folder),
                  'runtime': package['runtimeSourceHead'], 'newArtMasterFiles': 5}))
