"""Build a self-contained previous/repaired HD review from final movie masters."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess
from fractions import Fraction

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ledger', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
ledger = json.loads(args.ledger.read_text())
rows = {r['identity']: r for r in ledger['completed']}
parent = ROOT/'.local/media/hd-movies/local-natural-r5/manifest.json'
old = {e['edition']+':'+e['id']: e for e in json.loads(parent.read_text())['entries']}
ffmpeg = str(ROOT/'.local/tooling/campaign-media/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1')
work = args.output.parent/'motion-review-media'
work.mkdir(parents=True, exist_ok=True)


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def embed(path, mime):
    return f'data:{mime};base64,'+base64.b64encode(path.read_bytes()).decode()


samples = [
    ('yr:a00_f00e', 'YR introduction: approved camera pan', 80, 31, 89),
    ('yr:a00_f00e', 'YR introduction: foreground hair and screens', 275, 45, 290),
    ('yr:a00_f00e', 'YR introduction: final live-action view', 3270, 45, 3288),
    ('ra2:s01_f00e', 'RA2 Soviet 01: face, sleeve and movement', 510, 45, 535),
    ('ra2:a05_f00e', 'RA2 Allied 05: French feed and graphics', 116, 45, 124),
    ('ra2:a13_f02e', 'RA2 ending: face and shoulder strap', 260, 60, 299),
    ('yr:s08_f00e', 'YR Soviet ending: head and cockpit', 1005, 36, 1035),
    ('yr:a01_f00e', 'YR Allied 01: actor and practical objects', 1180, 45, 1199),
    ('yr:archive-2e440187', 'YR archive trailer: moving gameplay', 302, 16, 308),
    ('yr:archive-2e440187', 'YR archive trailer: product ending', 658, 31, 686),
    ('ra2:s03_p01e', 'RA2 radar communication: retained HD', 0, 30, 15),
    ('yr:s03_p01e', 'YR radar communication: retained HD', 0, 30, 15),
]
data, pins = [], []
for index, (identity, title, first, count, still) in enumerate(samples):
    row, entry = rows[identity], old[identity]
    sources = {'before': parent.parent/entry['file']['path'], 'after': ROOT/row['file']}
    record = {'identity': identity, 'title': title, 'first': first, 'frames': count, 'still': still,
              'width': entry['video']['width'], 'height': entry['video']['height'],
              'changed': identity in ledger['changed']}
    evidence = dict(identity=identity, first=first, frames=count, still=still, masters={}, exports={})
    for kind, source in sources.items():
        digest = sha(source)
        assert digest == (entry['file']['sha256'] if kind == 'before' else row['sha256'])
        clip = work/f'{index:02}-{kind}-{digest[:10]}-cfr.mp4'
        image = work/f'{index:02}-{kind}-{digest[:10]}.png'
        if not clip.exists():
            origin = max(0, first//15-1)
            raw = subprocess.check_output([ffmpeg, '-nostdin', '-v', 'error', '-ss', str(origin),
                '-i', str(source), '-vf', f'trim=start_frame={first-origin*15}:end_frame={first+count-origin*15}',
                '-an', '-pix_fmt', 'rgb24', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'])
            assert len(raw) == count*record['width']*record['height']*3
            subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                '-s', f"{record['width']}x{record['height']}", '-framerate', '15', '-i', 'pipe:0', '-an',
                '-vf', (f"scale={record['width']}:{record['height']}:out_color_matrix=bt601:out_range=tv,"
                    'setparams=range=limited:color_primaries=smpte170m:color_trc=bt709:colorspace=smpte170m'),
                '-c:v', 'libx264', '-threads', '4', '-preset', 'fast', '-crf', '14', '-bf', '0',
                '-pix_fmt', 'yuv420p', '-colorspace', 'smpte170m', '-color_primaries', 'smpte170m',
                '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', str(clip)], input=raw, check=True)
        clock = subprocess.check_output([ffmpeg, '-v', 'error', '-i', str(clip), '-map', '0:v:0',
            '-c:v', 'copy', '-f', 'framehash', '-'], text=True)
        timebase = Fraction(next(line.split(': ', 1)[1] for line in clock.splitlines() if line.startswith('#tb 0:')))
        packets = [line.split(',') for line in clock.splitlines() if line and not line.startswith('#')]
        assert len(packets) == count and [int(p[2])*timebase for p in packets] == [Fraction(n, 15) for n in range(count)]
        if not image.exists():
            subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(source), '-vf',
                f'select=eq(n\\,{still})', '-frames:v', '1', str(image)], check=True)
        record[kind] = embed(clip, 'video/mp4')
        record[kind+'Still'] = embed(image, 'image/png')
        evidence['masters'][kind] = dict(file=str(source.relative_to(ROOT)), sha256=digest)
        evidence['exports'][kind] = dict(videoSha256=sha(clip), stillSha256=sha(image))
    audio = work/f'{index:02}-common-audio.m4a'
    if not audio.exists():
        subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(sources['before']), '-vn',
            '-af', f'atrim=start={first/15}:end={(first+count)/15},asetpts=PTS-STARTPTS',
            '-c:a', 'aac', '-b:a', '192k', str(audio)], check=True)
    record['audio'] = embed(audio, 'audio/mp4')
    data.append(record)
    pins.append(evidence)
    print(json.dumps({'sample': index+1, 'identity': identity}), flush=True)
coverage = [{'identity': identity, 'action': 'Selective motion repair' if identity in ledger['changed'] else 'Retain verified HD'}
            for identity in sorted(rows)]
markup = Path(__file__).with_name('motion-review.html').read_text()
markup = markup.replace('__MOVIE_DATA__', json.dumps(data, separators=(',', ':'))).replace('__COVERAGE_DATA__', json.dumps(coverage))
args.output.write_text(markup)
args.output.with_suffix('.json').write_text(json.dumps({'schema': 'hd-movie-motion-review-v1',
    'status': 'SELF_CONTAINED_MATCHED_REVIEW_BUILT_NATIVE_VALIDATION_PENDING', 'revision': ledger['revision'],
    'pageSha256': sha(args.output), 'changed': len(ledger['changed']), 'retained': len(ledger['retained']),
    'samples': pins, 'scope': 'Matched 15 fps excerpts are re-encoded for review. Still PNGs decode directly from each full delivered master at original HD dimensions. Common excerpt audio derives from R5; complete delivery audio remains exact packet copies. User complete-film acceptance remains separate.'}, indent=2)+'\n')
print(json.dumps({'status': 'MATCHED_MOTION_REVIEW_BUILT', 'samples': len(data), 'bytes': args.output.stat().st_size}))
