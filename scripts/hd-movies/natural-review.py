"""Build the previous/restrained local movie comparison from immutable sample inputs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
from review_page import render_review

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('directory', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--native-report', type=Path)
args = parser.parse_args()
base, output = args.directory.resolve(), args.output.resolve()
selection = json.loads((base / 'selection.json').read_text())
acceptance_file = ROOT / 'docs/hd-movies-natural-acceptance-20261110.json'
acceptance = json.loads(acceptance_file.read_text()) if acceptance_file.exists() else {}
accepted = (acceptance.get('status') == 'ACCEPTED_REPRESENTATIVE_DIRECTION'
            and {row['identity']: row['revisedSha256'] for row in acceptance.get('samples', [])}
            == {identity: sample['spec']['sha256'] for identity, sample in selection.items()})
native = json.loads(args.native_report.read_text()) if args.native_report else None
if native:
    assert native['status'].startswith('PASS_')
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                  'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()

def sha(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

def relative(file):
    return os.path.relpath(file, output.parent)

rows = []
for identity, sample in selection.items():
    previous, revised, original = Path(sample['previousFile']), Path(sample['file']), Path(sample['original'])
    assert sha(previous) == sample['previousSpec']['sha256'] and sha(revised) == sample['spec']['sha256']
    folder = revised.parent
    report = json.loads((folder / 'sample.json').read_text())
    source = json.loads((folder / 'source.json').read_text())
    radar = sample['placement'] == 'radar'
    pair = folder / 'paired.mp4'
    pair_record = folder / 'paired.json'
    width, height = (280, 220) if radar else (960, 720)
    if pair.exists():
        cached = json.loads(pair_record.read_text())
        assert cached['previousSha256'] == sha(previous) and cached['revisedSha256'] == sha(revised)
        assert cached['sha256'] == sha(pair)
    else:
        graph = (f'[0:v]scale={width}:{height}:flags=area,setsar=1[left];'
                 f'[1:v]scale={width}:{height}:flags=area,setsar=1[right];'
                 '[left][right]hstack=inputs=2,format=yuv420p,'
                 'setparams=range=limited:color_primaries=smpte170m:color_trc=bt709:colorspace=smpte170m[pair]')
        subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(previous), '-i', str(revised),
                        '-filter_complex', graph, '-map', '[pair]', '-map', '0:a:0', '-frames:v', '30',
                        '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', '-c:a', 'copy', '-movflags', '+faststart',
                        '-colorspace', 'smpte170m', '-color_primaries', 'smpte170m', '-color_trc', 'bt709', '-color_range', 'tv', str(pair)], check=True)
        cached = dict(file=str(pair.relative_to(ROOT)), sha256=sha(pair), bytes=pair.stat().st_size,
                      previousSha256=sha(previous), revisedSha256=sha(revised), width=width * 2, height=height, fps=15, seconds=2,
                      method='One common timeline and original AAC packets; identical area resize on both panels; no interpolation')
        pair_record.write_text(json.dumps(cached, indent=2) + '\n')
    row = dict(identity=identity, title=sample['title'], radar=radar, leftName='previous', rightName='revised',
               timingText=f"Original source {sample['sourceStart']:g}–{sample['sourceStart'] + 2:g} s. Both variants use the same thirty original frames.",
               note='Compare face contours, fabric edges and fine structures with the original reference. Both versions preserve the original audio, 15 fps and framing.',
               pair={**cached, 'file': relative(pair)}, native=[],
               videos=[dict(kind='original', label='Original reference', file=relative(original),
                            width=source['width'], height=source['height'], fps=15, bytes=original.stat().st_size),
                       dict(kind='local', label='Previous local sample', file=relative(previous),
                            **{key: sample['previousSpec'][key] for key in ['width', 'height', 'fps', 'bytes']}),
                       dict(kind='community', label='Restrained local revision', file=relative(revised),
                            **{key: sample['spec'][key] for key in ['width', 'height', 'fps', 'bytes']})])
    if native:
        capture = next(clip for clip in native['clips'] if clip['identity'] == identity and clip['kind'] == 'candidate')
        row['native'] = [dict(label='Previous local sample in the campaign player',
                             file=relative(ROOT / '.artifacts/hd-movies/native-temporal-review-r2' / capture['screenshot'])),
                         dict(label='Revised sample in the campaign player',
                              file=relative(args.native_report.parent.resolve() / capture['screenshot']))]
    rows.append(row)
render_review(rows, output, title='M3.4 Restrained Movie Restoration Review',
    status=('The user accepted these revised representative samples and settings on 2026-11-10. Complete production HD movies at acceptance: 0.' if accepted
            else 'The previous look is reopened after oversharpening feedback. Revised samples await visual review. Complete production HD movies: 0.'),
    intro='Left: previous local sample. Right: restrained local revision. Each pair uses one video/audio clock and the same source window. Separate full-screen players and original references retain their native dimensions and audio.',
    notice='The revision reduces learned high-resolution detail strength before encoding and uses area downsampling for full-screen exports. No post-encode blur, added sharpening, frame interpolation or audio generation is used. Inspect faces, thin lines and continuous motion.')
print(json.dumps(dict(output=str(output), pairs=len(rows), native=bool(native), visualAcceptance='ACCEPTED_REPRESENTATIVE_DIRECTION' if accepted else 'PENDING')))
