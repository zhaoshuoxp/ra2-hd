"""Add focused review and pinned handoff materials to a complete copied package."""
import hashlib
import html
import json
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
ART = ROOT / '.artifacts/m2-3'


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def copy(file, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        assert digest(file) == digest(target), str(target)
    else:
        shutil.copyfile(file, target)
    assert digest(file) == digest(target)


def save(file, data):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(data, indent=2) + '\n')


def main():
    receipt_path = pathlib.Path(sys.argv[1])
    receipt = json.loads(receipt_path.read_text())
    folder = pathlib.Path(receipt['folder'])
    coverage = json.loads((ART / 'final-coverage-v1.json').read_text())
    review = folder / 'M2.3-Grouped-Review'
    for source in (ART / 'inventory-v9').iterdir():
        copy(source, folder / 'M2.3-Inventory' / source.name)
    documents = {
        'final-coverage-v1.json': 'M2.3-COVERAGE.json',
        'performance-comparison-v1.json': 'M2.3-PERFORMANCE.json',
        'accepted-resource-preservation-v1.json': 'M2.3-ACCEPTED-RESOURCE-PRESERVATION.json',
        'preservation-native-validation-v1.json': 'M2.3-PROTECTED-SOURCE-PRESERVATION.json',
        'grouped-review-qa-v2/report.json': 'M2.3-OFFLINE-REVIEW-QA.json',
        'complete-environment-assembly-v1.json': 'M2.3-ENVIRONMENT-ASSEMBLY.json',
        'all-authored-shp-independent-v1.json': 'M2.3-SHP-EXPORT-VERIFICATION.json',
        'authoring-tmp-v2/temperate-m2-3-complete-v2/validation.json': 'M2.3-TERRAIN-EXPORT-VERIFICATION.json',
    }
    for source, target in documents.items():
        copy(ART / source, folder / target)
    provenance = []
    for file in sorted(ART.rglob('*imagegen*.json')):
        data = json.loads(file.read_text())
        provenance.append({'file': str(file.relative_to(ROOT)), 'sha256': digest(file),
            'bytes': file.stat().st_size, 'id': data.get('id'), 'destination': data.get('destination'),
            'masterSha256': data.get('masterSha256'), 'referenceSha256': data.get('referenceSha256'),
            'status': data.get('status')})
    save(folder / 'M2.3-AUTHORING-PROVENANCE.json', {'schema': 'm2-3-authoring-provenance-index-v1',
        'taskResourceRoot': str(ROOT), 'receiptCount': len(provenance), 'receipts': provenance,
        'boundary': 'Authoring history includes superseded candidates. Final selected manifest and independent export verification identify shipped bytes; provenance is not visual acceptance.'})
    resource_files = []
    for kind, revision in [('environment', 'environment-m2-3-complete-v1'),
                           ('terrain', 'temperate-m2-3-complete-v2')]:
        resource = ROOT / '.local' / f'{kind}-packs' / revision
        for file in sorted(resource.rglob('*')):
            if file.is_file():
                resource_files.append({'file': str(file.relative_to(ROOT / '.local')),
                    'sha256': digest(file), 'bytes': file.stat().st_size})
    for file in [ROOT / '.local/environment-selection.json', ROOT / '.local/terrain-selection.json']:
        resource_files.append({'file': str(file.relative_to(ROOT / '.local')),
                               'sha256': digest(file), 'bytes': file.stat().st_size})
    save(folder / 'M2.3-RESOURCE-HANDOFF.json', {'schema': 'm2-3-resource-handoff-v1',
        'taskResourceRoot': str(ROOT / '.local'), 'copiedWorldRoot': receipt['resources'],
        'copiedUiRoot': receipt['uiRoot'], 'copiedProfile': receipt['profile'],
        'runtimeSourceCommit': receipt['runtimeSourceHead'], 'packageReceiptSha256': digest(receipt_path),
        'packagedResourceFiles': receipt['resourceFiles'], 'files': resource_files,
        'transferPolicy': 'ADD_IF_ABSENT_OR_IDENTICAL for versioned packs. Coordinate selector and shared source changes after visual acceptance; never replace a whole older shared file or alter another worktree.',
        'preserved': ['Accepted environment, terrain, UI and prepared payloads',
                      'Protected control ring and scene matrix source', 'Windows packages and profiles'],
        'mainIntegration': 'NOT_PERFORMED', 'remotePush': 'NOT_PERFORMED'})
    selections = [
        ('native-eb2-states-2x-v1', ['CANEWY21-occupied-native-detail.png', 'CANEWY21-rubble-native-detail.png']),
        ('native-eb2-states-4x-v2', ['CANEWY21-occupied-native-detail.png', 'CANEWY21-rubble-native-detail.png']),
        ('native-XYURIPLOT-states-2x-v1', ['CIVBFM-walking-native-detail.png', 'CIVBF-cheer-native-detail.png']),
        ('native-yuriplot-states-4x-v7', ['CIVBFM-walking-native-detail.png', 'CIVBF-cheer-native-detail.png']),
        ('native-XTANYAS-states-4x-v3', ['CAGEFGL-damaged-native-detail.png']),
        ('native-XHILLS-bridge-2x-v3', ['wood-bridge-repaired-framebuffer.png']),
        ('native-XHILLS-bridge-4x-v3', ['wood-bridge-repaired-framebuffer.png']),
        ('native-crates-2x-v3', ['land-crate-framebuffer.png', 'water-crate-framebuffer.png']),
        ('native-crates-4x-v3', ['land-crate-framebuffer.png', 'water-crate-framebuffer.png']),
        ('native-decals-2x-v1', ['CRATER12-native-detail.png', 'BURNT12-native-detail.png']),
        ('native-decals-4x-v1', ['CRATER12-native-detail.png', 'BURNT12-native-detail.png']),
    ]
    native = []
    for case, files in selections:
        report = ART / case / 'report.json'
        assert json.loads(report.read_text())['status'].startswith('PASS')
        copy(report, folder / 'M2.3-Native-Evidence' / case / 'report.json')
        for name in files:
            source = ART / case / name
            target = folder / 'M2.3-Native-Evidence' / case / name
            copy(source, target)
            native.append({'file': str(target.relative_to(folder)), 'source': str(source),
                           'sha256': digest(source), 'report': f'M2.3-Native-Evidence/{case}/report.json'})
    save(folder / 'M2.3-NATIVE-REVIEW-INDEX.json', {'schema': 'm2-3-native-review-index-v1', 'images': native,
        'disclosure': 'Controlled legal native fixtures and actual native orders. Detail crops do not rescale pixels. Framebuffers retain their recorded output dimensions. Static export coverage, native binding and user visual acceptance are separate.'})
    cards = ''.join(f'<section><h2>{html.escape(pathlib.Path(item["file"]).name)}</h2>'
        f'<a href="{html.escape(item["report"])}">Native receipt</a><div class="image">'
        f'<img loading="lazy" src="{html.escape(item["file"])}"></div></section>' for item in native)
    (folder / 'M2.3-REVIEW.html').write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8">
<title>M2.3 Temperate Review R3</title><style>body{{font:20px/1.5 system-ui;background:#17191a;color:#eee;margin:24px}}h1{{font-size:36px}}h2{{font-size:25px}}a{{color:#b9d8ff}}nav{{display:flex;gap:24px;flex-wrap:wrap}}section{{margin:32px 0}}.image{{overflow:auto;margin-top:12px}}img{{max-width:none;width:auto;height:auto}}</style>
<h1>M2.3 Temperate Review R3</h1><p>Complete independent 2X/4X exports for 140 new environment families and 151 terrain members. Existing accepted assets are retained.</p>
<nav><a href="M2.3-Grouped-Review/index.html">Environment review</a><a href="M2.3-Grouped-Review/terrain.html">Terrain review</a><a href="M2.3-COVERAGE.json">Coverage and exceptions</a><a href="M2.3-PERFORMANCE.json">Matched Mac measurements</a></nav>
<p>Review the new material and state presentation in both densities. Images scroll at their native size. Native captures below use controlled legal fixtures; they do not constitute independent full gameplay tests of every map. User visual acceptance is pending. Windows and physical input are not tested here.</p>{cards}</html>\n''')
    (folder / 'M2.3-START-HERE.md').write_text(f'''# M2.3 Temperate Review R3

Open `M2.3-REVIEW.html` for the grouped environment, terrain and focused native review. Use both density choices in the grouped pages. The 612 static review images decode offline and retain native display dimensions.

Launch `{pathlib.Path(receipt['app']).name}` or `Launch-Isolated-Review.command`. Keep the application, `RA2-HD-Editions-Resources`, `RA2-HD-UI-Resources` and review files together. The review profile is `M2.3-Review-Profile`; test profiles remain isolated in the task evidence directory.

The complete environment catalog contains 238 families and 333 members, retaining 98 accepted families and adding 140. The terrain catalog contains 633 members, retaining 482 and adding 151. Original native geometry, shadows, masks, source identity, palettes and timing are preserved. World limits remain 512 MiB at 2X and 1280 MiB at 4X, with 128 MiB prepared CPU and 16 MiB UI.

All 305 official skirmish inventory entries remain accounted for, including aliases, editions and archive versions. The 161 temperate entries have no remaining authored gap. There are 157 structural passes and four original structural exceptions. Current native eligibility is 61 selectable entries, 47 entries blocked by native gameplay/mode support, and 53 archive-only entries. These categories do not imply an independent full gameplay test for every entry.

Both densities have 123 new complete-family publications and 122 native sprite bindings. One additional family retains native procedural light rendering. Seventeen authored families have explicit native limitations: sixteen lack a selectable supported map, and one is a conservative inactive range dependency. Terrain sets 51 and 56 retain their native map availability limitations. Missing inactive CR/BURN labels and original missing tile/start cases remain explicit in the coverage file.

Native evidence includes normal, damage, occupation, evacuation, rubble, actor sequences, animation phases, wooden bridge passage/destruction/repair, generated land/water crates and all 24 ground decals. Atomic family fallback, missing-pack release and same-process second-map reuse pass at both densities. R1/R2 evidence is reused only for unchanged pinned resources and unaffected mechanisms; R3 adds the conditional stock crate demand correction.

The short matched Mac scene preserves 2560 by 1600 output, 4X, shadow level 3, camera coverage and seven live bots. Fresh-profile match loading measured 7.27 seconds for the baseline and 8.10 seconds for R3. Mean update plus render submission averaged 8.38 versus 9.44 ms across two samples. World charge measured 690.91 versus 872.54 MiB. Both versions showed tail spikes in the second sample. This is a short local comparison; OS caches were not flushed and Windows performance is not established.

`M2.3-RESOURCE-HANDOFF.json` pins the complete versioned packs and actual roots. `M2.3-AUTHORING-PROVENANCE.json` indexes generation history, including superseded candidates. The original package receipt remains an immutable packaging snapshot; subsequent review additions are pinned by the final delivery manifest.

Final visual acceptance is pending your grouped review. Continue corrections for this batch in the same execution chat. After acceptance, coordinate main integration with the separate performance workstream. Main integration, remote push and publication have not occurred. The measured next-theater recommendation is SNOW, followed by URBAN; neither is started here.
''')
    print(json.dumps({'folder': str(folder), 'nativeImages': len(native),
                      'authoringReceipts': len(provenance), 'resourceFiles': len(resource_files)}))


if __name__ == '__main__':
    main()
