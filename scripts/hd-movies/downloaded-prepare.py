"""Carve the 51 audited downloaded full-screen sources without running installers."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def prepare(work):
    inventory = json.loads((ROOT / 'docs/hd-movies-inventory-20261109.json').read_text())
    originals = {movie['identity']: movie for movie in inventory['movies']}
    source_dir = work / 'sources'
    source_dir.mkdir(parents=True, exist_ok=True)
    result = {'schema': 'downloaded-movie-sources-v1', 'archives': [], 'movies': [],
              'scope': 'User-selected downloaded full-screen sources; no installer execution or image restoration.'}
    for edition in ['ra2', 'yr']:
        index = json.loads((ROOT / f'.artifacts/hd-movies/community/{edition}-index.json').read_text())
        for archived in index['archives']:
            file = work / 'extracted' / edition / 'app' / Path(archived['file']).name
            assert file.stat().st_size == archived['bytes'] and sha(file) == archived['sha256'], file
            result['archives'].append(dict(file=str(file.relative_to(ROOT)), bytes=file.stat().st_size,
                                           sha256=archived['sha256'], sourceIndex=archived['file']))
        selected = {}
        for movie in index['movies']:
            if movie.get('width') != 1440 or movie.get('height') != 1080 or movie.get('fps') != 60:
                continue
            assert movie['identity'] not in selected
            selected[movie['identity']] = movie
        for identity, movie in sorted(selected.items()):
            original = originals[identity]
            assert original['role'] != 'transmission'
            source = work / 'extracted' / edition / 'app' / Path(movie['archive']).name
            target = source_dir / (identity.replace(':', '-') + '.bik')
            if not target.exists():
                with source.open('rb') as incoming, target.open('xb') as outgoing:
                    incoming.seek(movie['offset'])
                    remaining = movie['bytes']
                    while remaining:
                        chunk = incoming.read(min(8 * 1024 * 1024, remaining))
                        assert chunk
                        outgoing.write(chunk)
                        remaining -= len(chunk)
            assert target.stat().st_size == movie['bytes']
            frames = original['original']['video']['frames']
            result['movies'].append(dict(
                identity=identity, file=str(target.relative_to(ROOT)), bytes=target.stat().st_size,
                sha256=sha(target), downloaded=movie, original=original,
                reference=str((ROOT / '.local/media/hd-movies/local-natural-r5' /
                               (identity.replace(':', '-') + '.mp4')).relative_to(ROOT)),
                originalFrames=frames, targetFramesAt60=frames * 4,
                downloadedDurationSeconds=movie['seconds'],
                originalDurationSeconds=original['original']['video']['durationSeconds']))
            print(identity, movie['frames'], 'downloaded frames', flush=True)
    assert len(result['movies']) == 51
    result['counts'] = {'ra2': 32, 'yr': 19, 'downloadedFullscreen': 51, 'retainedHdRadar': 83,
                        'retainedMissingLibrary': []}
    # Resolve the library exceptions by their actual inventory members.
    result['counts']['retainedMissingLibrary'] = [
        movie['identity'] for movie in inventory['movies']
        if movie['original']['member'] in ['emprtrlr.bik', 'renegade.bik']]
    (work / 'sources.json').write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('work', type=Path)
    prepare(parser.parse_args().work.resolve())
