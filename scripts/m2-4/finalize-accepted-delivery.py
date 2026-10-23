"""Add accepted M2.4 reviews, source correspondence and verified evidence to the final app."""
import base64
import csv
import hashlib
import html
import io
import json
import shutil
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
base = root / '.artifacts/m2-4'
stage = base / 'final-accepted-delivery-v02-20261022'
package = json.loads((stage / 'package-receipt.json').read_text())
folder = Path('/Users/Aone/Desktop/RA2-HD-M2.4-v0.2-Mac-arm64-20261022')
history = root.parent / 'project-history/m2-4-final-20261022'
native = base / 'final-accepted-native-v02-20261022'
default = base / 'final-accepted-desktop-default-v02-20261022'
prior = base / 'final-mac-delivery-20261021-v1/RA2-HD-M2.4-Accepted-Theaters-20261021/Review'


def load(file):
    return json.loads(file.read_text())


def sha(file):
    value = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def save(file, value):
    file.write_text(json.dumps(value, indent=2) + '\n')


def copy(source, relative):
    destination = folder / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    assert not destination.exists()
    shutil.copyfile(source, destination)
    assert sha(source) == sha(destination)


assert package['sourceDirty'] == '' and package['resourceStorage'] == 'independent copies'
n, d = load(native / 'report.json'), load(default / 'report.json')
assert n['status'] == 'PASS_NATIVE_RESULT_LETTERING_BOTH_DENSITIES_AND_V02'
assert d['status'] == 'PASS_RELOCATED_APP_DEFAULT_PRIVATE_PROFILE_AND_SIBLING_RESOURCES_NATIVE_4X'
assert len(n['cases']) == 2 and all(row['result']['lettering'] == 'retail-gold-r5' for row in n['cases'])
assert d['actualProfile'] == str(folder / 'M2.4-Review-Profile')
assert d['result2x']['pixels'] == [872, 224]
retention = load(history / 'Provenance/Retention-Receipt.json')
assert retention['status'] == 'PASS_ALL_RETAINED_SOURCE_OBJECTS_DECODED_AND_HASH_VERIFIED'
assert sha(history / 'Provenance/Source-Index.jsonl') == retention['sourceIndexSha256']

plan = {
    native / 'report.json': 'Evidence/Final-Packaged-Native.json',
    default / 'report.json': 'Evidence/Final-Desktop-Default.json',
    stage / 'package-receipt.json': 'Evidence/Package-Payload.json',
    base / 'build-final-accepted-v02-20261022/identity.json': 'Evidence/Build-Identity.json',
    Path('/private/tmp/m24-final-focused-tests.log'): 'Evidence/Focused-Tests.log',
    Path('/private/tmp/m24-final-typecheck.log'): 'Evidence/Typecheck.log',
    base / 'result-lettering-r5-review-qa-final-v1/report.json': 'Evidence/Accepted-R5-Review-QA.json',
    base / 'retail-presentation-native-final-v1/report-compact.json': 'Evidence/Reused-Six-Native-Catalog-Language-Hover-Cases.json',
    base / 'result-lettering-r5-review-final-v1/M2.4-Result-Lettering-R5-Embedded.html': 'Review/Accepted-R5-Lettering-and-Hover-Embedded.html',
    prior / 'Open-Review.html': 'Review/Accepted-Theater-Gallery-20261021.html',
    prior / 'Final-Actors-Embedded.html': 'Review/Accepted-Final-Actors-Embedded.html',
    prior / 'resource-handoff-v1.json': 'Review/resource-handoff-v1.json',
    prior / 'final-mode-adaptation-v1.csv': 'Review/final-mode-adaptation-v1.csv',
    history / 'Provenance/Retention-Receipt.json': 'Authoring/External-Provenance-Receipt.json',
    history / 'Provenance/Source-Index.jsonl': 'Authoring/External-Provenance-Index.jsonl',
}
for name in ['m2-4-final-acceptance-20261022.json', 'm2-4-startup-notice-acceptance-20261022.json',
        'm2-4-result-lettering-r5-20261022.json', 'm2-4-result-lettering-r5-20261022.md',
        'm2-4-original-map-lists-20261021.json', 'm2-4-retail-locales-20261021.json',
        'm2-4-result-banners-20261021.json', 'm2-4-retail-presentation-delivery-20261022.json']:
    plan[root / 'docs' / name] = 'Records/' + name
for source, relative in plan.items():
    copy(source, relative)
(folder / 'Review/Final-Actors-Embedded.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8">'
    '<meta http-equiv="refresh" content="0;url=Accepted-Final-Actors-Embedded.html"><title>Accepted final actors</title>'
    '<a href="Accepted-Final-Actors-Embedded.html">Open the accepted embedded actor gallery</a></html>\n')
for source_dir, prefix in [(native, 'Packaged'), (default, 'Desktop')]:
    for file in source_dir.glob('*.png'):
        copy(file, f'Evidence/{prefix}-PNG/{file.name}')
shutil.copytree(root / '.local/source-art/m2-4-result-banners-v1', folder / 'Authoring/Result-Banner-Sources')

catalog = load(root / 'docs/m2-4-original-map-lists-20261021.json')
old_modes = load(prior / 'final-mode-adaptation-v1.json')['maps']
by_source = {(row['edition'], row['source']['member'].lower(), row['source']['sha256']): row for row in old_modes}
adaptations = []
for edition in catalog['records']:
    for entry in edition['originalOrder']:
        row = by_source[(edition['edition'], entry['source']['member'].lower(), entry['source']['sha256'])].copy()
        assert row['menuSelectable'] and not row['originalIssues']
        row.update(originalCatalogOrder=entry['order'], originalCatalogModes=entry['originalModes'],
            publishedSelection='VISIBLE_IN_ORIGINAL_PKT_ORDER', originalEvidencePathRetainedAsProvenance=True)
        adaptations.append(row)
assert len(adaptations) == 213
save(folder / 'Records/Published-Map-Adaptation.json', dict(schema='m2-4-published-unified-mode-table-v1',
    maps=adaptations, count=213, archiveOnlyHidden=92, sourceMapsModified=False))
with (folder / 'Records/Published-Map-Adaptation.csv').open('w') as stream:
    writer = csv.writer(stream)
    writer.writerow(['Edition', 'Order', 'Map', 'Source SHA256', 'Theater', 'Original modes', 'Maximum actual slots',
        'Adaptation', 'Cheap load', 'Accepted native evidence'])
    for row in adaptations:
        writer.writerow([row['edition'], row['originalCatalogOrder'], row['runtimeName'], row['source']['sha256'],
            row['theater'], ';'.join(row['originalModes']), row['maxSlots'], row['adaptation'], row['cheapLoadStatus'], row['nativeStatus']])

previous = load(root / 'docs/m2-4-retail-presentation-delivery-20261022.json')
correspondence = dict(schema='m2-4-final-accepted-source-resource-correspondence-v1',
    status='USER_ACCEPTED_MAC_PORTABLE_V02_VERIFIED', runtimeSourceHead=package['runtimeSourceHead'],
    acceptedRuntime='c8074fa92a2a4faca5443caf0822bf0adbe92f78', runtimeCodeUnchangedAfterAcceptance=True,
    canonicalSource=str(root), app='Red Alert 2 HD v0.2.app', target='darwin-arm64', publicVersion='v0.2',
    engineReplayCompatibility='UNCHANGED_0.0.1', resourceRoot='RA2-HD-Editions-Resources', uiRoot='RA2-HD-UI-Resources',
    privateProfile='M2.4-Review-Profile', mutableProfileExcludedFromArchive=True,
    profilePolicy='The app resolves its own sibling resources and profile without source checkout or developer overrides. Existing profiles are preserved.',
    sourcePayload='Evidence/Package-Payload.json', independentCopies=True, resourceFiles=package['resourceFiles'], uiResourceFiles=package['uiResourceFiles'],
    publishedOriginalCatalog=previous['publishedOriginalCatalog'], selectedTheaters=previous['reusedEvidence']['selectedTheaters'],
    preparedContract=package['preparedContract'], preparedRegistration=package['preparedRegistration'],
    preparedPolicy=previous['reusedEvidence']['preparedPolicy'], budgetsBytes=dict(world2x=536870912, world4x=1342177280,
        preparedCpu=134217728, ui=16777216),
    newMacEvidence=dict(packagedOutcomes=2, densities=[2, 4], editions=['ra2', 'yr'],
        defaultRelocatedStartup=d['status'], selectorLanguages=3, uiPeakBytes=max(row['result']['ui']['reservedBytes'] for row in n['cases']),
        preparedCpuPeakBytes=d['native']['prepared']['peakBytes'], focusedCases=27, assertions=4061,
        entryTypecheck='PASS', isolatedBuild='PASS', nativeResultRelease='PASS'),
    reusedEvidence=dict(previousTheaterNativeLoads=15, acceptedNativeSourceEntries=301, publishedSourcesAddedByCatalogCorrection=0,
        previousCatalogLanguageNameHoverCases=6, finalR5RasterCases=24, sourceRecords='Records/m2-4-retail-presentation-delivery-20261022.json'),
    visualAcceptance=dict(fiveTheaters='USER_ACCEPTED_THROUGH_BATCH98', resultBanners='R5_USER_ACCEPTED',
        hoverTypography='USER_ACCEPTED', startupNotice='USER_ACCEPTED_CHINESE_AND_ENGLISH_TRADITIONAL_SYNCHRONIZED'),
    bannerSlots=dict(campaignStandby=[0, 1], skirmishActive=[2, 3], campaignExecutionEnabled=False),
    artProvenance=dict(resultMasters='Authoring/Result-Banner-Sources', externalTheaterSources=str(history / 'Provenance'),
        externalIndex='Authoring/External-Provenance-Index.jsonl', externalIndexSha256=retention['sourceIndexSha256'],
        sourceObjectsVerified=retention['fileCount'], activeIgnoredRuntimeArtIncludedInPackage=True),
    cleanupReceipt=str(history / 'Final-Cleanup.json'), cleanupPolicy='Scoped post-delivery retirement recorded separately; no original data or user profile is deleted.',
    priorAcceptedDeliveryOverwritten=False, sourceMapsOrArchivesModified=False, windows='NOT_RUN_ON_THIS_MAC',
    remotePush=False, published=False, m24Complete=True,
    scope='Complete for the original RA2/YR PKT skirmish lists. Four hidden archive-only source anomalies remain documented and do not enter this selection.')
save(folder / 'SOURCE-AND-RESOURCES.json', correspondence)


def embed(file, context=False):
    data = file.read_bytes()
    mime = 'image/png'
    if context:
        buffer = io.BytesIO()
        Image.open(file).convert('RGB').save(buffer, 'WEBP', quality=95, method=4)
        data, mime = buffer.getvalue(), 'image/webp'
    return f'data:{mime};base64,' + base64.b64encode(data).decode()


figures = ''.join(f'<figure><figcaption>{row["edition"].upper()} · {row["density"]}X · final packaged native outcome</figcaption>'
    f'<img width="436" src="{embed(native / row["crop"])}"></figure>' for row in n['cases'])
document = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RA2 HD v0.2 — Accepted M2.4 Delivery</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#10171d;color:#e6edf1;font:20px/1.55 system-ui,sans-serif}}
main{{max-width:1280px;margin:auto;padding:32px}}h1{{font-size:34px}}h2{{font-size:25px}}a{{color:#9cd5ff}}
section{{padding:22px;margin:24px 0;border:1px solid #4a5a65;border-radius:8px}}figure{{margin:16px 0}}img{{max-width:100%;height:auto;display:block}}
figcaption{{font-size:18px;margin:8px 0}}code{{overflow-wrap:anywhere}}.outcomes{{display:flex;gap:30px;flex-wrap:wrap}}
</style><main><h1>RA2 HD v0.2 — M2.4 accepted</h1>
<section><p>Five theater resource sets, R5 result lettering and HD hover labels are user accepted. The bilingual startup notice is integrated.</p>
<p>RA2: 62 original maps. YR: 151. Original PKT order, unified standard skirmish rules and actual starting-point limits are preserved.
The 92 archive-only extras remain hidden and retained. All 213 published sources have accepted loading evidence; no published source blocker remains.</p>
<p><a href="Accepted-R5-Lettering-and-Hover-Embedded.html">Accepted R5 lettering, original comparisons and HD hover labels</a></p>
<p><a href="Accepted-Theater-Gallery-20261021.html">Accepted five-theater gallery</a> ·
<a href="Accepted-Final-Actors-Embedded.html">Accepted final actor gallery</a> ·
<a href="../Records/Published-Map-Adaptation.csv">Published map order and runtime adaptation table</a></p>
<p>These exact accepted review snapshots retain historical captions and pre-acceptance statuses. The current acceptance and published scope are recorded in SOURCE-AND-RESOURCES.json.</p></section>
<section><h2>Final copied-package checks</h2><div class="outcomes">{figures}</div>
<p>RA2 2X and YR 4X native outcomes, localized startup, resource release, 27 focused tests and entry typecheck pass.
The actual Desktop app also passes default sibling-resource startup, all three selector languages, a native 4X world and a 2X result image.</p>
<img src="{embed(default / 'relocated-default-profile-native-4x.png', context=True)}" width="1120">
<p>Earlier accepted five-theater, state, seam, Original/failure fallback and source/native evidence is reused. Windows is not tested on this Mac.</p></section>
<section><h2>Launch and correspondence</h2><p>Open <strong>Red Alert 2 HD v0.2.app</strong>. Keep both sibling resource folders beside it.
The app creates its own M2.4-Review-Profile. Mutable user settings are excluded from the ZIP.</p>
<p>Frozen source: <code>{html.escape(package['runtimeSourceHead'])}</code>. Complete runtime dependencies and ignored active artwork are independently copied and hash checked.
Generated masters, prompts and source receipts remain in the separate indexed provenance handoff.</p>
<p>This is a local ad-hoc signed Mac arm64 build. No push or publication occurred.</p></section></main></html>'''
(folder / 'Review/Open-Review.html').write_text(document)
(folder / 'START-HERE.txt').write_text('''RA2 HD v0.2 — Accepted M2.4 Mac arm64 delivery

Open Red Alert 2 HD v0.2.app or Launch-Isolated-Review.command.
Keep RA2-HD-Editions-Resources and RA2-HD-UI-Resources beside the app.
Review/Open-Review.html is the embedded summary and accepted-gallery entry.

RA2 publishes 62 original maps; YR publishes 151, in original PKT order.
All published maps use the current standard skirmish rules and actual start limits.
92 archive-only extras are preserved and hidden, including four historical source anomalies.
Simplified Chinese, Traditional Chinese and English cover map, UI and game text.
The first player row supports a persistent editable name.
HD hover labels and all four localized result slots are accepted. Campaign slots 0/1
remain standby; slots 2/3 serve actual skirmish results. Campaign execution is not enabled.
The accepted bilingual project notice and public v0.2 label are integrated.

The app uses only its sibling resources and M2.4-Review-Profile. No source checkout,
previous app or development server is needed. The ZIP excludes mutable settings.
SOURCE-AND-RESOURCES.json links source, resources, artwork, acceptance and evidence.
Delivery-Inventory.json pins every shipped payload file and framework symlink.
Authoring/External-Provenance-Receipt.json identifies the separate indexed theater-source handoff.

Mac technical and user visual acceptance are complete. Windows is not tested.
This is a local ad-hoc signed build, not a published or notarized release.
''')
print(json.dumps(dict(status=correspondence['status'], folder=str(folder), runtime=package['runtimeSourceHead'], publishedMaps=len(adaptations))))
