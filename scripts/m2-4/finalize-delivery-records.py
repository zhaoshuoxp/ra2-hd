"""Record accepted artwork, independent delivery and the explicitly unresolved original-data scope."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path('.artifacts/m2-4/newurban-final-actors-batch98-20261021')
SOURCE = '36ff0b47eb2968dc999b0905adee1d6219753f50'


def read(name):
    return json.loads((ROOT / name).read_text())


def pin(file):
    file = Path(file)
    return dict(file=str(file.resolve()), sha256=hashlib.sha256(file.read_bytes()).hexdigest(),
        bytes=file.stat().st_size)


desktop = read('final-desktop-delivery-v1.json')
scope = read('all-theater-reconciliation-v2.json')
graph = read('main-final-active-resource-graph-v1.json')
closure = read('final-independent-package-closure-v3.json')
archive = read('final-archive-verified-v2.json')
assert desktop['sha256'] == archive['sha256'] and not desktop['m24Complete']
assert not subprocess.check_output(['git', 'diff', '--name-only', SOURCE, '--', 'src', 'desktop', 'public'], text=True)
test_logs = ['final-actors-loader-tests-v1.log', 'main-return-focused-tests-v1.log',
    'unified-and-dependency-tests-v1.log', 'lamp-tint-tests-v1.log']
record = dict(
    schema='m2-4-final-delivery-status-v1',
    status='ACCEPTED_ART_UNIFIED_SKIRMISH_LOCALLY_INTEGRATED_MAC_DELIVERED_FOUR_ORIGINAL_DATA_BLOCKERS',
    date='2026-10-21', runtimeSourceCommit=SOURCE,
    canonicalSource='/Users/Aone/RA2remaster/ra2-hd',
    taskSource='/Users/Aone/RA2remaster/ra2-hd-m2-4-theaters',
    mainBefore='ce852200acac671c46e751c11372c169631f6265',
    localIntegrationCommit=SOURCE, mainIntegration='LOCALLY_INTEGRATED',
    counts=scope['counts'], selectedTheaters=graph['selections'],
    remainingAuthoredSourceGaps=0, allNewArtwork='USER_ACCEPTED_THROUGH_BATCH98',
    finalBatchAcceptance=pin(ROOT / 'user-acceptance-20261021.json'),
    resourceHandoff=pin(ROOT / 'resource-handoff-v1.json'),
    resourceTransfer=pin(ROOT / 'local-main-resource-transfer-v1.json'),
    portableInventory=pin(ROOT / 'delivery-inventory-v2.json'),
    desktopDelivery=desktop, archiveVerification=pin(ROOT / 'final-archive-verified-v2.json'),
    nativePackage=pin(ROOT / 'final-independent-package-closure-v3.json'),
    relocatedDefaultProfile=pin(Path('.artifacts/m2-4/final-relocated-default-profile-v1/report.json')),
    desktopFrozenCopy=pin(ROOT / 'desktop-frozen-inventory-verification-v2.json'),
    nativeChecks=dict(representativeLoads=15, defaultProfileRelocationLoads=1, theaters=5,
        densities=[2, 4], originalFallback=True, crossTheaterRelease=True, reentry=True,
        legacyMegawealthUsesStandardRules=True),
    focusedTests=dict(passCases=37, failCases=0, assertions=1648,
        reusedUnchangedLogs=[pin(ROOT / name) for name in test_logs],
        freshMainEntryTypecheck=pin(Path('.artifacts/m2-4/final-main-entry-typecheck-v1.log'))),
    budgetsBytes=dict(world2X=512 * 1024**2, world4X=1280 * 1024**2,
        preparedCpu=128 * 1024**2, ui=16 * 1024**2),
    finalPackagePeaks=closure['worldPeakBytes'], preparedPeakBytes=closure['preparedPeakBytes'],
    sourceArchives=scope['sourceArchivePins'], originalDataIssues=scope['originalIssues'],
    issueDetails=dict(
        missingTerrain='Three edition/source entries need absent original hyte01.tem, tile 22, subtile 0 at (77,161), from Obsolete Height Pieces.',
        zeroStarts='One YR archive entry has no valid starts, only non-start waypoints 699/700.'),
    sourceMapsOrArchivesModified=False,
    defaultPrivateProfile='/Users/Aone/Desktop/RA2-HD-M2.4-Accepted-Theaters-20261021/M2.4-Review-Profile',
    reportedBlueLight='ORIGINAL_AMBIENT_AND_THREE_BLUE_LAMPS_MATCH_ORIGINAL_2X_4X',
    expectedOriginalPolicies=['unit-sqd', 'unit-yuripr'], windows='NOT_RUN_ON_THIS_MAC',
    remotePushed=False, published=False, m24Complete=False,
    continuation='Continue unresolved original-data corrections in the current execution conversation.',
    retainedFailures=dict(firstArchive=pin(ROOT / 'failed-archive-format-v1.json'),
        archiveTimestamp=pin(ROOT / 'archive-timestamp-correction-v2.json'),
        reviewScale=pin(ROOT / 'final-offline-review-validation-v3.json'),
        priorNativeAttempts='Retained in frozen actor and current-main closure receipts.'))
for output in [Path('docs/m2-4-final-delivery-20261021.json'), ROOT / 'final-delivery-status-v1.json']:
    output.write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(dict(status=record['status'], runtime=SOURCE, m24Complete=False)))
