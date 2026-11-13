"""Run the final current-main native movie scenarios sequentially in isolated profiles."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', type=Path, required=True)
args = parser.parse_args()
directory = args.directory.resolve(); directory.mkdir(parents=True, exist_ok=True)
node = shutil.which('node')
assert node
assert (ROOT / '.local/hd-movie-selection.json').exists()
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
selection_sha = sha(ROOT / '.local/hd-movie-selection.json')
app_files = json.loads((ROOT / 'desktop/app-files.json').read_text())
runtime_files = [ROOT / p for p in app_files if p.endswith(('.js', '.css'))]
runtime_files += [p for p in (ROOT / 'desktop').iterdir() if p.suffix in ['.mjs', '.cjs', '.json']]
runtime_sha = hashlib.sha256(json.dumps([(str(p.relative_to(ROOT)), sha(p)) for p in sorted(runtime_files)]).encode()).hexdigest()
cases = [
    ('library', 'scripts/hd-movies/native-library.mjs', []),
    ('options', 'scripts/hd-movies/native-options.mjs', []),
    ('ra2', 'scripts/hd-movies/native-playback.mjs', ['--hd', '--ra2', '--density=0']),
    ('yr', 'scripts/hd-movies/native-playback.mjs', ['--hd', '--density=4']),
    ('ending', 'scripts/campaign-completion/native-ending-flow-v53.mjs', ['--hd']),
    ('finale', 'scripts/hd-movies/native-finale.mjs', []),
    ('library-ui', 'scripts/hd-movies/native-library-ui.mjs', []),
]
state = dict(schema='hd-movie-native-final-suite-v1', status='RUNNING', cases=[], total=len(cases),
             windows='NOT_RUN_ON_THIS_MAC', isolatedProfiles=True, selectionSha256=selection_sha, runtimeSha256=runtime_sha)
if (directory / 'state.json').exists():
    prior = json.loads((directory / 'state.json').read_text())
    assert prior['selectionSha256'] == selection_sha and prior['runtimeSha256'] == runtime_sha, 'Use a fresh suite directory for a changed runtime or selection'
    state['cases'] = prior['cases']


def save(**values):
    state.update(values, updatedUtc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
    file = directory / 'state.json'; temporary = file.with_suffix('.json.writing')
    temporary.write_text(json.dumps(state, indent=2) + '\n'); temporary.replace(file)


try:
    for name, script, extra in cases:
        previous = next((r for r in state['cases'] if r['name'] == name), None)
        if previous:
            assert sha(ROOT / previous['report']) == previous['sha256'] and sha(ROOT / script) == previous['scriptSha256']
            continue
        save(current=name)
        output = directory / name; attempt = 1
        while output.exists():
            attempt += 1; output = directory / (name + '-attempt' + str(attempt))
        with (directory / (name + '.log')).open('a') as log:
            subprocess.run([node, str(ROOT / script), str(output), *extra], cwd=ROOT,
                           stdout=log, stderr=subprocess.STDOUT, check=True)
        file = output / 'report.json'; report = json.loads(file.read_text())
        assert report['status'].startswith('PASS_'), name + ':' + str(report.get('error'))
        state['cases'].append(dict(name=name, status=report['status'], report=str(file.relative_to(ROOT)),
                                  sha256=sha(file), scriptSha256=sha(ROOT / script)))
        save()
    save(status='PASS_ALL_CURRENT_MAIN_NATIVE_MOVIE_SCENARIOS', current=None)
except BaseException as error:
    save(status='STOPPED_FOR_INVESTIGATION', error=str(error)); raise
