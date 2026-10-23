"""Inventory additive Task D resources and exact shared-file predecessors for manual integration."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('output', type=Path)
p.add_argument('--acceptance', type=Path, required=True)
a = p.parse_args()
root = Path.cwd().resolve()
base = 'ee35fcf04de2d24c1bce2ee7497e4156483b21f1'
git = lambda *args: subprocess.check_output(['git', *args], text=True).strip()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
catalog = json.loads((root / 'desktop/yuri-unit-contracts.json').read_text())
installed = json.loads((root / '.artifacts/yuri-units/installed-resources-v1.json').read_text())
acceptance = json.loads(a.acceptance.read_text())
owners = {}
for identity, entry in catalog['shp'].items():
    owners[str(Path(entry['familyPath']).parent)] = {'identity': identity, 'density': [2, 4], 'kind': 'family'}
    for member in entry['members']:
        directory = f"hd-packs/{member.get('packId', 'yuri-' + member['member'].split('.')[0] + '-authored')}/{member.get('revision', 'r1')}"
        manifest_path = root / '.local' / directory / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        owners[directory] = {'identity': identity, 'member': member['member'], 'density': [2, 4], 'kind': 'SHP',
            'manifest': directory + '/manifest.json', 'sourceHash': member['sourceHash']}
for identity, entry in catalog['vxl'].items():
    for variant in entry['variants']:
        manifest = json.loads((root / '.local' / variant['path']).read_text())
        owners[str(Path(variant['path']).parent)] = {'identity': identity, 'density': variant['density'],
            'kind': 'VXL', 'manifest': variant['path'], 'sourceHashes': manifest['sources']}
resources = []
for file in installed['files']:
    relative = file['path']; source = root / '.local' / relative
    assert sha(source) == file['sha256'] and source.stat().st_size == file['bytes']
    owner = next(v for directory, v in owners.items() if relative.startswith(directory + '/'))
    density = owner['density']
    if owner['kind'] == 'SHP' and Path(relative).name.startswith(('2x-', '4x-')):
        density = int(Path(relative).name[0])
    dependencies = []
    if Path(relative).name == 'family.json':
        family = json.loads(source.read_text())
        dependencies = [f"hd-packs/{member['packId']}/{member['revision']}/manifest.json"
            for member in family['members']]
        dependencies.extend(v['path'] for v in family.get('requiredVxl', {}).get('variants', []))
    if Path(relative).name == 'manifest.json':
        manifest = json.loads(source.read_text())
        if owner['kind'] == 'SHP':
            dependencies = [str(Path(relative).parent / page[role]) for v in manifest['variants']
                for page in v['pages'] for role in ['base', 'data']]
        elif owner['kind'] == 'VXL':
            dependencies = [str(Path(relative).parent / part['files'][role]['file']) for part in manifest['parts']
                for role in ['base', 'data']]
    for dependency in dependencies:
        assert (root / '.local' / dependency).is_file(), dependency
    resources.append({**file, **owner, 'density': density, 'relativeDestination': '.local/' + relative,
        'actualSource': str(source), 'stagedSource': str(Path(installed['sourceRoot']) / relative.removeprefix('hd-packs/')),
        'dependencies': dependencies, 'gitTransfersThisFile': False, 'copyMode': 'ADD_IF_ABSENT_OR_IDENTICAL'})

masters = {}
def selected_masters(value, identity):
    if isinstance(value, dict):
        if value.get('selectedArt'):
            path = root / value['selectedArt']
            digest = sha(path)
            assert digest == value['selectedArtSha256'], str(path)
            record = masters.setdefault(str(path.relative_to(root)), {
                'actualSource': str(path), 'sha256': digest, 'bytes': path.stat().st_size,
                'identities': [], 'gitTransfersThisFile': False})
            if identity not in record['identities']:
                record['identities'].append(identity)
        for item in value.values():
            selected_masters(item, identity)
    elif isinstance(value, list):
        for item in value:
            selected_masters(item, identity)

shp_work = json.loads((root / '.artifacts/yuri-units/shp-production-v2/worklist.json').read_text())
for identity, family in shp_work['families'].items():
    selected_masters(family, identity)
vxl_work = json.loads((root / '.artifacts/yuri-units/vxl-production-v1/worklist.json').read_text())
for board in vxl_work['boards']:
    selected_masters(board, board['identity'])

semantics = {
    'desktop/hd-profile.mjs': 'Add the separate Yuri catalog, unique YR SHP selections, independent VXL densities and atomic miner registration; retain baseline manifest routes.',
    'desktop/profile.mjs': 'Admit only exact hash-matched Yuri source contracts.',
    'desktop/main.mjs': 'Recognize the unique Task D review milestone and isolated profile.',
    'src/engine/ImageFinder.ts': 'Resolve edition-aware Yuri SHP identities and exact engineer/slave aliases.',
    'src/engine/renderable/builder/loadSovietUnitsHd.ts': 'Reuse shared demand loading with separate Yuri selectors and same-density miner acquisition.',
    'src/engine/renderable/builder/resolveHdSprite.ts': 'Admit the pinned Yuri source set into the existing pooled SHP path.',
    'src/engine/renderable/builder/resolveMixedUnitFamily.ts': 'Add optional same-density complete-family transactions with release before retry.',
    'src/engine/renderable/builder/unitHdFamilies.ts': 'Filter legacy contracts by edition before merging the additive Yuri catalog.',
    'src/engine/renderable/unitVxl/identities.ts': 'Add Yuri VXL identity entries and independent density variants.',
    'src/engine/renderable/unitVxl/loadVxlFamily.ts': 'Choose one complete 4x or 2x variant and preserve baseline loading behavior.',
    'src/engine/renderable/entity/Anim.ts': 'Bound only rendered animation samples to resolved SHP frames; preserve native animation timing and gameplay.',
    'src/game/rules/WeaponRules.ts': 'Parse native DiskLaser and its explicit inner/outer colors; retain IsLaser semantics.',
    'src/game/rules/TechnoRules.ts': 'Admit the native TurretSpins flag without changing retail rule files.',
    'src/game/gameobject/trait/TurretTrait.ts': 'Advance flagged spinning turrets by their existing native ROT; retain ordinary aim behavior.',
    'src/game/Weapon.ts': 'Resolve native AreaFire projectile targets at the caster while preserving enemy acquisition and range checks.',
    'src/game/weaponAreaTarget.ts': 'Keep caster-centered AreaFire targeting separate from unchanged ordinary enemy targeting.',
    'src/engine/renderable/entity/Projectile.ts': 'Create native disc circumference/ray presentation and bounded non-locomotor magnetic pulses.',
    'src/engine/renderable/entity/RenderableFactory.ts': 'Attach persistent magnetic-lift presentation to eligible native victims.',
    'src/engine/renderable/entity/plugin/MagneticLiftBeamPlugin.ts': 'Follow the live lifted victim and dispose the ribbon when its native controller releases.',
    'src/engine/renderable/fx/DiscLaserFx.ts': 'Animate a circumference sweep followed by a ray within the native LaserDuration; retain damage/cooldown timing.',
    'src/engine/renderable/fx/MagneticBeamFx.ts': 'Render a live native-color magnetic ribbon without additive white clipping.',
    'src/engine/renderable/unitVxl/VxlUnitRenderer.ts': 'Recover the DISK components physical height along camera rays to avoid folded-depth semicircle loss; retain pixels and logical bounds.',
}
shared = []
for line in git('diff', '--name-status', base, 'HEAD').splitlines():
    status, file = line.split('\t')
    if not (file.startswith('desktop/') or file.startswith('src/')):
        continue
    predecessor = None
    if status != 'A':
        predecessor = hashlib.sha256(subprocess.check_output(['git', 'show', base + ':' + file])).hexdigest()
    current_main = Path('/Users/Aone/RA2remaster/ra2-hd') / file
    shared.append({'file': file, 'change': status, 'sha256': sha(root / file), 'expectedPredecessorSha256': predecessor,
        'observedMainSha256': sha(current_main) if current_main.exists() else None,
        'semanticChange': semantics.get(file, 'New Task D source-contract helper or separate Yuri catalog.'),
        'integrationMode': 'MERGE_ADDITIONS_AND_SEMANTICS_DO_NOT_REPLACE_ADVANCED_MAIN_FILE'})
main = '/Users/Aone/RA2remaster/ra2-hd'
result = {'schemaVersion': 1, 'taskId': 'D', 'baseMainSha': base, 'branch': git('branch', '--show-current'),
    'worktree': str(root), 'implementationHead': git('rev-parse', 'HEAD'),
    'commits': [{'sha': line.split(' ', 1)[0], 'subject': line.split(' ', 1)[1]}
        for line in git('log', '--reverse', '--format=%H %s', base + '..HEAD').splitlines()],
    'ownStatus': git('status', '--porcelain'), 'ownClean': not git('status', '--porcelain'),
    'observedMainHead': git('-C', main, 'rev-parse', 'HEAD'), 'observedMainStatus': git('-C', main, 'status', '--porcelain'),
    'runtimeSourceHead': acceptance['runtimeSourceHead'], 'build': acceptance['packageReceipt'],
    'status': acceptance['status'], 'integration_status': 'NOT_MERGED', 'sharedFiles': shared,
    'resourceRoot': str(root / '.local'), 'resources': resources, 'resourceCount': len(resources),
    'selectedMasters': [{'path': path, **record} for path, record in sorted(masters.items())],
    'provenanceWorklists': ['.artifacts/yuri-units/shp-production-v2/worklist.json',
        '.artifacts/yuri-units/vxl-production-v1/worklist.json'],
    'gitResourceWarning': 'Git integration does not transfer .local HD packs or ignored artwork/evidence. Copy each inventoried immutable resource additively and verify SHA-256.',
    'additiveCatalog': 'desktop/yuri-unit-contracts.json', 'replaceWholeMainCatalogOrProfile': False,
    'registration': {'shp': catalog['shp'], 'vxl': catalog['vxl']},
    'peerDependencies': acceptance['peerDependencies'], 'deploymentInterfaces': acceptance['deploymentInterfaces'],
    'acceptance': {k: acceptance[k] for k in ['technicalStatus', 'visualStatus', 'userAcceptance', 'platformStatus']},
    'clarityFeedback': {'status': acceptance.get('clarityStatus', 'NOT_RECORDED'),
        'report': acceptance.get('clarityReport')},
    'postIntegrationChecks': [
        'Preflight exact resource SHA-256 and local route ownership without overwriting accepted paths.',
        'Merge catalog and loader semantics into current main, preserving C/E/bugfix additions and accepted resource identities.',
        'Recheck source/hash identity, all 19 Yuri roots, 2 children, both densities and whole-family missing-member fallback.',
        'Run one RA2 edition-leakage negative control and preserve the legacy hero Original guard.',
        'Validate C+D PCV/YACNST and SMIN/YAREFN deploy/undeploy, shared smintur source/pivots/owners and allocation release.',
        'Measure combined C+D allocations under 256/1280 MiB; isolated D does not certify the integrated world.',
        'Register E cameos by rules identity while preserving D image/source identities.',
        'Verify DISK eight-bearing rotation, complete silhouette and ring/ray sequence, TELE live lift/release ribbon, selected MIND/YURIPR arcs and caster-centered CAOS AreaFire.',
        'Use one unique copied Mac app/profile/resource root; confirm actual in-match bindings and review integrated behavior separately from accepted batch art.']}
assert len(resources) == 140
a.output.parent.mkdir(parents=True, exist_ok=True)
assert not a.output.exists(), 'Preserve prior integration snapshots'
a.output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'path': str(a.output.resolve()), 'head': result['implementationHead'],
    'resources': len(resources), 'sharedFiles': len(shared), 'clean': result['ownClean']}))
