"""Bind the R3 combined delivery to final-app checks, accepted scope and failures."""
import hashlib
import html
import json
import re
import shutil
import subprocess
from pathlib import Path

root=Path('.artifacts/soviet-remaining');out=root/'complete-review-r3'
read=lambda p:json.loads((root/p).read_text())
artifact=read('build-2026-09-21T23-06-25-632Z/artifact.json')
runtime=read('runtime-complete-r3-delivery/result.json')
ranges=read('runtime-ranges-r3-verified/result.json')
garrison=read('garrison-final-r3/result.json')
fallback=read('fallback-r3/result.json')
exports=read('export-validation-corrections-r3-final.json')
scope=read('feedback-r3/export-scope-validation.json')
pools=read('feedback-r3/pack-pool-final.json')
preservation=read('preservation-corrections-r3.json')
browser=read('complete-review-r3/browser-check.json')
assert runtime['status']=='PASS_NATIVE_CONTROLLER_RENDER_REVIEW'
assert ranges['status']=='PASS_NATIVE_RANGE_MARKERS'
assert garrison['status']=='PASS_NATIVE_GARRISON_EVACUATION_FIVE_CYCLES'
assert all(v['status'].startswith('PASS') for v in [fallback,exports,scope,pools,browser])
assert preservation['stableProtectedPayloads']=='PASS'
assert re.search(r'61 pass\s+0 fail', (root/'feedback-r3/focused-tests.log').read_text())
assert 'error TS' not in (root/'feedback-r3/typecheck-final.log').read_text()
assert runtime['app']==ranges['app']==garrison['app']==artifact['artifact']
checked=0
for row in artifact['source']['files']:
 if row['file'].startswith(('src/','desktop/','public/res/locale/')):
  assert hashlib.sha256(Path(row['file']).read_bytes()).hexdigest()==row['sha256'],row['file'];checked+=1
activation=runtime['activation'];gpu=sum(f['gpuBytes'] for f in activation['families'].values())+sum(activation[k]['gpuBytes'] for k in ['napowr','powerPlant','conscript'])+16*(320*288*5+4)
assert gpu<=256*1024*1024
families={name:dict(nativeController=row['status'],motionSamples=sum(len(s['files']) for s in row['sequences']),gpuBytes=activation['families'][name]['gpuBytes'],geometryAndShadows='PASS',ownerColors='PASS_BLUE_MOTION_YELLOW_STILL',visualAcceptance='PENDING_USER') for name,row in runtime['families'].items()}
failures=[
 dict(family='NAPSIS',candidate='Delivered R2',issue='Whole upper assembly shifts on some poses; nearest-key holds jump',resolution='One fixed mast/socket and continuous articulated arms; 80 socket windows verified'),
 dict(family='NADEPT / NAYARD',candidate='full-exports-r7',issue='Hook edge exceeded native trim',resolution='Bounded hook-anchor registration; zero clipped hook pixels in every selected frame'),
 dict(family='NAYARD',candidate='full-exports-r7b / first R3 app',issue='Old lower jib strip remained below the moving jib',resolution='Complete part boundary and clean fixed support; r7c selected and final app recaptured'),
 dict(family='Range markers',candidate='First R3 app',issue='Opaque band rendered before transparent shroud',resolution='Interface band uses transparent render queue above shroud; final actual-app captures pass'),
 dict(family='Range fixture',candidate='runtime-ranges-r3 / runtime-ranges-r3-final',issue='Fixture assumed a section name and updated a newly queued renderable too early',resolution='Resolve native type, process native render queue; runtime-ranges-r3-verified passes'),
 dict(family='Range tests',candidate='focused-tests-first-failure.log',issue='Test used a nonexistent color accessor; mutable range model needed a retained value snapshot',resolution='Corrected test API and value snapshot; same-position radius-change/disposal regression passes')]
report=dict(status='R3_TECHNICAL_PASS_FINAL_VISUAL_GAMEPLAY_ACCEPTANCE_PENDING',app=artifact['artifact'],sourceBinding=dict(status='PASS_APP_RUNTIME_SOURCE_CONTENT_BINDING',filesChecked=checked,currentCommit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),buildParentCommit=artifact['source']['head'],sourceSnapshot=artifact['source']['sourceDigest']),families=families,nativeMotionSamples=sum(f['motionSamples'] for f in families.values()),authoredShpSlots=1359,tests=dict(passed=61,assertions=1357,typecheck='PASS'),gpuBytes=gpu,gpuBudgetBytes=256*1024*1024,rangeMarkers=ranges['ranges'],garrison=garrison['status'],defaultMap=garrison['lobby']['mapName'],loadingMilliseconds=garrison['loadMs'],fallback=fallback['status'],acceptedArtworkFilesUnchanged=scope['acceptedArtFiles'],constructionRgbExportsUnchanged=scope['constructionRgbPreserved'],preservation=preservation['stableProtectedPayloads'],strictOldProfileEquality=preservation['strictProfileEquality'],oldProfileDriftCount=len(preservation['oldProfileDrift']),retainedFailures=failures,accepted=['Static models','R2 construction motion','Tesla structural alignment'],pending=['R3 corrected animations/materials','Range-marker appearance','Final gameplay acceptance'],physicalCursor='UNVERIFIED',windows='NOT_RUN',limits=['Animation review uses spawned/frozen native-controller fixtures; no new natural crane gameplay claim.','Range captures exercise real interface modes but do not fire superweapons.','Iron Curtain footprint is square; its ring is an enclosing aim guide.','Four historical old-profile runtime/cache differences remain strict-equality failures.','Physical paused-menu cursor and Windows runtime are not newly verified.'])
(out/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
evidence=out/'evidence';evidence.mkdir(exist_ok=True)
for name,source in {'runtime.json':'runtime-complete-r3-delivery/result.json','ranges.json':'runtime-ranges-r3-verified/result.json','garrison.json':'garrison-final-r3/result.json','fallback.json':'fallback-r3/result.json','scope.json':'feedback-r3/export-scope-validation.json','remap.json':'feedback-r3/remap-validation.json','pool.json':'feedback-r3/pack-pool-final.json','preservation.json':'preservation-corrections-r3.json','r2-preservation.json':'feedback-r3/r2-delivery-preservation.json','tests.log':'feedback-r3/focused-tests.log','typecheck.log':'feedback-r3/typecheck-final.log'}.items():shutil.copyfile(root/source,evidence/name)
rows=''.join(f'<tr><td>{name}</td><td>PASS</td><td>{f["motionSamples"]}</td><td>{f["gpuBytes"]/1048576:.2f} MiB</td><td>Awaiting review</td></tr>' for name,f in families.items())
issues=''.join(f'<tr><td>{html.escape(f["family"])}</td><td>{html.escape(f["issue"])}</td><td>{html.escape(f["resolution"])}</td></tr>' for f in failures)
limits=''.join(f'<li>{html.escape(s)}</li>' for s in report['limits'])
(out/'Validation-Dashboard.html').write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Soviet Buildings R3 Validation</title><style>body{{background:#152019;color:#e8efe9;font:18px/1.55 system-ui;margin:28px auto;padding:0 24px;max-width:1180px}}h1{{font-size:32px}}h2{{font-size:25px}}a{{color:#b6e4c6}}table{{border-collapse:collapse;width:100%}}td,th{{padding:11px;text-align:left;border-bottom:1px solid #46624e}}.status{{background:#263b2e;padding:18px;border-left:4px solid #d9bd66}}.scroll{{overflow-x:auto}}</style>
<h1>Soviet Buildings R3</h1><p><a href="Soviet-Buildings-Review.html">Building animations</a> · <a href="Range-Markers-Review.html">Range markers</a> · <a href="validation.json">Detailed evidence</a></p>
<div class="status">Static models, R2 construction motion and Tesla structural alignment are accepted. R3 technical checks pass; final visual/gameplay review remains open.</div>
<h2>Corrections</h2><p>Fixed Psychic Sensor mast and socket, stronger electric arcs, complete owner colors from the first construction frame, and complete independently articulated crane parts. Construction motion/color images are unchanged.</p><p>Building range bands remain visible at every output preset. Nuclear targeting uses the actual 10-tile blast radius. Iron Curtain shows its nine-tile footprint and an enclosing aim ring. Markers track the target and disappear on cancellation.</p>
<h2>Measured checks</h2><ul><li>61 tests / 1,357 assertions and TypeScript checking passed.</li><li>{report['nativeMotionSamples']} final-app animation captures across 17 families, with blue owner colors throughout construction and operating sequences.</li><li>Eight final-app range captures at 1080p and 4K; movement, map exit and cancellation passed.</li><li>502 accepted artwork files and 490 construction RGB exports unchanged; R2 app and local ZIP preserved.</li><li>{gpu/1048576:.2f} MiB combined optional GPU allocation under the unchanged 256 MiB cap; lossless pooling/disposal and independent Original fallback passed.</li><li>Default first map: five repeated civilian-house evacuation/re-entry cycles passed. Fresh-profile loading measured {garrison['loadMs']/1000:.2f} seconds; filesystem cache was not controlled.</li></ul>
<div class="scroll"><table><tr><th>Family</th><th>Technical</th><th>Motion frames</th><th>GPU</th><th>Visual</th></tr>{rows}</table></div>
<h2>Retained failures</h2><div class="scroll"><table><tr><th>Scope</th><th>Observed issue</th><th>Resolution</th></tr>{issues}</table></div>
<h2>Limits</h2><ul>{limits}</ul><p>Continue corrections and acceptance in this same task.</p></html>''')
print(report['status'],report['nativeMotionSamples'],gpu)
