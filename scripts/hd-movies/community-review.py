"""Build the paired local/community movie review without copying accepted local videos."""
import argparse
import json
import os
from pathlib import Path
from review_page import render_review

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('directory', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--native-report', type=Path)
args = parser.parse_args()
base, output = args.directory.resolve(), args.output.resolve()
native = json.loads(args.native_report.read_text()) if args.native_report else None
if native:
    assert native['status'].startswith('PASS_')
output.parent.mkdir(parents=True, exist_ok=True)

def relative(file):
    return os.path.relpath(file, output.parent)

local = json.loads((ROOT / '.artifacts/hd-movies/temporal/selection.json').read_text())
rows = []
for identity, sample in local.items():
    folder = base / 'samples' / identity.replace(':', '-')
    report = json.loads((folder / 'sample.json').read_text())
    original = json.loads((Path(sample['original']).parent / 'source.json').read_text())
    row = dict(identity=identity, title=sample['title'], radar=sample['placement'] == 'radar',
               originalTime=report['originalTime'], communityTime=report['communityTime'],
               offset=report['alignment']['offsetSeconds'], correlation=report['alignment']['bestScore'],
               unchanged=report['source']['byteIdenticalToOriginal'], watermark=sample['placement'] != 'radar',
               audioOffset=report.get('audioAlignment', {}).get('videoMinusAudioOffsetSeconds'),
               pair={**report['pairedPreview'], 'file': relative(ROOT / report['pairedPreview']['file'])},
               videos=[dict(kind='original', label='Original reference', file=relative(Path(sample['original'])),
                            width=original['width'], height=original['height'], fps=original['fps'],
                            bytes=Path(sample['original']).stat().st_size),
                       dict(kind='local', label='Local temporal restoration', file=relative(Path(sample['file'])),
                            **{key: sample['spec'][key] for key in ['width', 'height', 'fps', 'bytes']}),
                       dict(kind='community', label='Downloaded package', file=relative(ROOT / report['preview']['file']),
                            **{key: report['preview'][key] for key in ['width', 'height', 'fps', 'bytes']})], native=[])
    if native:
        downloaded = next(clip for clip in native['clips'] if clip['identity'] == identity and clip['kind'] == 'candidate')
        local_capture = ROOT / '.artifacts/hd-movies/native-temporal-review-r2' / downloaded['screenshot']
        row['native'] = [dict(label='Local restoration in the campaign player', file=relative(local_capture)),
                         dict(label='Downloaded footage in the campaign player',
                              file=relative(args.native_report.parent.resolve() / downloaded['screenshot']))]
    rows.append(row)
for row in rows:
    row['leftName'], row['rightName'] = 'local', 'downloaded'
    row['timingText'] = (f"Original source {row['originalTime']:.3f}–{row['originalTime'] + 2:.3f} s · "
                         f"Downloaded source {row['communityTime']:.3f}–{row['communityTime'] + 2:.3f} s. "
                         'Window matched using all 30 original frames. Full-film cuts remain unaudited.')
    row['note'] = ('Downloaded radar source is unchanged original footage. The paired view shows native 1X or 2X radar scale.'
                   if row['unchanged'] else 'Downloaded source contains an MRZJL watermark and 60 fps processing. Local source retains the original 15 fps.')
    if row['audioOffset'] is not None and abs(row['audioOffset']) > .07:
        row['note'] += (f" This downloaded window has an estimated {abs(row['audioOffset']):.2f} s audio/video phase difference "
                        'relative to the original. Full screen downloaded plays its own audio so you can inspect it.')
render_review(rows, output, title='M3.4 Local and Downloaded Movie Comparison',
    status='Five matched two-second windows. The local finish is under revision after oversharpening feedback. Complete production HD movies selected: 0.',
    intro='Left: local temporal restoration. Right: downloaded package. The paired video uses one shared timeline and original audio. Both sides use equal display dimensions. Local 15 fps frames are repeated in 60 fps pairs; no motion interpolation is added. Separate source players retain their own dimensions, frame rates and audio for full-screen inspection.',
    notice='The three downloaded full-screen samples are 1440 × 1080 at 60 fps and contain a visible MRZJL watermark. Both downloaded radar samples are byte-identical to the original 140 × 110, 15 fps movies. All resizing and comparison encoding is limited to the paired preview; the separate sources are retained.')
print(json.dumps(dict(output=str(output), matchedWindows=len(rows), native=bool(native), productionSelected=0)))
