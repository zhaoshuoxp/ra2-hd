"""Build a matched trial for a confirmed source-motion defect at the accepted detail strength."""
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
args = parser.parse_args()
base, output = args.directory.resolve(), args.output.resolve()
left, right = base / 'face-unfiltered-r1', base / 'face-tff-r1'
original = base / 'face-source-r1/original.mp4'
reports = [json.loads((folder / 'sample.json').read_text()) for folder in [left, right]]
assert reports[0]['audioPcmHashCandidate'] == reports[1]['audioPcmHashCandidate']
assert all(report['frames'] == 30 and report['detailGain'] == .5 and report['resizeFilter'] == 'area' for report in reports)

def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

for folder, report in zip([left, right], reports):
    assert sha(folder / 'candidate.mp4') == report['candidate']['sha256']
pair, record = base / 'motion-source-paired.mp4', base / 'motion-source-paired.json'
if not pair.exists():
    ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                      'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
    graph = ('[0:v]scale=960:720:flags=area,setsar=1[a];[1:v]scale=960:720:flags=area,setsar=1[b];'
             '[a][b]hstack=inputs=2,format=yuv420p,setparams=range=limited:color_primaries=smpte170m:color_trc=bt709:colorspace=smpte170m[v]')
    subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(left / 'candidate.mp4'), '-i', str(right / 'candidate.mp4'),
                    '-filter_complex', graph, '-map', '[v]', '-map', '0:a:0', '-frames:v', '30', '-c:v', 'libx264', '-crf', '12',
                    '-preset', 'fast', '-c:a', 'copy', '-movflags', '+faststart', '-colorspace', 'smpte170m',
                    '-color_primaries', 'smpte170m', '-color_trc', 'bt709', '-color_range', 'tv', str(pair)], check=True)
    record.write_text(json.dumps(dict(sha256=sha(pair), inputs=[report['candidate']['sha256'] for report in reports]), indent=2) + '\n')
cached = json.loads(record.read_text())
assert cached['sha256'] == sha(pair) and cached['inputs'] == [report['candidate']['sha256'] for report in reports]
relative = lambda file: os.path.relpath(file, output.parent)
videos = [dict(kind='original', label='Original reference', file=relative(original), width=640, height=480, fps=15, bytes=original.stat().st_size)]
for kind, label, folder, report in zip(['local', 'community'], ['Current restoration', 'Source-motion repair'], [left, right], reports):
    videos.append(dict(kind=kind, label=label, file=relative(folder / 'candidate.mp4'), **{key: report['candidate'][key] for key in ['width', 'height', 'fps', 'bytes']}))
rows = [dict(identity='ra2:s01_f00e', title='RA2 live-action source-motion repair', radar=False, leftName='current', rightName='repaired',
             timingText='Original 96–98 s, source frames 1440–1469. Both candidates retain the accepted detail strength of 0.5.',
             note='The original moving face contains horizontal combing. This bounded trial reconstructs fields at the source size with fixed TFF and one output per original frame. Full-film source treatment requires exact reviewed intervals.',
             pair=dict(file=relative(pair), sha256=sha(pair), fps=15, seconds=2), videos=videos, native=[])]
render_review(rows, output, title='M3.4 Source Motion Repair Trial', status='Bounded source-defect repair under technical review. The restrained restoration direction is already user accepted.',
              intro='Left: current restoration on the original decoded input. Right: targeted source-motion repair followed by the same restoration. The pair shares one video/audio clock. Full-screen players and the original reference are available.',
              notice='The trial retains original framing, thirty frames, 15 fps and identical audio. Source treatment is disabled by default; CGI and intentional monitor graphics require their original input.')
print(json.dumps(dict(output=str(output), pairs=1, sourceRange=[1440,1470], formalSelectionChanged=False)))
