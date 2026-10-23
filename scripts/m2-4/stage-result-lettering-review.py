"""Deliver the bounded lettering/notice review without another Mac game package."""
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
revision = 'R5' if '--r5' in sys.argv else 'R4' if '--r4' in sys.argv else 'R3' if '--r3' in sys.argv else 'R2'
incremental = revision in ['R3', 'R4', 'R5']
base = root / f'.artifacts/m2-4/result-lettering-{revision.lower()}-final-v1'
native = root / f'.artifacts/m2-4/result-lettering-{revision.lower()}-native-v{1 if incremental else 2}'
qa = root / f'.artifacts/m2-4/result-lettering-{revision.lower()}-review-qa-final-v{1 if incremental else 2}'
review = root / f'.artifacts/m2-4/result-lettering-{revision.lower()}-review-final-v{1 if incremental else 2}'
build = root / f'.artifacts/m2-4/build-result-lettering-{revision.lower()}-v02-20261022'
destination = Path(f'/Users/Aone/Desktop/M2.4-Review-Result-Lettering-{revision}-20261022')
review_name = f'M2.4-Result-Lettering-{revision}-Embedded.html'


def load(file):
    return json.loads(file.read_text())


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


n, q, identity, markup = load(native / 'report.json'), load(qa / 'report.json'), load(build / 'identity.json'), load(base / 'lettering.json')
assert n['status'] == dict(R5='PASS_INCREMENTAL_NATIVE_SHADOW_4X_AND_ACCEPTED_STARTUP', R4='PASS_INCREMENTAL_NATIVE_SHADOW_4X_AND_ACCEPTED_STARTUP',
    R3='PASS_INCREMENTAL_NATIVE_OUTLINE_4X_AND_ACCEPTED_STARTUP', R2='PASS_NATIVE_RESULT_LETTERING_BOTH_DENSITIES_AND_V02')[revision]
assert q['status'] == 'PASS_12_LOCALIZED_SLOTS_2X_4X_VERTICAL_GRADIENT_SHADOW_AND_OFFLINE_REVIEW'
assert len(n['cases']) == (1 if incremental else 2) and len(q['rasters']) == 24 and not n['errors'] and not q['errors'] and not q['externalRequests']
assert digest(root / markup['source']) == markup['sourceSha256']
assert load(build / 'package.json')['version'] == '0.2.0'
subprocess.run(['git', 'diff', '--quiet', identity['head'], '--', 'src', 'public', 'desktop', 'index.html'], cwd=root, check=True)
assert not destination.exists()
destination.mkdir()
plan = {
    review / review_name: review_name,
    base / 'lettering.json': 'Sources/Production-Lettering.json',
    base / 'startup-disclaimer-copy.json': 'Sources/Startup-Notice.json',
    native / 'report.json': 'Evidence/Native-Mac.json',
    qa / 'report.json': 'Evidence/Review-QA.json',
    base / 'tests.log': 'Evidence/Focused-Tests.log',
    base / 'typecheck.log': 'Evidence/Typecheck.log',
    root / '.artifacts/m2-4/result-lettering-r2-native-v1/report.json': 'Evidence/Initial-Observation-Failure.json',
    root / '.artifacts/m2-4/result-lettering-r1-v1/rejected-feedback.json': 'Evidence/Rejected-R1-Feedback.json',
    root / f'docs/m2-4-result-lettering-{revision.lower()}-20261022.md': 'Records/Correction.md',
}
if incremental:
    plan[root / '.artifacts/m2-4/result-lettering-r2-native-v2/report.json'] = 'Evidence/Reused-R2-Native-Mac.json'
    plan[root / 'docs/m2-4-startup-notice-acceptance-20261022.json'] = 'Records/Startup-Notice-Acceptance.json'
if revision == 'R4':
    plan[root / 'docs/m2-4-result-lettering-r3-20261022.json'] = 'Records/Previous-R3-Receipt.json'
if revision == 'R5':
    plan[root / 'docs/m2-4-result-lettering-r4-20261022.json'] = 'Records/Intermediate-R4-Checkpoint.json'
    plan[root / '.artifacts/m2-4/result-lettering-r4-final-v1/lettering.json'] = 'Sources/Previous-R4-Lettering.json'
    for attempt in [1, 2]:
        plan[root / f'.artifacts/m2-4/result-lettering-r5-preview-qa-v{attempt}/report.json'] = f'Evidence/R5-Draft-Check-{attempt}.json'
for source, relative in plan.items():
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    assert digest(source) == digest(target)
for language, row in load(base / 'startup-disclaimer-copy.json')['languages'].items():
    (destination / f'Startup-Disclaimer-{language}.txt').write_text(row['text'] + '\n')
(destination / 'START-HERE.txt').write_text(
    f'Open {review_name}. All review images are embedded.\n'
    + ('Review the wider, stronger glyph shadow and retained HD hover controls. Face weight, gradient and thin edge are unchanged.\n' if revision in ['R4', 'R5']
        else 'Review only the darker thin glyph edge. The accepted bilingual startup notice is retained for reference.\n' if incremental
        else 'Review the original-style lettering, its lighter gray shadow, and the bilingual startup notice.\n') +
    'The public release label is v0.2. This is an HTML-only correction review, not a new game package.\n'
    'The earlier Desktop app/ZIP remains its frozen preceding runtime. Refresh the final app after acceptance.\n'
    'Prior accepted theater artwork is reused. Windows is not tested. Cleanup remains deferred.\n')
files = [dict(file=str(file.relative_to(destination)), bytes=file.stat().st_size, sha256=digest(file))
    for file in sorted(destination.rglob('*')) if file.is_file()]
family = load(root / 'src/gui/hd/resultBannerSources.json')
for row in family['assets']:
    assert digest(root / 'public/res/ui' / row['file']) == row['sha256']
receipt = dict(schema=f'm2-4-result-lettering-{revision.lower()}-review-delivery-v1', status='DELIVERED_HTML_MAC_TECHNICAL_PASS_VISUAL_PENDING',
    runtimeSourceHead=identity['head'], runtimeUnchangedByBookkeeping=True, publicVersion='v0.2', packageSemver='0.2.0',
    engineReplayCompatibility='UNCHANGED_0.0.1', desktop=str(destination), review=review_name,
    files=files, fileCount=len(files), bytes=sum(row['bytes'] for row in files), exclusions=['Review-Receipt.json (self)'],
    tests=dict(focusedCases=27, assertions=4061, focusedEvidence='REUSED_R2_UNCHANGED_PATHS' if incremental else 'NEW_R2',
        entryTypecheck='PASS', isolatedBuild='PASS', nativeMacCases=len(n['cases']),
        rasterCases=24, sourceBackgroundHashes='PASS_UNCHANGED_ALL_FOUR', uiPeakBytes=max(row['result']['ui']['reservedBytes'] for row in n['cases']),
        uiBudgetBytes=16777216, nativeResultRelease='PASS', startupTextAndNonoverlappingColumns='PASS',
        firstNativeFailure='Observed the initial v before Home React committed v0.2; corrected the observer wait, not runtime.'),
    sourceFiles=[dict(file=file, sha256=digest(root / file)) for file in [markup['source'], 'src/version.ts',
        'src/gui/component/SplashScreen.tsx', 'src/Application.ts', 'public/res/locale/zh-CN.json',
        'public/res/locale/zh-TW.json', 'public/res/locale/en-US.json', 'LICENSE']],
    resultBackgroundFamily=family, campaignSlots=[0, 1], skirmishSlots=[2, 3],
    resourcePolicy='Accepted selectors, world/prepared dependencies and budgets are unchanged; no stale prepared data is relabeled.',
    reusedEvidence='docs/m2-4-retail-presentation-delivery-20261022.json: six previous native catalog/language/name/tooltip/fallback cases.',
    newGamePackageCreated=False, previousDeliveriesOverwritten=False, visualAcceptance='PENDING', windows='NOT_RUN_ON_THIS_MAC',
    startupNoticeAcceptance='USER_ACCEPTED_AND_INTEGRATED_IN_GAME',
    cleanup='USER_AUTHORIZED_AFTER_CORRECTION_ACCEPTANCE_DEFERRED', next='After visual acceptance, refresh the final app once and execute scoped dependency-checked cleanup.',
    remotePush=False, published=False, m24Complete=False)
if revision in ['R4', 'R5']:
    receipt['correction'] = dict(scope='Wider and stronger soft glyph shadow only; R3 face/edge pixels and geometry preserved.',
        previousCommit=markup['previousCommit'], previousRevision=markup['previousLabel'],
        shadowFootprintRatio=[min(row['shadowPixels'] / row['previousShadowPixels'] for row in q['rasters']),
            max(row['shadowPixels'] / row['previousShadowPixels'] for row in q['rasters'])],
        shadowDarknessRatio=[min(row['shadowDarkness'] / row['previousShadowDarkness'] for row in q['rasters']),
            max(row['shadowDarkness'] / row['previousShadowDarkness'] for row in q['rasters'])],
        facePixelDifferences=sum(row['facePixelDifferences'] for row in q['rasters']),
        allFaceGeometryPreserved=all(row['geometryMatchesPrevious'] for row in q['layout']['glyphs']))
encoded = json.dumps(receipt, indent=2, ensure_ascii=False) + '\n'
(destination / 'Review-Receipt.json').write_text(encoded)
(base / 'delivery-receipt.json').write_text(encoded)
for row in files:
    assert digest(destination / row['file']) == row['sha256']
print(json.dumps(dict(status=receipt['status'], desktop=str(destination), files=len(files), bytes=receipt['bytes'],
    receiptSha256=digest(destination / 'Review-Receipt.json'))))
