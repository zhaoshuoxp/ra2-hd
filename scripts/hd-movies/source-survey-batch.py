"""Prepare full-screen source surveys while retaining confirmed decode blockers explicitly."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--source-index', type=Path, required=True)
parser.add_argument('--blockers', type=Path, required=True)
args = parser.parse_args()
base = args.directory.resolve()
base.mkdir(parents=True, exist_ok=True)
movies = [row for row in json.loads((ROOT / 'docs/hd-movies-inventory-20261109.json').read_text())['movies'] if row['original']['video']['width'] > 140]
movies.sort(key=lambda row: (row['identity'] != 'ra2:s01_f00e', row['edition'], row['original']['video']['frames']))
blockers = {row['identity']: row for row in json.loads(args.blockers.read_text())['entries']}
ledger = dict(schema='hd-movie-source-survey-ledger-v1', status='RUNNING', total=len(movies), completed=[], current=None, sourceBlockers=[])

def save():
    temporary = base / 'survey-ledger.writing'
    temporary.write_text(json.dumps(ledger, indent=2) + '\n')
    temporary.replace(base / 'survey-ledger.json')

try:
    for movie in movies:
        identity = movie['identity']
        if identity in blockers:
            assert blockers[identity]['sourceSha256'] == movie['original']['sha256']
            ledger['sourceBlockers'].append(blockers[identity]); save()
            continue
        ledger['current'] = identity; save()
        name = identity.replace(':', '-')
        folder = base / 'surveys-v2' / name
        with (base / ('survey-' + name + '-v2.log')).open('a') as log:
            subprocess.run([sys.executable, str(Path(__file__).with_name('source-motion-survey.py')), identity,
                            '--source-index', str(args.source_index.resolve()), '--directory', str(folder)],
                           cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True)
        survey = json.loads((folder / 'survey.json').read_text())
        ledger['completed'].append(dict(identity=identity, shots=len(survey['shots']), survey=str((folder / 'survey.json').relative_to(ROOT))))
        save()
        print(json.dumps(dict(identity=identity, status='SOURCE_SURVEY_READY', completed=len(ledger['completed']), total=len(movies))), flush=True)
    ledger.update(status='QUALIFIED_SOURCE_SURVEYS_READY_WITH_DECODE_BLOCKERS' if ledger['sourceBlockers'] else 'SOURCE_SURVEYS_READY_CLASSIFICATION_PENDING', current=None)
except BaseException as error:
    ledger.update(status='STOPPED_FOR_INVESTIGATION', error=str(error))
    raise
finally:
    save()
