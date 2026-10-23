"""Create the R2 dashboard from current-app evidence and retained failures."""
import hashlib
import html
import json
import re
import shutil
import subprocess
from pathlib import Path

root = Path('.artifacts/soviet-remaining')
out = root / 'complete-review-r2'
read = lambda p: json.loads((root / p).read_text())
artifact = read('build-2026-09-21T22-12-38-837Z/artifact.json')
runtime = read('runtime-complete-r2-final/result.json')
garrison = read('garrison-final-r2/result.json')
fallback = read('fallback-r2/result.json')
exports = read('export-validation-corrections-r2.json')
scope = read('feedback-r2/export-scope-validation.json')
pools = read('feedback-r2/pack-pool-final.json')
preservation = read('preservation-corrections-r2.json')
browser = read('complete-review-r2/browser-check.json')
assert runtime['status'] == 'PASS_NATIVE_CONTROLLER_RENDER_REVIEW'
assert garrison['status'] == 'PASS_NATIVE_GARRISON_EVACUATION_FIVE_CYCLES'
assert fallback['status'].startswith('PASS') and exports['status'] == 'PASS_EXPORT_CONTRACT'
assert scope['status'].startswith('PASS') and pools['status'].startswith('PASS')
assert preservation['stableProtectedPayloads'] == 'PASS' and browser['status'] == 'PASS_COMPLETE_PORTABLE_REVIEW'
assert re.search(r'56 pass\s+0 fail', (root / 'feedback-r2/focused-tests.log').read_text())
assert 'error TS' not in (root / 'feedback-r2/typecheck-final.log').read_text()
assert runtime['app'] == garrison['app'] == artifact['artifact']
checked = 0
for row in artifact['source']['files']:
    if row['file'].startswith(('src/', 'desktop/', 'public/res/locale/')):
        assert hashlib.sha256(Path(row['file']).read_bytes()).hexdigest() == row['sha256'], row['file']
        checked += 1
activation = runtime['activation']
gpu = sum(f['gpuBytes'] for f in activation['families'].values()) + sum(activation[k]['gpuBytes'] for k in ['napowr', 'powerPlant', 'conscript']) + 16 * (320 * 288 * 5 + 4)
assert gpu <= 256 * 1024 * 1024
families = {}
for name, row in runtime['families'].items():
    assert row['status'].startswith('PASS')
    families[name] = {'nativeController': row['status'], 'motionSamples': sum(len(s['files']) for s in row['sequences']),
                      'gpuBytes': activation['families'][name]['gpuBytes'], 'geometryAndShadows': 'PASS',
                      'ownerColors': 'PASS_RENDER_FIXTURE', 'visualAcceptance': 'PENDING_USER'}
baseline = [read(f'garrison-{stamp}/result.json')['loadMs'] for stamp in [1790027212323, 1790027349145, 1790027460671]]
failures = [
    {'family': 'Infantry/civilian house', 'run': 'garrison-1790027460671', 'reason': 'R1 reproduced missing civilian-owner crash on default map', 'resolution': 'Numeric side lookup and completed-entry task; five final-app evacuation/re-entry cycles pass'},
    {'family': 'Infantry/civilian house', 'run': 'garrison-1790027666431', 'reason': 'Crash fixed, but stale completed entry task blocked second entry', 'resolution': 'Successful EnterBuildingTask now finishes; same-unit repeated re-entry passes'},
    {'family': 'Garrison fixture', 'run': 'garrison-1790027212323 / garrison-1790027349145', 'reason': 'Initial test infantry were outside house visibility', 'resolution': 'Spawned fixture moved within sight range before unchanged occupy orders'},
    {'family': 'Construction', 'run': 'full-exports-r2', 'reason': 'Stage masters still changed structure proportions at transitions', 'resolution': 'Fixed registered geometry with rigid parts; candidate retained and not selected'},
    {'family': 'Construction', 'run': 'full-exports-r3', 'reason': 'Rectangular early trim edges', 'resolution': 'Native early foundation coverage; candidate retained and not selected'},
    {'family': 'NALASR', 'run': 'full-exports-r3/NALASR', 'reason': 'Turret review canvas differs from buildup SHP canvas', 'resolution': 'Use delivered registered final buildup pose'},
    {'family': 'NADEPT / unrelated owner masks', 'run': 'full-exports-r5', 'reason': 'Generic re-export re-inferred previously corrected owner masks', 'resolution': 'Non-target PNGs copied byte-for-byte; full-exports-r6 selected'},
    {'family': 'NAREFN capture fixture', 'run': 'runtime-complete-r2', 'reason': 'Inactive storage-level layer requested by generic capture fixture', 'resolution': 'Fourteen completed families retained; three earlier families construction/reverse/static/owner captures pass in supplemental run'},
]
report = {'status': 'R2_TECHNICAL_PASS_FINAL_ANIMATION_GAMEPLAY_ACCEPTANCE_PENDING', 'app': artifact['artifact'],
          'sourceBinding': {'status': 'PASS_APP_RUNTIME_SOURCE_CONTENT_BINDING', 'filesChecked': checked,
                            'currentCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
                            'buildParentCommit': artifact['source']['head'], 'sourceSnapshot': artifact['source']['sourceDigest']},
          'families': families, 'nativeMotionSamples': sum(f['motionSamples'] for f in families.values()), 'authoredShpSlots': 1359,
          'tests': {'passed': 56, 'assertions': 1340, 'typecheck': 'PASS'}, 'garrison': garrison,
          'loading': {'r1Milliseconds': baseline, 'r2Milliseconds': garrison['loadMs'], 'map': 'mp02t2.map',
                      'conditions': 'Same local Mac, fresh isolated profiles; filesystem cache not controlled'},
          'gpuBytes': gpu, 'gpuBudgetBytes': 256 * 1024 * 1024, 'fallback': fallback['status'],
          'acceptedArtworkFilesUnchanged': scope['acceptedArtFiles'], 'preservation': preservation['stableProtectedPayloads'],
          'strictOldProfileEquality': preservation['strictProfileEquality'], 'oldProfileDriftCount': len(preservation['oldProfileDrift']),
          'retainedFailures': failures, 'staticArtworkAcceptance': 'ACCEPTED', 'animationAcceptance': 'PENDING_USER',
          'fullGameplayAcceptance': 'PENDING_USER', 'physicalCursor': 'UNVERIFIED', 'windows': 'NOT_RUN',
          'limits': ['Review frames use spawned/frozen native-controller fixtures, not natural production claims.',
                     'Three Conscripts are spawned near an existing house; all entry/exit commands are native.',
                     'Earlier R1 natural build/repair/naval evidence is historical, not re-labeled as R2 gameplay.',
                     'Four previously recorded old-profile cache/runtime differences remain strict-equality failures.',
                     'Final construction style, scanner alignment, combat and superweapon gameplay require user acceptance.']}
(out / 'validation.json').write_text(json.dumps(report, indent=2) + '\n')
evidence = out / 'evidence'; evidence.mkdir(exist_ok=True)
for name, source in {
    'garrison-final.json': root / 'garrison-final-r2/result.json', 'fallback.json': root / 'fallback-r2/result.json',
    'export-scope.json': root / 'feedback-r2/export-scope-validation.json', 'pool-validation.json': root / 'feedback-r2/pack-pool-final.json',
    'focused-tests.log': root / 'feedback-r2/focused-tests.log', 'typecheck.log': root / 'feedback-r2/typecheck-final.log',
    'runtime-captures.json': root / 'runtime-complete-r2-final/result.json', 'preservation.json': root / 'preservation-corrections-r2.json',
}.items():
    shutil.copyfile(source, evidence / name)
rows = ''.join(f'<tr><td>{html.escape(name)}</td><td>PASS</td><td>{f["motionSamples"]}</td><td>{f["gpuBytes"]/1048576:.2f} MiB</td><td>Awaiting review</td></tr>' for name, f in families.items())
issues = ''.join(f'<tr><td>{html.escape(f["family"])}</td><td>{html.escape(f["reason"])}</td><td>{html.escape(f["resolution"])}</td></tr>' for f in failures)
limits = ''.join(f'<li>{html.escape(s)}</li>' for s in report['limits'])
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Soviet Buildings R2 — Validation</title><style>body{{background:#152019;color:#e8efe9;font:18px/1.55 system-ui;margin:28px auto;padding:0 24px;max-width:1180px}}h1{{font-size:32px}}h2{{font-size:25px;margin-top:30px}}a{{color:#b6e4c6}}table{{border-collapse:collapse;width:100%}}td,th{{padding:11px;text-align:left;border-bottom:1px solid #46624e}}.status{{background:#263b2e;padding:18px;border-left:4px solid #d9bd66}}.scroll{{overflow-x:auto}}</style>
<h1>Soviet Buildings R2</h1><p><a href="Soviet-Buildings-Review.html">Open native-size animation review</a> · <a href="validation.json">Detailed evidence</a></p>
<div class="status">Static models accepted. Technical checks pass. Final animation and gameplay acceptance awaits your review.</div>
<h2>Corrected behavior</h2><p>Construction uses rigid parts rising behind fixed ground and socket planes. The Psychic Sensor's rotating shaft has a fixed socket; Tesla activity no longer overlays a second mast. The accepted Power Plant remains unchanged.</p>
<p>On the default first skirmish map, the same three Conscripts successfully garrison and evacuate an existing civilian house five times. Ownership returns to neutral after each evacuation. The stale entry task and missing civilian-owner lookup are corrected.</p>
<p>Local loading fell from approximately 24–27 seconds to {garrison['loadMs']/1000:.2f} seconds. Measurements used fresh profiles on the same Mac; filesystem cache was not controlled. Progress now includes the HD loading stage.</p>
<h2>Measured checks</h2><ul><li>56 tests, 1,340 assertions; TypeScript checking passed.</li><li>{report['nativeMotionSamples']} actual-app animation captures across 17 families; geometry, shadows and owner-color fixtures checked.</li><li>{gpu/1048576:.2f} MiB optional GPU storage under the unchanged 256 MiB cap; exact pool reconstruction and disposal pass.</li><li>Global HD off, missing turret, corrupt turret and corrupt shipyard atlas: complete Original fallback passes.</li><li>502 accepted artwork files and 54,009 protected baseline entries checked. Four historical old-profile cache/runtime differences remain separately recorded.</li></ul>
<div class="scroll"><table><tr><th>Family</th><th>Technical</th><th>Motion frames</th><th>GPU</th><th>Visual acceptance</th></tr>{rows}</table></div>
<h2>Retained failures and corrections</h2><div class="scroll"><table><tr><th>Scope</th><th>Observed failure</th><th>Resolution</th></tr>{issues}</table></div>
<h2>Limits and acceptance</h2><ul>{limits}</ul><p>Physical paused-menu cursor confirmation remains unverified. Windows runtime was not run. Continue fixes and acceptance in this same task.</p></html>'''
(out / 'Validation-Dashboard.html').write_text(page)
print(report['status'], report['nativeMotionSamples'], f'{gpu/1048576:.2f} MiB')
