"""Lay out untouched native NPC captures at their actual pixels for visual inspection."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('identity', choices=['CAML', 'EINS', 'MUMY', 'RMNV', 'PENTGEN', 'DNOB'])
parser.add_argument('receipt', type=Path)
parser.add_argument('cases', type=Path, nargs='+')
args = parser.parse_args()
assert not args.receipt.exists()
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
boards, cases = [], []
for folder in args.cases:
    report_file = folder/'report.json'
    report = json.loads(report_file.read_text())
    assert report['status'] == 'PASS_NATIVE_ORIGINAL_INFANTRY_COMPLETE_BODY_AND_NATIVE_SHADOW_SLOTS_FROZEN_WORLD_AND_REQUESTED_DENSITY'
    assert report['before'] == report['after']
    assert not report['errors'] and not report['failedResources'] and not report.get('consoleErrors')
    actor, = [actor for actor in report['actors'] if actor['identity'] == args.identity]
    samples = [frame for frame in actor['frames'] if frame.get('file')]
    output = folder/'overview'
    output.mkdir(exist_ok=False)
    for start in range(0, len(samples), 16):
        entries = samples[start:start+16]
        images = [Image.open(folder/entry['file']).convert('RGBA') for entry in entries]
        width = max(image.width for image in images)+24
        height = max(image.height for image in images)+44
        columns, rows = 4, (len(entries)+3)//4
        title = f'{args.identity} / {report["mission"]} / {report["density"]}X / native captured pixels'
        board = Image.new('RGB', (max(columns*width, int(font.getlength(title))+30), rows*height+50), (63,80,72))
        draw = ImageDraw.Draw(board)
        draw.text((12,9), title, font=font, fill='white')
        for index, (entry, image) in enumerate(zip(entries, images)):
            x, y = 12+index%columns*width, 54+index//columns*height
            draw.text((x,y), f'{entry["frame"]:03d}', font=font, fill='white')
            board.paste(image, (x,y+28), image)
        file = output/f'page-{start//16+1}.png'
        board.save(file)
        boards.append({'case': str(folder), 'density': report['density'], 'mission': report['mission'],
            'file': str(file), 'sha256': sha(file), 'size': list(board.size),
            'frames': [entry['frame'] for entry in entries], 'resampling': 'NONE',
            'captures': [{'file': str(folder/entry['file']), 'sha256': sha(folder/entry['file'])} for entry in entries]})
    cases.append({'file': str(report_file), 'sha256': sha(report_file), 'mission': report['mission'],
        'density': report['density'], 'tick': report['before']['tick'],
        'frameChecks': len(actor['frames']), 'captures': len(samples)})
receipt = {'schema': 'yr-task-npc-native-capture-overviews-v1',
    'status': 'NATIVE_CAPTURE_VISUAL_REVIEW_PENDING', 'identity': args.identity,
    'cases': cases, 'boards': boards, 'nativeFrameChecks': sum(case['frameChecks'] for case in cases),
    'nativeCaptures': sum(case['captures'] for case in cases), 'selectedResourcesChanged': 0,
    'userVisualAcceptance': 'PENDING'}
args.receipt.write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps({'status': receipt['status'], 'checks': receipt['nativeFrameChecks'],
    'captures': receipt['nativeCaptures'], 'boards': len(boards)}))
