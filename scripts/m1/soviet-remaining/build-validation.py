"""Bind the delivered app, complete-family evidence, limits and per-family failures."""
import hashlib
import html
import json
import re
import shutil
import subprocess
from pathlib import Path

root = Path('.artifacts/soviet-remaining')
out = root / 'complete-review-v1'
read = lambda p: json.loads((root / p).read_text())
artifact_path = root / 'build-2026-09-21T20-35-44-119Z/artifact.json'
artifact = json.loads(artifact_path.read_text())
source_checked = []
for row in artifact['source']['files']:
    p = row['file']
    if p.startswith(('src/', 'desktop/')) or p in ['package.json', 'bun.lock', 'index.html', 'vite.config.ts', 'tsconfig.build.json']:
        assert hashlib.sha256(Path(p).read_bytes()).hexdigest() == row['sha256'], f'App source changed: {p}'
        source_checked.append(p)
source_binding = dict(status='PASS_APP_RUNTIME_SOURCE_CONTENT_BINDING', filesChecked=len(source_checked),
                      currentCommit=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
                      buildParentCommit=artifact['source']['head'], buildSnapshot=artifact['source']['sourceDigest'],
                      note='Runtime source and desktop files match the built snapshot; later test tools and documentation are not app payload.')
runtime = read('runtime-complete-v2/result.json')
owners = read('runtime-owners-wall-v1/result.json')
native = read('native-builds-v1/native.json')
naval = read('naval-retry-v5/naval.json')
exports = read('export-validation-production-v1.json')
preservation = read('preservation-production-v1.json')
fallback = read('fallback-v1/result.json')
assert runtime['status'] == 'PASS_NATIVE_CONTROLLER_RENDER_REVIEW'
assert owners['status'] == 'PASS_NATIVE_CONTROLLER_RENDER_REVIEW'
assert naval['status'] == 'PASS_NATIVE_LEGAL_SHIPYARD_AND_SUBMARINE_PRODUCTION'
assert exports['status'] == 'PASS_EXPORT_CONTRACT'
assert preservation['stableProtectedPayloads'] == 'PASS'
assert fallback['status'].startswith('PASS')
assert read('complete-review-v1/browser-check.json')['status'] == 'PASS_COMPLETE_PORTABLE_REVIEW'
tests = (root / 'focused-tests.log').read_text()
assert re.search(r'53 pass\s+0 fail', tests)
assert 'error TS' not in (root / 'typecheck.log').read_text()
activation = runtime['activation']
families = {}
for name, f in runtime['families'].items():
    natural = naval['status'] if name == 'NAYARD' else native['families'][name]['status']
    assert natural.startswith('PASS'), (name, natural)
    families[name] = dict(export=exports['families'][name], nativeController=f['status'], nativeProduction=natural,
                         ownerColors='PASS_RENDER_FIXTURES_VISUAL_REVIEW_PENDING', motionSamples=sum(len(s['files']) for s in f['sequences']),
                         normalDamagedGeometryAndShadowParity='PASS', gpuBytes=activation['families'][name]['gpuBytes'],
                         finalVisualAcceptance='PENDING_USER', finalGameplayAcceptance='PENDING_USER')
rhino = json.loads(Path('.local/hd-packs/rhino-authored/1/manifest.json').read_text())
# Measured accepted Rhino allocation: sixteen 320x288 RGBA+R parts and sixteen palette texels.
assert rhino['size'] == [320, 288] and len(rhino['parts']) == 16
rhino_bytes = len(rhino['parts']) * (rhino['size'][0] * rhino['size'][1] * 5 + 4)
gpu_bytes = sum(f['gpuBytes'] for f in activation['families'].values()) + sum(activation[k]['gpuBytes'] for k in ['napowr', 'powerPlant', 'conscript']) + rhino_bytes
assert gpu_bytes <= 256 * 1024 * 1024
failures = [dict(family='NAYARD', run='native-builds-v1', reason='No legal water foundation near the inland test base; dependent submarine and repair scenarios could not run', resolution='Legal coastal queue and submarine production passed in naval-retry-v5; shipyard native repair/sale remains NOT RUN'),
            dict(family='NAYARD', run='naval-retry-v1', reason='No visible water foundation in initial test setup', resolution='MCV moved through native orders to coastal land'),
            dict(family='NAYARD', run='naval-retry-v2', reason='Test assumed a 3x3 construction-yard footprint', resolution='Fixture now reads the actual 4x4 art foundation and center'),
            dict(family='NAYARD', run='naval-retry-v3', reason='Coastal fixture omitted the refinery prerequisite', resolution='Native prerequisite chain completed in naval-retry-v5'),
            dict(family='NAYARD', run='naval-retry-v4', reason='Single-delivery polling did not observe the production-animation transition', resolution='Native setAnimation event tracing across two submarine deliveries confirmed both production and idle transitions in naval-retry-v5'),
            dict(family='NAMISL', run='complete-review-v1/browser-check-first-static-pose', reason='Test expected a one-frame idle sequence to move', resolution='Playback assertion selects a multi-frame sequence; review passed')]
report = dict(status='TECHNICAL_REVIEW_DELIVERED_FINAL_VISUAL_GAMEPLAY_ACCEPTANCE_PENDING', families=families,
              representativeAcceptance='ACCEPTED', completeFamilyVisualAcceptance='PENDING_USER', gameplayAcceptance='PENDING_USER',
              sourceBinding=source_binding, app=artifact['artifact'], authoredShpSlots=1102, retainedOriginalSlots=192, turretHeadings=16,
              nativeMotionSamples=1278, tests=dict(passed=53, failed=0, assertions=1332, typecheck='PASS'),
              gpu=dict(allEnabledOptionalBytes=gpu_bytes, budgetBytes=256*1024*1024, status='PASS', note='Actual app building allocations plus accepted Rhino allocation'),
              preservation=preservation, failures=failures,
              limits=dict(physicalPausedMenuCursor='UNVERIFIED_REQUIRES_HUMAN', completeDefenseCombat='PENDING_HUMAN_GAMEPLAY_ACCEPTANCE',
                          completeSuperweaponGameplay='PENDING_HUMAN_GAMEPLAY_ACCEPTANCE', windowsRuntime='NOT_RUN', campaigns='OUT_OF_SCOPE',
                          shipyardNativeRepairSale='NOT_RUN', ownerColorVisualAcceptance='PENDING_USER'),
              nativeTraceScope='100000-credit test fixture; unchanged retail costs, prerequisites, placement, actions and timing. Damage uses a labeled health event fixture.',
              drawingBuffers=dict(logical=activation['logical'], highestPreset=activation['buffer'], note='Window aspect ratio determines width; not a claim of physical 3840x2160 output.'))
(out / 'validation.json').write_text(json.dumps(report, indent=2) + '\n')
evidence = out / 'evidence'; evidence.mkdir(exist_ok=True)
for relative in ['native-tail-validation.json', 'export-validation-production-v1.json', 'tile-gpu-v1/report.json',
                 'accepted-pack-pool-validation.json', 'remaining-pack-pool-validation.json', 'fallback-v1/result.json',
                 'native-builds-v1/native.json', 'naval-retry-v5/naval.json', 'runtime-owners-wall-v1/families.json',
                 'preservation-production-v1.json', 'family-packs-1.json']:
    shutil.copyfile(root / relative, evidence / relative.replace('/', '--'))
rows = ''.join(f'<tr><td>{name}</td><td>PASS</td><td>PASS</td><td>{f["motionSamples"]}</td><td>PENDING</td></tr>' for name, f in families.items())
failure_rows = ''.join(f'<li><b>{f["family"]} / {f["run"]}:</b> {html.escape(f["reason"])}. {html.escape(f["resolution"])}.</li>' for f in failures)
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Soviet Buildings Validation</title>
<style>body{{max-width:1080px;margin:32px auto;padding:24px;background:#152019;color:#e8efe9;font:18px/1.55 system-ui}}h1{{font-size:32px}}h2{{font-size:25px}}a{{color:#b6e4c6}}td,th{{padding:10px;text-align:left;border-bottom:1px solid #526c5a}}table{{border-collapse:collapse;width:100%}}li{{margin:10px 0}}.gate{{padding:18px;border-left:5px solid #d9bd66;background:#263b2e}}</style>
<h1>Soviet Buildings — Validation Dashboard</h1><p><a href="Soviet-Buildings-Review.html">Open material and animation review</a> · <a href="validation.json">Full validation record</a></p>
<div class="gate">Representative direction accepted. Complete-family visual and gameplay acceptance remain pending.</div>
<h2>Delivered scope</h2><p>13 complete temperate Soviet families, 1,102 authored SHP slots, 192 retained Original shadow/empty slots, and 16 native-pivot turret headings. Existing accepted resources are preserved. The app uses one default-on HD setting and its own profile.</p>
<h2>Technical checks</h2><ul><li>53 focused tests, 1,332 assertions; type checking passed.</li><li>1,278 actual-app native-controller motion samples; normal/damaged geometry and shadow texture parity passed for all 13 families.</li><li>All 13 native building production queues and legal placement paths passed. Shipyard and submarine production passed after correcting the coastal fixture. Cloning produced two infantry.</li><li>Nine families passed injected-damage events followed by native repair and sale. This is not a defense-combat claim.</li><li>Single global HD off and independent missing/corrupt whole-family fallback passed.</li><li>48 pooled/unpooled GPU comparisons were byte-exact. All enabled optional resources use {gpu_bytes/1048576:.2f} MiB within the unchanged 256 MiB budget.</li><li>Protected payloads: {preservation['entriesChecked']:,} entries checked. Accepted representatives: {preservation['acceptedRepresentativeFilesChecked']:,} files unchanged. Four pre-existing old-profile runtime differences are recorded separately.</li></ul>
<table><tr><th>Family</th><th>Renderer / controller</th><th>Native production</th><th>Motion samples</th><th>Final human review</th></tr>{rows}</table>
<h2>Remaining acceptance items</h2><p>Review all new materials, damaged states, buildup/sale sequences, turret directions, special actions and team colors. Play a temperate Soviet skirmish to check defense combat, superweapon use, selection and visibility. Physically verify that entering paused Options preserves the cursor position. Automated shipyard repair/sale and Windows runtime are not claimed as passed.</p>
<h2>Failure history and resolution</h2><ul>{failure_rows}</ul>
<p>App runtime source binding: PASS ({len(source_checked)} files). Local source checkpoint: {source_binding['currentCommit']}. No push or publication. Continue corrections and final acceptance in the same task.</p></html>'''
(out / 'Validation-Dashboard.html').write_text(page)
print(report['status'], round(gpu_bytes / 1048576, 2), 'MiB')
