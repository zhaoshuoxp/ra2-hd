"""Build a self-contained source/final movie review with actual campaign captures."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess
from fractions import Fraction
from production_source import video_input

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ledger', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--ra2-native', type=Path, required=True)
parser.add_argument('--yr-native', type=Path, required=True)
parser.add_argument('--ending-native', type=Path)
parser.add_argument('--options-native', type=Path)
args = parser.parse_args()
for key in ['ledger', 'output', 'ra2_native', 'yr_native', 'ending_native', 'options_native']:
    if getattr(args, key) is not None:
        setattr(args, key, getattr(args, key).resolve())
args.output.parent.mkdir(parents=True, exist_ok=True)
work = args.output.parent / 'final-review-media'
work.mkdir(exist_ok=True)
ledger = {r['identity']: r for r in json.loads(args.ledger.read_text())['completed']}
inventory = {r['identity']: r for r in json.loads((ROOT / 'docs/hd-movies-inventory-20261109.json').read_text())['movies']}
members = {r['identity']: r for r in json.loads((ROOT / '.artifacts/hd-movies/production/source-index.json').read_text())['sources']}
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
    'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def embed(file, mime):
    return 'data:' + mime + ';base64,' + base64.b64encode(file.read_bytes()).decode()


samples = [
    ('ra2:s01_f00e', 'RA2 live action: accepted sample interval', 1425, 30, 'fullscreen'),
    ('ra2:a00_f00e', 'RA2 CGI and motion: accepted sample interval', 2475, 30, 'fullscreen'),
    ('yr:a00_f00e', 'YR introduction: accepted sample interval', 2025, 30, 'fullscreen'),
    ('ra2:s03_p01e', 'RA2 radar communication', 0, 30, 'radar'),
    ('yr:s03_p01e', 'YR radar communication', 0, 30, 'radar'),
    ('yr:a00_f00e', 'Source-sensitive face and red lighting', 714, 45, 'fullscreen'),
    ('ra2:a05_f00e', 'Source-sensitive CRT diagrams', 1014, 45, 'fullscreen'),
    ('ra2:a13_f00e', 'Original dissolve and clean sky', 315, 30, 'fullscreen'),
    ('ra2:s10_f00e', 'Soviet 10 localized source recovery', 256, 75, 'fullscreen'),
]
rows, records = [], []
for index, (identity, title, first, frames, placement) in enumerate(samples, 1):
    row, movie, member = ledger[identity], inventory[identity], members[identity]
    receipt = json.loads((ROOT / row['receipt']).read_text())
    candidate = ROOT / row['file']
    assert sha(candidate) == row['sha256'] == receipt['file']['sha256']
    raw = work / f'raw-{index}.bik'
    assert not raw.exists(), 'Inspect an interrupted review extraction first'
    with (ROOT / member['archive']).open('rb') as stream:
        stream.seek(member['offset']); raw.write_bytes(stream.read(member['bytes']))
    assert sha(raw) == member['sha256']
    derived = receipt['recipe'].get('sourceVideoInput')
    source, provenance = video_input(ROOT, raw, movie, ROOT / derived['receiptFile'] if derived else None)
    assert provenance == derived
    clips, validations = {}, {}
    audio = work / f'{index:02}-audio.m4a'
    subprocess.run([ffmpeg, '-nostdin', '-y', '-v', 'error', '-i', str(raw), '-vn',
        '-af', f'atrim=start={first / 15}:duration={frames / 15},asetpts=PTS-STARTPTS',
        '-c:a', 'aac', '-b:a', '192k', str(audio)], check=True)
    try:
        for kind, video in [('original', source), ('final', candidate)]:
            clip = work / f'{index:02}-{kind}.mp4'
            silent = work / f'{index:02}-{kind}-video.mp4'
            graph = (f'select=between(n\\,{first}\\,{first + frames - 1}),settb=1/15,setpts=N,'
                'setparams=range=limited:color_primaries=smpte170m:color_trc=bt709:colorspace=smpte170m')
            subprocess.run([ffmpeg, '-nostdin', '-y', '-v', 'error', '-i', str(video),
                '-vf', graph, '-an', '-frames:v', str(frames), '-fps_mode', 'passthrough',
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p',
                '-color_range', 'tv', '-colorspace', 'smpte170m', '-color_primaries', 'smpte170m', '-color_trc', 'bt709',
                str(silent)], check=True)
            subprocess.run([ffmpeg, '-nostdin', '-y', '-v', 'error', '-i', str(silent), '-i', str(audio),
                '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-t', str(frames / 15),
                '-movflags', '+faststart', str(clip)], check=True)
            clock = subprocess.check_output([ffmpeg, '-v', 'error', '-i', str(clip),
                '-map', '0:v:0', '-c:v', 'copy', '-f', 'framehash', '-'], text=True)
            timebase = Fraction(next(line.split(': ', 1)[1] for line in clock.splitlines() if line.startswith('#tb 0:')))
            packets = [line.split(',') for line in clock.splitlines() if line and not line.startswith('#')]
            assert len(packets) == frames
            assert sorted(int(row[2]) * timebase for row in packets) == [Fraction(n, 15) for n in range(frames)]
            pcm = subprocess.check_output([ffmpeg, '-v', 'error', '-i', str(clip), '-map', '0:a:0',
                '-c:a', 'pcm_s16le', '-f', 'hash', '-hash', 'sha256', '-'], text=True).strip().split('=', 1)[1]
            validations[kind] = dict(frames=frames, everySourcePresentationTimestamp='PASS', decodedPcmSha256=pcm)
            clips[kind] = clip
            silent.unlink()
        assert validations['original']['decodedPcmSha256'] == validations['final']['decodedPcmSha256']
    finally:
        raw.unlink()
    reference = ('Retail video with localized author-assisted recovery; original retail audio'
                 if identity == 'ra2:s10_f00e' else provenance['method'] if provenance else 'Original retail BIK video and audio')
    record = dict(identity=identity, title=title, first=first, frames=frames, seconds=frames / 15,
        placement=placement, sourceReference=reference, productionSha256=row['sha256'],
        originalSize=[movie['original']['video']['width'], movie['original']['video']['height']],
        finalSize=[receipt['video']['width'], receipt['video']['height']],
        clips={kind: dict(file=str(file.relative_to(ROOT)), bytes=file.stat().st_size, sha256=sha(file), **validations[kind])
               for kind, file in clips.items()})
    records.append(record)
    rows.append(dict(**record, original=embed(clips['original'], 'video/mp4'), final=embed(clips['final'], 'video/mp4')))

captures, capture_records = [], []
for directory, files in [
    (args.ra2_native, [('native-hd-fullscreen.png', 'RA2 actual full-screen briefing'),
                       ('native-source-radar-playing.png', 'RA2 actual map-triggered radar communication'),
                       ('native-radar-restored-after-drain.png', 'RA2 radar restored after communication')]),
    (args.yr_native, [('native-hd-fullscreen.png', 'YR actual full-screen briefing'),
                      ('native-source-radar-playing.png', 'YR actual map-triggered radar communication')]),
    (args.ending_native, [('native-source-ending-report.png', 'Actual victory report before score'),
                          ('native-continue-hd-opening.png', 'Actual Continue action opens the next HD briefing')]),
    (args.options_native, [('ra2-original-checkbox.png', 'Independent HD movies checkbox')]),
]:
    if directory is None:
        continue
    report = json.loads((directory / 'report.json').read_text())
    assert report['status'].startswith('PASS_'), f'Native evidence has not passed: {directory}'
    for name, title in files:
        file = directory / name
        assert file.is_file()
        record = dict(title=title, file=str(file.relative_to(ROOT)), sha256=sha(file),
                      reportSha256=sha(directory / 'report.json'))
        capture_records.append(record); captures.append(dict(**record, image=embed(file, 'image/png')))

template = (Path(__file__).with_name('final-review.html')).read_text()
data = json.dumps(dict(rows=rows, captures=captures), separators=(',', ':')).replace('<', '\\u003c')
args.output.write_text(template.replace('__MOVIE_REVIEW_DATA__', data))
record = dict(schema='hd-movie-final-review-v1', status='SELF_CONTAINED_FINAL_REVIEW_READY',
    file=str(args.output.relative_to(ROOT)), bytes=args.output.stat().st_size, sha256=sha(args.output),
    coverage=dict(ra2=80, yr=56, fullscreen=53, radar=83), excerpts=records, captures=capture_records,
    userAcceptance='Representative natural direction accepted; complete-film user review remains pending',
    limits=['Excerpts are reencoded previews. Full production files retain their final encoded bytes.',
            'Original source motion blur, interlacing and limited tiny details remain qualified.',
            'Soviet10 uses the documented localized source recovery; all audio remains original.',
            'Native Windows playback and physical8/16GiB targets were not tested.'])
args.output.with_suffix('.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({k: record[k] for k in ['status', 'file', 'bytes', 'sha256']}))
