"""Summarize matched copied-app observations without hiding budget fallback."""
import hashlib
import json
from pathlib import Path

base = Path('.artifacts/m2-2')
observations = []
for role, revision in [('baseline', 'v1'), ('complete', 'v4')]:
    for density in [2, 4]:
        file = base / f'perf-{role}-{density}x-{revision}/report.json'
        report = json.loads(file.read_text())
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES'
        allocation = report['terrainWorldAllocation']
        assert allocation['totalCharged'] <= allocation['limit']
        assert report['prepared']['cache']['peakBytes'] <= 128 * 1024 * 1024
        memory = [dict(label=row['label'],
            residentKiB=sum(process['memory']['workingSetSize'] for process in row['processes']),
            sumReportedProcessPeaksKiB=sum(process['memory']['peakWorkingSetSize'] for process in row['processes']))
            for row in report['processMemory']]
        fallback = {name: family for name, family in report['allocations']['families'].items()
                    if family['status'] == 'BUDGET_FALLBACK'}
        observations.append(dict(role=role, density=density, source=str(file),
            sourceSha256=hashlib.sha256(file.read_bytes()).hexdigest(), selectedMap=report['selectedMap'],
            machine=report['machine'], graphics=report['graphics'], scene=report['scene'],
            loadToFixtureMs=report['loadToFixtureMs'], mapEntryToFixtureMs=report['mapEntryToFixtureMs'],
            frames={name: {key: report[name][key] for key in
                ['samples', 'mean', 'p50', 'p95', 'p99', 'max', 'stalls50', 'render', 'targets']}
                for name in ['mixedFrames', 'firstEncounterFrames', 'sustainedPanFrames']},
            worldAllocation=allocation, preparedCache=report['prepared']['cache'],
            processMemory=memory, maxObservedResidentKiB=max(row['residentKiB'] for row in memory),
            maxObservedSumReportedProcessPeaksKiB=max(row['sumReportedProcessPeaksKiB'] for row in memory),
            fixedBudgetFallback=fallback,
            actualMixedActors=report['stages'][0]['samples']))
for density in [2, 4]:
    pair = [row for row in observations if row['density'] == density]
    assert pair[0]['machine'] == pair[1]['machine']
    assert pair[0]['graphics'] == pair[1]['graphics']
    assert pair[0]['selectedMap'] == pair[1]['selectedMap']
    for frame in ['mixedFrames', 'firstEncounterFrames', 'sustainedPanFrames']:
        assert pair[0]['frames'][frame]['targets'] == pair[1]['frames'][frame]['targets']
result = dict(schema='m2-2-matched-performance-v1',
    status='PASS_MATCHED_OBSERVATIONS_RESIDENCY_LIMITATION_DISCLOSED', observations=observations,
    steadyPanning='Final 2X/4X mean is approximately 16.67 ms, matching the baseline; no >50 ms interval in the three 8-second measurement segments.',
    introducedRegression='Earlier unbatched candidate had sustained means 29.32/29.21 ms. Native single-page sprite batching resolves this measured submission regression.',
    loading='Complete-map map entry is 6.887/11.123 seconds versus 4.418/5.318 seconds at 2X/4X. Added resource validation/decode/residency has a real loading cost.',
    residency='Under the unchanged 256 MiB 2X world cap, the six-actor mixed fixture falls back atomically for E1 and INIT. Accepted exports are unchanged; existing admission reports combined-budget. 4X selects both HD.',
    boundary='One short observation per density on the same 60 Hz Mac host, with no concurrent build/compression. RAF intervals are display-paced, not a CPU/GPU frame benchmark or Windows FPS result. Process metrics use KiB; sums of per-process reported peaks are not simultaneous aggregate peak residency. No universal battle-size or instant-first-use guarantee.')
Path('docs/m2-2-performance.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key != 'observations'}))
