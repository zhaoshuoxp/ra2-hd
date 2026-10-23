"""Summarize bounded actual-match evidence without converting missing coverage to PASS."""
import json
from pathlib import Path

root = Path('.artifacts/m1-1/hd-gameplay-v1')
names = ['game-original', 'game-4x-red', 'game-4x-blue-v3', 'game-fallback-2x', 'game-4x-pages']
runs = {name: json.loads((root / name / 'result.json').read_text()) for name in names}
checks = []
for name, run in runs.items():
    assert run['status'] == 'PASS_BOUNDED_GAMEPLAY', name
    assert not run['errors'] and not run['external'], name
    assert run['geometry']['body'] == 301 and run['geometry']['shadows'] == 301, name
    assert run['disposal']['released'] and not run['disposal']['remainingGame'], name
    trace = run['trace']
    assert any(f['moving'] for f in trace) and any(f['firing'] for f in trace)
    assert any(f['frame'] >= 293 for f in trace)
    assert any(f['selected'] and f['selectionVisible'] for f in trace)
    assert all(f['glError'] == 0 and f['shadow'] for f in trace)
    checks.append({'case': name, 'density': run['initial']['selection']['density'],
                   'localConscriptCount': len(run['initial']['units']), 'traceSamples': len(trace),
                   'pages': run['geometry']['pages'], 'texturesReleased': run['disposal']['allocatedBefore']})
camera = runs['game-original']['initial']['camera']
assert all(r['initial']['camera'] == camera and r['initial']['rendererPixelRatio'] == 1 for r in runs.values())
assert runs['game-original']['initial']['selection']['density'] == 1
assert all(not u.get('identity') for u in runs['game-original']['initial']['units'])
for name in ['game-4x-red', 'game-4x-blue-v3']:
    assert runs[name]['geometry']['pages'] == [0, 1]
    assert all(u['material'] == 'HdSpriteMaterial' for u in runs[name]['initial']['units'])
fallback = runs['game-fallback-2x']['initial']['selection']
assert fallback['density'] == 2 and fallback['attempts'] == [{'density': 4, 'reason': 'missing-page'}]
red = runs['game-4x-red']
assert red['mouseSelection']['expected'] in red['mouseSelection']['selected']
occlusion = runs['game-4x-blue-v3']['occlusion']
assert any(p['unobstructedBodyPixels'] > p['visibleBodyPixels'] and p['unobstructedBodyPixels'] > 0 and p['glError'] == 0 for p in occlusion)
combat = red.get('combat', [])
page_trace = runs['game-4x-pages']['trace']
assert all(f['pageMatches'] for f in page_trace)
assert {f['page'] for f in page_trace} == {0, 1}
actions = {
    'prone_or_crawl': any(86 <= f['frame'] <= 133 for f in combat),
    'prone_fire': any(212 <= f['frame'] <= 259 for f in combat),
    'stance_transition': any(260 <= f['frame'] <= 291 for f in combat),
    'death': any(134 <= f['frame'] <= 163 for f in combat),
}
report = {'status': 'PASS_BOUNDED_MAC_GAMEPLAY', 'cases': checks, 'cameraUnchanged': True,
          'livePageBindings': [0, 1], 'originalShadowMapsChecked': 301,
          'occlusion': occlusion, 'combatActionsObserved': actions,
          'artAcceptance': 'USER_ACCEPTED_CURRENT_COMPLETE_CANDIDATE',
          'overallUserGameplayAcceptance': 'PENDING',
          'limitations': ['Chrome on this macOS host only; Windows and packaged applications not tested.',
                         'Original camera and renderer pixel ratio 1 retained; no Retina renderer claim.',
                         'Short scripted matches do not certify sustained HD match performance or all camera/lighting/occlusion combinations.',
                         'Paradrop and every facing/sequence combination were not exercised by the simulation.',
                         'All 301 body/shadow geometry pairs were checked using actual-match inputs outside the rendered scene.',
                         'Mouse selection evidence is browser automation, not physical-mouse acceptance.']}
(root / 'acceptance.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
