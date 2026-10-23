"""Record the completed Task E review assets and their additive integration contract."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / '.artifacts/yuri-cameos'
BASE = 'ee35fcf04de2d24c1bce2ee7497e4156483b21f1'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def read(path):
    return json.loads(path.read_text())


def resource(path, role, **metadata):
    relative = str(path.relative_to(ROOT))
    data = path.read_bytes()
    return dict(relativeDestination=relative, sha256=hashlib.sha256(data).hexdigest(), bytes=len(data),
                role=role, currentSourceRoot=str(ROOT),
                ignored=subprocess.run(['git', 'check-ignore', '-q', relative], cwd=ROOT).returncode == 0,
                **metadata)


def main():
    production = ART / (sys.argv[1] if len(sys.argv) > 1 else 'production-v4')
    runtime_path = Path(sys.argv[2]).resolve()
    receipt = read(production / 'export-receipt.json')
    runtime = read(runtime_path)
    assert runtime['status'] == 'PASS_NATIVE_YR_CAMEOS_AND_RA2_NEGATIVE_CONTROLS'
    page = read(production / 'page-check/result.json')
    assert page['status'] == 'PASS_EMBEDDED_REVIEW_ONLY'
    delivery = read(production / 'delivery-receipt.json')
    inventory = read(ROOT / 'docs/yuri-cameos-inventory.json')
    delta = read(production / 'pack-delta.json')
    paths, resources = set(), []

    def add(path, role, **metadata):
        if path not in paths:
            paths.add(path)
            resources.append(resource(path, role, **metadata))

    for item in receipt['masters']:
        add(ROOT / item['file'], 'selected-master', identity=item['identity'], density=None,
            dimensions=item['dimensions'], accepted=item['identity'] == 'muteicon.shp')
    for item in receipt['exports']:
        add(ROOT / item['file'], 'density-export', identity=item['identity'], density=item['density'],
            dimensions=item['dimensions'], masterSha256=item['masterSha256'],
            manifestDependencies=[receipt['manifest']] if item['density'] == 4 else [])
    pack = ROOT / receipt['manifest']
    add(pack, 'additive-combined-review-manifest', density=4)
    for item in delta['additions']:
        add(pack.parent / item['file'], 'selected-review-pack-art', identity=item['id'], density=4,
            manifestDependencies=[receipt['manifest']])
    for name in ['selection.json', 'master-overrides.json', 'generation-plan.json', 'pack-delta.json',
                 'export-receipt.json', 'final-validation-receipt.json', 'delivery-receipt.json',
                 'Yuri-Cameos-Complete-Review.html', 'native-size-comparison.png']:
        add(production / name, 'review-and-provenance', density=None)
    add(runtime_path, 'copied-app-runtime-evidence', density=4)
    add(production / 'page-check/result.json', 'embedded-review-evidence', density=None)
    for revision in sorted(ART.glob('production-v*')):
        for pattern in ['generated/*.png', 'masters/*.png', 'provenance/*.json', 'prompts/*.txt',
                        'corrections/**/*.png', 'corrections/**/*.json', 'corrections/**/*.txt']:
            for path in sorted(revision.glob(pattern)):
                add(path, 'retained-production-evidence', density=None,
                    revision=revision.name, selected=False if revision != production else 'SEE_SELECTED_MASTERS')
    for folder in [ART / 'references-v2', ART / 'references-v3']:
        for path in sorted(folder.glob('*')):
            if path.is_file():
                add(path, 'pinned-native-or-user-reference', density=None)
    for name in ['four-comparison-selected-v2.png', 'targeted-corrections-review-v2.png', 'correction-plan-v2.json']:
        add(production / name, 'targeted-review-and-provenance', density=None)
    for pin in receipt['preservedApprovedRepresentatives']:
        add(ROOT / pin['master'], 'preserved-approved-master', identity=pin['identity'], accepted=True, density=None)
        for item in pin['exports']:
            add(ROOT / item['file'], 'preserved-approved-export', identity=pin['identity'],
                accepted=True, density=item['density'])
    for item in delivery['copiedUiFiles']:
        path = Path(delivery['resources']) / item['file']
        data = path.read_bytes()
        assert hashlib.sha256(data).hexdigest() == item['sha256'] and len(data) == item['bytes']
    changed = git('diff', '--name-only', BASE, 'HEAD').splitlines()
    shared = [name for name in changed if name.startswith(('desktop/', 'src/'))]
    assert set(shared) == {'desktop/hd-profile.mjs', 'desktop/main.mjs', 'desktop/protocol.mjs'}
    current = git('status', '--porcelain')
    manifest = dict(schemaVersion=1, taskId='E', stage='COMPLETE_ISOLATED_REVIEW_DELIVERY',
        baseMainSha=BASE, branch=git('branch', '--show-current'), worktree=str(ROOT),
        implementationHead=git('rev-parse', 'HEAD'), commits=git('rev-list', '--reverse', f'{BASE}..HEAD').splitlines(),
        clean=not current, dirtyStatus=current.splitlines(), changedFiles=changed, changedSharedFiles=shared,
        semanticSharedChanges={
            'desktop/hd-profile.mjs': 'Optional task-owned UI root; native and world roots remain unchanged. Invalid UI override falls back to Original without leaking native-root UI.',
            'desktop/main.mjs': 'Pass separately validated UI resource root to the allowlisted protocol handler.',
            'desktop/protocol.mjs': 'Serve only registered /local-ui routes from the UI root; preserve native/world root and traversal checks.'},
        genericSourceCommit='7151ba98830eb8e12ae15b10229abd314612b725', currentNativeRoot=runtime['coreRoot'],
        runtimeUiRoot=delivery['resources'], copiedUiFiles=delivery['copiedUiFiles'], nativeArchivesCopied=False,
        acceptedPredecessor=dict(revision=delta['expectedPredecessorRevision'], sha256=delta['expectedPredecessorSha256'],
            preservedEntries=430), uiRevision=receipt['selection']['revision'], uiManifestSha256=receipt['manifestSha256'],
        defaultSelectionChanged=False, reviewOnly=True, newResources=resources, packDelta=delta,
        aliasPlan=inventory['alternatePairs'], coverage=inventory['counts'],
        representativeSelection=receipt['representativeAlternativeSelection'],
        resourceTransfer='Transfer listed ignored selected masters, exports, delta and task-local review pack. Git alone omits artwork. Merge additions into the then-current UI catalog, preserving peer changes.',
        technicalStatus=runtime['status'], visualStatus='COMPLETE_GROUPED_REVIEW_PENDING_USER_DECISION',
        userStatus='GENETIC_MUTATION_PREVIOUS_APPROVAL_RESTORED_OTHER_NEW_ART_PENDING',
        platformStatus=dict(macOSArm64='COPIED_APP_VALIDATED', Windows='NOT_RUN', combinedBuild='NOT_RUN'),
        fullBatchStatus='EXPORTED_AND_RUNTIME_VALIDATED_VISUAL_ACCEPTANCE_PENDING', integration_status='NOT_MERGED',
        uiBudgetBytes=16 * 1024 * 1024, actualRuntimeDensity=4, companion2xRuntime='NOT_SELECTED_NOT_CLAIMED_TESTED',
        peakUiBytes={case['key']: case['peakUiBytes'] for case in runtime['cases']},
        peerDependencies=dict(C='Native-guided icons remain independent of mutable C artwork. Reconcile only materially different final building identities.',
            D='Native-guided icons remain independent of mutable D artwork. Reconcile only materially different final unit identities.',
            bugfix='fix/allied-animation-sidebar owns page-switch flashing and asynchronous current-item readiness. Preserve its changes when reconciling shared desktop files.'),
        collisions=['Native localized inituico.shp equals ltnkuico.shp; INIT uses its correct base with the accepted rank overlay.',
            'Native engnuico.shp is absent; preserve native placeholder. CAOS/MIND are untrainable despite declared alternate art.'],
        evidence=dict(runtime=str(runtime_path.relative_to(ROOT)), review=resource(production / 'Yuri-Cameos-Complete-Review.html', 'embedded-review'),
            pageCheck=str((production / 'page-check/result.json').relative_to(ROOT)), delivery=str((production / 'delivery-receipt.json').relative_to(ROOT))),
        postIntegrationChecks=['Apply 43 additive identities and 12 alias contracts to the current accepted UI catalog; verify all hashes.',
            'Reconcile the three desktop resource-root changes with C/D and peer sidebar fixes, retaining current-item readiness checks.',
            'Verify copied YR normal/alternate/power bindings, queue/disabled/progress controls and 16 MiB release/reacquire.',
            'Run bounded RA2/Allied/Soviet negative controls and rapid category switching.',
            'Obtain user visual acceptance and representative choices; review only final C/D identities that materially differ.'])
    target = production / 'integration-resource-manifest.json'
    target.write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(dict(manifest=str(target), resources=len(resources), head=manifest['implementationHead'],
                         clean=manifest['clean'], integration_status='NOT_MERGED')))


if __name__ == '__main__':
    main()
