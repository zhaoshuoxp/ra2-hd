"""Assemble an immutable diagnostic kit from a verified retained Windows payload."""
import argparse
import hashlib
import json
import pathlib
import shutil
import struct
import subprocess
import zipfile

BASE = 'd38f1366942f586a1a9df2964a40f05cc9db4cdc'
DIAGNOSTIC = 'WINHD-20261008-D38F136-C9'
GAMEPLAY = '69a8ce57f187bd21d7de864b14473ecf9ed48e33'
BASELINE_DIAGNOSTIC_COMMIT = '5721aa57d3785a8fbc9c8aad5adf9a4172bbe3af'
RENDERING_CHANGES = ['src/engine/gfx/batch/HdSpriteEdges.ts', 'src/engine/gfx/batch/MergedSpriteMesh.ts',
    'src/engine/gfx/batch/MeshBatchManager.ts', 'src/engine/gfx/Renderer.ts',
    'src/engine/gfx/batch/HdSpriteProgramWarmup.ts', 'src/gui/screen/game/GameScreen.ts',
    'src/engine/gfx/batch/PaletteSpriteProgramWarmup.ts',
    'src/engine/renderable/builder/HdTilePoolPreparer.ts', 'src/engine/renderable/builder/poolHdPage.worker.ts',
    'src/engine/renderable/builder/resolveHdSprite.ts', 'src/engine/renderable/builder/loadSovietUnitsHd.ts',
    'src/engine/gfx/batch/CombatProgramWarmup.ts', 'src/engine/gfx/OctreeContainer.ts', 'src/engine/renderable/unitVxl/VxlUnitRenderer.ts']
parser = argparse.ArgumentParser()
parser.add_argument('--source-receipt', required=True, type=pathlib.Path)
parser.add_argument('--mapped-dist', required=True, type=pathlib.Path)
parser.add_argument('--output', required=True, type=pathlib.Path)
args = parser.parse_args()
repo = pathlib.Path.cwd()
source = json.loads(args.source_receipt.read_text())
source_root = pathlib.Path(source['folder'])
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
assert subprocess.check_output(['git', 'status', '--porcelain'], text=True).strip() == '', 'Commit diagnostic tooling before assembly'
assert source['gameplaySourceHead'] == GAMEPLAY
assert source['electron'] == '44.4.0'
assert subprocess.run(['git', 'merge-base', '--is-ancestor', BASE, head]).returncode == 0
assert DIAGNOSTIC in (repo / 'desktop/diagnostic-schema.mjs').read_text()


def sha(file):
    value = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def save(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, indent=2) + '\n')


def copy(original, target):
    assert original.is_file() and not original.is_symlink(), original
    target.parent.mkdir(parents=True, exist_ok=True)
    assert not target.exists(), target
    shutil.copyfile(original, target)


build = json.loads((args.mapped_dist / 'build-identity.json').read_text())
assert build['sourceHead'] == head and build['sourcemap'] == 'hidden'
for row in build['files']:
    file = args.mapped_dist / row['file']
    assert file.stat().st_size == row['bytes'] and sha(file) == row['sha256']

output = args.output.resolve()
output.mkdir(parents=True, exist_ok=False)
folder = output / f'RA2-HD-{DIAGNOSTIC}-{head[:7]}-Windows-x64'
folder.mkdir()
payload = folder / 'resources/app'
copied_resources, preserved_files = [], []
for row in source['files']:
    relative = pathlib.PurePosixPath(row['file'])
    assert not relative.is_absolute() and '..' not in relative.parts
    original = source_root / relative
    assert original.stat().st_size == row['bytes'] and sha(original) == row['sha256'], relative
    # Rebuild the frozen source with matching hidden source maps. Other payload
    # and complete sibling resources keep their retained accepted bytes.
    if relative.is_relative_to('resources/app/dist') or relative.as_posix() in [
        'resources/app/package.json', 'resources/app/desktop/app-files.json',
        'Launch-Isolated-Review.cmd', 'START-HERE.txt']:
        continue
    copy(original, folder / relative)
    preserved_files.append(row)
    if relative.parts[0] in ['RA2-HD-Editions-Resources', 'RA2-HD-UI-Resources']:
        copied_resources.append(row)

old_allowlist = json.loads((source_root / 'resources/app/desktop/app-files.json').read_text())
static = [name for name in old_allowlist if not name.startswith('dist/assets/')]
for name in static:
    copy(args.mapped_dist / name.removeprefix('dist/'), payload / name)
assets = sorted(args.mapped_dist.joinpath('assets').glob('*'))
for file in assets:
    if file.suffix != '.map':
        copy(file, payload / 'dist/assets' / file.name)
allowlist = sorted(static + [f'dist/assets/{file.name}' for file in assets if file.suffix != '.map'])
save(payload / 'desktop/app-files.json', allowlist)
metadata = json.loads((source_root / 'resources/app/package.json').read_text())
metadata['main'] = 'desktop/diagnostic-entry.mjs'
metadata['diagnosticId'] = DIAGNOSTIC
save(payload / 'package.json', metadata)
for file in repo.joinpath('desktop').glob('diagnostic-*'):
    copy(file, payload / 'desktop' / file.name)
copy(repo / 'desktop/windows-diagnostic.mjs', payload / 'desktop/windows-diagnostic.mjs')

launcher = r'''@echo off
setlocal
cd /d "%~dp0"
set "RA2_HD_DIAGNOSTIC=1"
set "RA2_DIAGNOSTIC_ROOT=%~dp0"
set "diag_scene=small"
set "diag_mode=4x"
set "diag_trace="
set "diag_control=none"
if "%~1"=="720p" set "diag_control=720p"
if "%~1"=="frozen" set "diag_control=frozen"
if "%~1"=="shadows-off" set "diag_control=shadows-off"
echo RA2 HD Windows diagnostic - C9 selected VXL bearing preparation candidate
echo Verify-Kit.cmd checks package integrity. Extract the entire folder first.
echo Each launch owns a new isolated profile. Do not change game/display settings.
echo Keep the game focused during its automatic four-phase capture.
choice /C S8 /N /M "Scene: [S]mall American Town, 1 AI / [8] eight players, 7 AI: "
if errorlevel 2 set "diag_scene=stress"
choice /C O24 /N /M "Density: [O]riginal / [2] 2X / [4] 4X: "
if errorlevel 3 (set "diag_mode=4x") else if errorlevel 2 (set "diag_mode=2x") else (set "diag_mode=original")
choice /C NT /N /M "Capture: [N] lightweight timings / [T] timings then one short instrumented trace: "
if errorlevel 2 set "diag_trace=--diag-trace"
"%~dp0Red Alert 2 HD.exe" --diag-scene=%diag_scene% --diag-mode=%diag_mode% --diag-control=%diag_control% %diag_trace%
if errorlevel 1 echo Diagnostic startup failed. Export-Reports.cmd preserves available failures.
pause
'''
for name, text in {
    'Launch-Diagnostics.cmd': launcher,
    'Export-Reports.cmd': r'''@echo off
setlocal
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0Red Alert 2 HD.exe" "%~dp0resources\app\desktop\diagnostic-export.mjs"
echo The RETURN ZIP is created beside this launcher. Transfer it back to the Mac conversation.
pause
''',
    'Verify-Kit.cmd': r'''@echo off
setlocal
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0Red Alert 2 HD.exe" "%~dp0resources\app\desktop\diagnostic-export.mjs" --verify
pause
''',
    'Run-Control.cmd': r'''@echo off
setlocal
cd /d "%~dp0"
echo Run only the one control selected from the returned evidence.
choice /C RFS /N /M "[R] 720p framebuffer / [F] frozen simulation / [S] shadows off: "
if errorlevel 3 (call "%~dp0Launch-Diagnostics.cmd" shadows-off) else if errorlevel 2 (call "%~dp0Launch-Diagnostics.cmd" frozen) else (call "%~dp0Launch-Diagnostics.cmd" 720p)
''',
}.items():
    (folder / name).write_bytes(text.replace('\n', '\r\n').encode('ascii'))
copy(repo / 'docs/windows-hd-diagnostic-start-here.txt', folder / 'START-HERE.txt')

reference = folder / 'Reference'
copy(repo / 'docs/windows-hd-diagnostic-protocol.txt', reference / 'TEST-PROTOCOL.txt')
copy(repo / 'docs/windows-hd-candidate-c9-20261009.md', reference / 'CANDIDATE-REPORT.md')
source_files = subprocess.check_output(['git', 'ls-files'], text=True).splitlines()
selected = [name for name in source_files if name.startswith(('src/', 'desktop/', 'scripts/windows-hd/'))
    or name in ['package.json', 'bun.lock', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'tsconfig.build.json', 'LICENSE']
    or name in ['docs/m2-2-all-maps-handoff-20261008.md', 'docs/windows-scene-performance-20261006.md',
        'docs/windows-scene-performance-20261006.json', 'docs/loading-performance-cursor-20261005.md',
        'docs/windows-hd-investigation-20261008.md', 'docs/windows-hd-a1-c1-ab-20261008.md',
        'docs/windows-hd-a1-c1-ab-20261008.json', 'docs/windows-hd-candidate-c2-20261008.md',
        'docs/windows-hd-c1-c2-ab-20261008.md', 'docs/windows-hd-c1-c2-ab-20261008.json',
        'docs/windows-hd-c2-residual-20261008.md', 'docs/windows-hd-c2-residual-20261008.json',
        'docs/windows-hd-candidate-c3-20261008.md', 'docs/windows-hd-candidate-c4-20261008.md',
        'docs/windows-hd-c3-first-acquisition-20261008.md', 'docs/windows-hd-c3-first-acquisition-20261008.json',
        'docs/windows-hd-c4-stress-trace-20261008.md', 'docs/windows-hd-c4-stress-trace-20261008.json',
        'docs/windows-hd-candidate-c5-20261008.md',
        'docs/windows-hd-c4-c5-stress-ab-20261008.md', 'docs/windows-hd-c4-c5-stress-ab-20261008.json',
        'docs/windows-hd-candidate-c6-20261008.md',
        'docs/windows-hd-candidate-c7-20261009.md', 'docs/windows-hd-c7-native-validation-20261009.json',
        'docs/windows-hd-candidate-c8-20261009.md',
        'docs/windows-hd-c8-native-validation-20261009.json',
        'docs/windows-hd-c8-windows-results-20261009.md', 'docs/windows-hd-c8-windows-results-20261009.json',
        'docs/windows-hd-c8-late-trace-20261009.md', 'docs/windows-hd-c8-late-trace-20261009.json',
        'docs/windows-hd-candidate-c9-20261009.md', 'docs/windows-hd-c9-native-validation-20261009.json',
        'docs/windows-hd-c7-manual-windows-results-20261009.md',
        'docs/windows-hd-c7-manual-windows-results-20261009.json',
        'docs/windows-hd-c6-shader-identity-windows-20261009.md',
        'docs/windows-hd-c6-shader-identity-windows-20261009.json',
        'scripts/integration/native-scene-performance.mjs']]
for name in selected:
    copy(repo / name, reference / 'source' / name)
for file in assets:
    if file.suffix in ['.map', '.js']:
        copy(file, reference / 'sourcemaps' / file.name)
map_index = []
for file in assets:
    if file.suffix == '.map':
        script = file.with_suffix('')
        assert script.is_file()
        data = json.loads(file.read_text())
        map_index.append({'scriptUrl': f'ra2://game/assets/{script.name}',
            'javascript': script.name, 'javascriptSha256': sha(script), 'sourceMap': file.name,
            'sourceMapSha256': sha(file), 'sourceContentIncluded': bool(data.get('sourcesContent'))})
save(reference / 'source-map-index.json', map_index)
copy(repo / 'node_modules/electron/electron.d.ts', reference / 'installed-api/electron-44.4.0.d.ts')
copy(repo / 'node_modules/three/src/renderers/WebGLRenderer.js', reference / 'installed-api/three-0.183.2-WebGLRenderer.js')
copy(repo / 'node_modules/three/src/renderers/webgl/WebGLShadowMap.js', reference / 'installed-api/three-0.183.2-WebGLShadowMap.js')
copy(repo / 'node_modules/three/src/core/Object3D.js', reference / 'installed-api/three-0.183.2-Object3D.js')
copy(repo / 'node_modules/three/src/materials/Material.js', reference / 'installed-api/three-0.183.2-Material.js')
versions = {name: json.loads((repo / 'node_modules' / name / 'package.json').read_text())['version']
    for name in ['electron', 'three', 'vite', 'typescript', '@playwright/test']}
save(reference / 'dependency-versions.json', versions)
(reference / 'README.txt').write_text('''Read-only source and profile interpretation material

This is a reference snapshot, NOT an immediately buildable Windows checkout.
It has relevant source, both dependency lockfiles, build configuration, installed
Electron/Three API material and selected historical reports. It excludes .git,
node_modules, authoring inputs and the complete public/build development tree.
Windows needs no development tools to run the diagnostic app or export reports.

The adjacent sourcemaps contain exact diagnostic JavaScript and matching hidden
maps with source content. Match profile script names/URLs to these byte-pinned
files. Map files are kept out of the game's protocol allowlist. Worker maps are
included when emitted. Native Electron/Chromium/driver PDBs are not included;
unresolved native stacks must remain unresolved until symbols are obtained for
the exact recorded version. Do not substitute symbols from another release.
Historical Mac timings and hardware are reference observations, not this
Windows machine's results. Review returned scripts as data before executing any.
''')
for file in reference.rglob('*'):
    if file.is_file():
        file.chmod(0o444)

# Gameplay identity is source based; a map-enabled rebuild has different
# generated bundle bytes and must never inherit the old bundle's hashes.
application_paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', BASE, 'src', 'public', 'desktop',
    'package.json', 'bun.lock', 'package-lock.json', 'vite.config.ts'], text=True).splitlines()
changes = subprocess.check_output(['git', 'diff', '--name-only', GAMEPLAY, BASE, '--', *application_paths], text=True).splitlines()
assert not changes, f'Frozen main differs from accepted gameplay source: {changes}'
new_gameplay_changes = subprocess.check_output(['git', 'diff', '--name-only', BASE, head, '--', 'src', 'public',
    'package.json', 'bun.lock', 'package-lock.json', 'vite.config.ts'], text=True).splitlines()
assert sorted(new_gameplay_changes) == sorted(RENDERING_CHANGES), new_gameplay_changes
pe_files = []
for file in sorted(folder.glob('*')):
    if file.suffix.lower() not in ['.exe', '.dll']:
        continue
    with file.open('rb') as stream:
        assert stream.read(2) == b'MZ'
        stream.seek(0x3c); at = struct.unpack('<I', stream.read(4))[0]
        stream.seek(at); assert stream.read(4) == b'PE\0\0'
        assert struct.unpack('<H', stream.read(2))[0] == 0x8664
    pe_files.append(file.name)
files = []
for file in sorted(folder.rglob('*')):
    assert not file.is_symlink()
    if file.is_file():
        files.append({'file': file.relative_to(folder).as_posix(), 'bytes': file.stat().st_size, 'sha256': sha(file)})
assert len({row['file'].casefold() for row in files}) == len(files), 'Windows case collision'
resource_hash = hashlib.sha256(json.dumps(copied_resources, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
manifest = {
    'schemaVersion': 1, 'diagnosticId': DIAGNOSTIC, 'baseCommit': BASE, 'diagnosticCommit': head,
    'role': 'FOCUSED_RENDERING_CANDIDATE_WINDOWS_AB_PENDING',
    'baselineDiagnostic': {'id': 'WINHD-20261008-D38F136-C8', 'commit': BASELINE_DIAGNOSTIC_COMMIT,
        'manifestSha256': 'f480c99fd8e4a52a81b4f40d10f1a6a372d956fb58f96ee7e7aa62a46cc1bad0'},
    'gameplaySourceIdentity': {'frozenMain': BASE, 'acceptedRuntime': GAMEPLAY,
        'applicationSourceParity': 'DECLARED_RENDERING_CHANGE', 'gameplayChanges': [],
        'renderingChanges': RENDERING_CHANGES,
        'incrementalRenderingChangesFromC8': ['src/engine/renderable/unitVxl/VxlUnitRenderer.ts'],
        'bundleBoundary': 'Candidate hidden-map rebuild; accepted runtime is a source reference, not candidate parity.'},
    'runtimeVersions': versions, 'pinnedMacRuntimeReference': {
        'electron': '44.4.0', 'chrome': '152.0.7977.78', 'node': '24.21.0',
        'boundary': 'Observed native Mac runtime; actual Windows versions must be verified in machine.json.'},
    'actualRuntimeVersions': 'Recorded on target in machine.json',
    'target': 'win32-x64', 'officialElectronRuntimeSha256': source['electronSha256'],
    'officialElectronChecksumsSha256': source['checksumsSha256'],
    'completeSiblingResources': {'worldAndUIFiles': len(copied_resources), 'inventorySha256': resource_hash,
        'parity': 'Exact retained accepted R10 bytes; every file rehashed before copying.'},
    'limitsMiB': {'world2X': 512, 'world4X': 1280, 'preparedCPU': 128, 'ui': 16},
    'referenceBuildable': False, 'sourceMaps': 'Matching diagnostic JS and maps in Reference/sourcemaps',
    'nativeSymbols': 'NOT_INCLUDED', 'verifiedX64PE': pe_files, 'windowsRuntime': 'NOT_RUN',
    'optIn': 'Launch-Diagnostics.cmd only; direct executable retains ordinary portable entry',
    'debugTransport': 'Temporary in-process WebContents debugger, no listening TCP port',
    'manualCaptureCamera': 'F8 and late F9 preserve live camera input; automatic phases retain the frozen route.',
    'exportPolicy': 'Exact report allowlist; isolated profiles, credentials and unrelated user files excluded',
    'files': files,
}
save(folder / 'diagnostic-manifest.json', manifest)
save(output / 'assembly-receipt.json', {'status': 'PASS_STATIC_WINDOWS_NATIVE_PENDING', 'folder': str(folder),
    'manifestSha256': sha(folder / 'diagnostic-manifest.json'), 'files': len(files),
    'resourceFiles': len(copied_resources), 'diagnosticCommit': head})
print(json.dumps({'folder': str(folder), 'files': len(files), 'resourceFiles': len(copied_resources), 'diagnosticCommit': head}))
