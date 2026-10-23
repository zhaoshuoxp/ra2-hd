"""Consolidate immutable primary and failed-case follow-up reports without rewriting them."""
import hashlib
import json
from pathlib import Path

ROOT = Path('.artifacts/yuri-buildings')
PRIMARY = [('native-temperate-2x-v2', False, 2), ('native-temperate-4x-v1', False, 4),
           ('native-snow-2x-v1', True, 2), ('native-snow-4x-v2', True, 4)]
SUPPLEMENTAL = ['native-temperate-4x-followup-v1', 'native-snow-4x-v1', 'native-sensor-focused-v2',
                'native-damaged-actions-v1', 'native-destruction-v3']
CATALOG = json.loads(Path('desktop/yuri-building-coverage.json').read_text())
expected = {v['family'] for v in CATALOG.values()}
reports, runs, failures, passed = {}, [], [], {}
for name in [p[0] for p in PRIMARY] + SUPPLEMENTAL + ['native-lifecycle-v2', 'native-ra2-isolation-v1']:
    file = ROOT / name / 'report.json'
    report = json.loads(file.read_text())
    assert not report['errors'], (name, report['errors'])
    reports[name] = report
    for case, result in report.get('cases', {}).items():
        if result['status'] == 'PASS':
            passed.setdefault(case, []).append(name)
        else:
            failures.append({'report': name, 'case': case, 'failure': result['failure'],
                             'resolvedBy': []})
for name, snow, density in PRIMARY:
    r = reports[name]
    assert r['snow'] is snow and r['options']['selected'] == density
    assert set(r['families']) == expected and not r['options']['trainer']
    for family in expected:
        result = r['cases'][family + '-binding']
        assert result['status'] == 'PASS' and result['result']['allocation']['density'] == density
        color = result['result']['color']
        assert color['g'] > color['r']
    allocation = r['worldAllocation']
    assert allocation['total'] <= allocation['limit']
    runs.append({'report': name + '/report.json', 'sha256': hashlib.sha256((ROOT / name / 'report.json').read_bytes()).hexdigest(),
                 'theater': 'SNOW' if snow else 'TEMPERATE', 'density': density, 'actualFamilies': sorted(expected),
                 'ownerColor': r['families']['YAPOWR']['color'], 'worldAllocation': allocation,
                 'bindingStatus': 'PASS_REQUESTED_DENSITY', 'originalSessionStatus': r['status'],
                 'finalStatus': 'PASS_INCREMENTAL_CASES', 'profile': name + '/profile'})
for failure in failures:
    failure['resolvedBy'] = passed.get(failure['case'], [])
    assert failure['resolvedBy'], failure
required = ['Construction-Yard-native-production', 'Bio-Reactor-occupy-evacuate', 'Tank-Bunker-occupy-evacuate',
            'Grinder-native-intake-animation', 'Psychic-Tower-native-control', 'Gatling-native-stages',
            'Gatling-native-air-rotation', 'Psychic-Sensor-native-detection', 'Barracks-Cloning-native-production',
            'War-Factory-ground-air-production', 'Slave-Miner-production-deployment', 'Shipyard-native-production-repair',
            'YAGNTC-native-charge-fire-close', 'YAPPET-native-charge-fire-close', 'native-capture-owner-change',
            'Battle-Lab-shield-power-restoration', 'mixed-accepted-peer-residency', 'output-resolution-logical-geometry']
for case in required + [f + suffix for f in expected for suffix in ['-construction-damage-selling', '-native-destruction']]:
    assert case in passed, case
for name in ['native-lifecycle-v2', 'native-ra2-isolation-v1', 'native-damaged-actions-v1', 'native-destruction-v3']:
    assert reports[name]['status'] == 'PASS_SELECTED_NATIVE_CASES', name
result = {'status': 'PASS_INCREMENTAL_NATIVE_BATCH', 'finalVisualAcceptance': 'PENDING',
          'families': sorted(expected), 'primaryRuns': runs, 'passedCases': passed, 'preservedFailedCases': failures,
          'lifecycle': 'native-lifecycle-v2/report.json', 'ra2Isolation': 'native-ra2-isolation-v1/report.json',
          'damagedActions': 'native-damaged-actions-v1/report.json', 'destruction': 'native-destruction-v3/report.json',
          'mapFinalApp': '../map-selection-layout/final-c-app-v1/report.json',
          'disclosures': ['Controlled legal fixtures, trainer off; native actions after setup; one-time charge presets disclosed.',
                          'The directory native-snow-4x-v1 is actually a supplemental TEMPERATE run (snow=false); never counted as snow coverage.',
                          'Earlier failed reports remain immutable. BOOM/queue and TNKD/shore/shroud assumptions were fixture errors; successful native follow-ups resolve their cases.',
                          '2X grouped fixtures release completed groups through controlled cleanup; live accepted peers retain HD. These runs are not hardware pressure certification.',
                          'Whole-family 4X map failure explicitly falls back to complete 2X while preserving independent 4X and accepted unit peers.',
                          'Original shared death effects are reused; no newly declared Yuri destruction SHP was omitted.',
                          'Final visual acceptance, Windows and exhaustive physical-panel/input coverage remain separate.']}
file = ROOT / 'consolidated-native-v1.json'
file.write_text(json.dumps(result, indent=2) + '\n')
print(result['status'], len(expected), len(passed), 'passed case names')
