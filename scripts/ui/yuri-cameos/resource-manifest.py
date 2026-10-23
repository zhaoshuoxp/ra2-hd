"""Record the current isolated review checkpoint and transferable resource identities."""
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


def identity(relative, role, **metadata):
    path = ROOT / relative
    data = path.read_bytes()
    return dict(relativeDestination=relative, sha256=hashlib.sha256(data).hexdigest(), bytes=len(data),
                role=role, currentSourceRoot=str(ROOT), ignored=bool(git('check-ignore', relative)), **metadata)


def main():
    revision = sys.argv[1] if len(sys.argv) > 1 else 'representative-v3'
    receipt = json.loads((ART / revision / 'receipt.json').read_text())
    page_check = json.loads((ART / revision / 'page-check-chromium-v2/result.json').read_text())
    assert page_check['status'] == 'PASS_EMBEDDED_REVIEW_ONLY'
    inventory = json.loads((ROOT / 'docs/yuri-cameos-inventory.json').read_text())
    records = [identity(r['file'], 'review-export', density=r['density'], identity=r['identity'],
                        dimensions=r['size'], masterSha256=r['masterSha256'],
                        manifestDependencies=[f'.artifacts/yuri-cameos/{revision}/receipt.json'])
               for r in receipt['resources']]
    records += [identity(r['file'], 'review-master', density=None, identity=r['identity'], dimensions=r['size'])
                for r in receipt['masters']]
    for board_revision in [1, 2, 3]:
        records.append(identity(f'.artifacts/yuri-cameos/representative-v{board_revision}/generated-board.png',
                                'generation-board', density=None, identity='representative-board',
                                accepted=False, status='PARTIAL_APPROVAL' if board_revision == 3 else 'REJECTED'))
    for correction in sorted(ART.glob('yapowr-correction-v*/generated-master.png')):
        relative = str(correction.relative_to(ROOT))
        records.append(identity(relative, 'generation-master', density=None, identity='ypwricon.shp',
                                accepted=False, status='TARGETED_REVIEW_PENDING'
                                if relative == receipt.get('replacementMaster') else 'SUPERSEDED'))
    records.append(identity('.artifacts/yuri-cameos/references-v1/c-yapowr-direction-master.png',
                            'pinned-peer-reference', density=None, identity='YAPOWR', accepted='DIRECTION_ONLY'))
    selection = identity('.local/ui-selection.json', 'preserved-accepted-selection', density=4,
                         identity='remaining-ui-v4')
    current = git('status', '--porcelain')
    delta = [{**entry, 'edition': 'yr', 'operation': 'UNSELECTED_REVIEW_CANDIDATE',
              'expectedPredecessor': None, 'productionApproved': False} for entry in receipt['fragment']]
    manifest = dict(schemaVersion=1, taskId='E', stage='REPRESENTATIVE_REVIEW_PENDING', baseMainSha=BASE,
                    branch=git('branch', '--show-current'), worktree=str(ROOT),
                    implementationHead=git('rev-parse', 'HEAD'),
                    commits=git('rev-list', '--reverse', f'{BASE}..HEAD').splitlines(),
                    clean=not current, dirtyStatus=current.splitlines(),
                    changedFiles=git('diff', '--name-only', BASE, 'HEAD').splitlines(),
                    changedSharedFiles=[], semanticSharedChanges=[],
                    currentSelection=selection, runtimeSelectionChanged=False,
                    acceptedInputManifest=identity('.artifacts/yuri-cameos/accepted-input-copies.json', 'accepted-input-inventory'),
                    newResources=records, packDelta=delta,
                    aliasPlan=inventory['alternatePairs'], coverage=inventory['counts'],
                    resourceTransfer='Copy listed task-local ignored resources and verify hashes; Git alone does not transfer artwork.',
                    technicalStatus='PREPARATION_UI_TESTS_TYPECHECK_EXPORT_AND_EMBEDDED_REVIEW_PASS',
                    visualStatus='CORRECTED_REPRESENTATIVE_REVIEW_PENDING', userStatus='NOT_ACCEPTED_FOR_FULL_BATCH',
                    approvedRepresentativeDirections=receipt.get('approvedDirections', []),
                    pendingRepresentativeDirections=receipt.get('pendingDirections', []),
                    platformStatus=dict(reviewBrowser='macOS Chromium', macOSGame='NOT_RUN_FOR_E', Windows='NOT_RUN'),
                    fullBatchStatus='NOT_COMPLETE', integration_status='NOT_MERGED',
                    peerDependencies=dict(C='Pinned YAPOWR direction-only reference; final consistency review targeted to changed designs.',
                                          D='No accepted production master bound; source audit only.',
                                          bugfix='fix/allied-animation-sidebar owns asynchronous current-item timing and page-switch flashing.'),
                    collisions=['Localized native inituico.shp equals ltnkuico.shp; use INIT base plus shared rank.',
                                'Absent engnuico.shp; preserve native fallback.'],
                    pending=['Representative direction approval', '31 canonical pictures and 12 additive rank aliases',
                             'Both-density exports and complete structural validation',
                             'Actual YR sidebar states, alternates, allocation/release and rapid-switch check',
                             'RA2 and accepted Allied/Soviet lookup negative controls',
                             'One isolated implementation build and copied macOS review-resource/profile validation',
                             'Complete visual review and final user acceptance'],
                    postIntegrationChecks=['Merge the additive identity/resource delta against the then-current accepted pack.',
                                           'Preserve the peer fix current-item checks and asynchronous readiness.',
                                           'Verify copied resource hashes, aliases, actual YR bindings and 16 MiB allocation.',
                                           'Run a bounded RA2/Allied/Soviet negative control and rapid category switching.'])
    output = ART / 'integration-resource-manifest.json'
    output.write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(dict(manifest=str(output), head=manifest['implementationHead'], clean=manifest['clean'],
                         resources=len(records), integration_status='NOT_MERGED')))


if __name__ == '__main__':
    main()
