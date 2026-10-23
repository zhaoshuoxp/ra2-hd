"""Correlate a validated early Windows profile with its recorded frame rows."""
import argparse
import json
import pathlib

parser = argparse.ArgumentParser()
parser.add_argument('run', type=pathlib.Path)
parser.add_argument('analysis', type=pathlib.Path)
parser.add_argument('output', type=pathlib.Path)
args = parser.parse_args()
load = lambda name: json.loads((args.run / name).read_text())
run, phases, status = load('run.json'), load('phases.json'), load('trace-status.json')
assert run['status'] == status['status'] == status['cpuProfile'] == 'CAPTURED'
assert status['requestedDuringStage'] == 'first-use'
assert all(p['instrumented'] and p['validity'] == 'VALID_BOUNDED_SAMPLE' for p in phases)
assert load('errors.json') == []
profile, trace = load('cpu.cpuprofile'), load('trace.json')['traceEvents']
nodes = {n['id']: n for n in profile['nodes']}
parents = {child: n['id'] for n in profile['nodes'] for child in n.get('children', [])}
clock, groups = profile['startTime'], []
for node, delta in zip(profile['samples'], profile['timeDeltas']):
    clock += delta
    if nodes[node]['callFrame']['functionName'] != 'getProgramInfoLog':
        continue
    if not groups or clock - groups[-1][-1][0] > 6000:
        groups.append([])
    groups[-1].append((clock, delta, node))
assert len(groups) == status['webglCalls']['methods']['getProgramInfoLog']['calls'] == 2
calls = [e for e in trace if e.get('name') == 'FunctionCall' and e.get('dur', 0) > 50000
    and e.get('args', {}).get('data', {}).get('functionName') == 'doFrame']
assert len(calls) == 1
call = calls[0]
assert all(call['ts'] <= g[0][0] <= g[-1][0] <= call['ts'] + call['dur'] for g in groups)
phase = phases[0]
# A RAF interval describes the time following the previous row's CPU work.
# Match the one long recorded callback by simulation+update+submission duration.
index, row = min(enumerate(phase['rows']), key=lambda item:
    abs(sum(item[1][i] for i in [2, 4, 5]) - call['dur'] / 1000))
error = abs(sum(row[i] for i in [2, 4, 5]) - call['dur'] / 1000)
assert error < 2 and row[5] > 50 and index + 1 < len(phase['rows'])
clusters = []
for group in groups:
    node, stack = group[0][2], []
    while node is not None:
        stack.append(nodes[node]['callFrame']); node = parents.get(node)
    clusters.append({'firstSampleMonotonicUs': group[0][0], 'lastSampleMonotonicUs': group[-1][0],
        'sampleWeightMs': sum(v[1] for v in group) / 1000, 'stack': stack})
analysis = json.loads(args.analysis.read_text())
assert analysis['diagnosticCommit'] == run['diagnosticCommit']
mapped = next(entry for entry in analysis['runs'] if entry['directory'] == args.run.name)
outside = [{'rowIndex': i, 'row': value, 'attribution': 'UNRESOLVED outside the matched callback'}
    for i, value in enumerate(phase['rows']) if i != index and value[5] > 50]
report = {'status': 'PASS_VALIDATED_WINDOWS_RESIDUAL_SHADER_WAIT_ATTRIBUTION',
    'diagnosticId': run['diagnosticId'], 'diagnosticCommit': run['diagnosticCommit'],
    'runDirectory': args.run.name, 'instrumented': True,
    'boundary': 'CPU waits and sample correlation; not GPU time or Normal A/B. Exact Windows material/family is unresolved.',
    'traceStatus': status, 'frame': {'rowIndex': index, 'columns': phase['columns'], 'row': row,
        'relativeToFirstGameFrameMs': row[0] - phase['firstGameFrameAt'],
        'followingIntervalMs': phase['rows'][index + 1][1], 'callback': call,
        'callbackDurationMatchErrorMs': error}, 'waitClusters': clusters,
    'getProgramInfoLogFractionOfSubmission': status['webglCalls']['methods']['getProgramInfoLog']['cpuMs'] / row[5],
    'mappedProfileTopSelf': mapped['profile']['topSelf'],
    'otherSubmissionStalls': outside,
    'largestInstrumentedInterval': {'intervalMs': max(value[1] for value in phase['rows'] if value[1] is not None),
        'boundary': 'Instrumented capture; excluded from Normal performance. Startup attribution is separate.'},
    'kitVerificationReceipt': 'MISSING; full return CRC/hash identity passes separately.',
    'errors': load('errors.json'), 'gpuTime': 'UNAVAILABLE', 'actualProcessVram': 'UNAVAILABLE'}
with args.output.open('x') as stream:
    json.dump(report, stream, indent=2); stream.write('\n')
print(json.dumps({'status': report['status'], 'submissionMs': row[5],
    'followingIntervalMs': report['frame']['followingIntervalMs'],
    'shaderWaitCpuMs': status['webglCalls']['methods']['getProgramInfoLog']['cpuMs']}))
