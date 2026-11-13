"""Create one-clock comparison previews; preserve the separate source files for full-screen inspection."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
base = ROOT / '.artifacts/hd-movies/community'
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                  'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
for source in sorted((base / 'samples').glob('*/sample.json')):
    record = json.loads(source.read_text())
    local, community = Path(record['localSample']['file']), ROOT / record['preview']['file']
    radar = record['localSample']['placement'] == 'radar'
    width, height, fps = (280, 220, 15) if radar else (960, 720, 60)
    output = source.parent / 'paired.mp4'
    graph = (f'[0:v]fps={fps},scale={width}:{height}:flags=lanczos,setsar=1[left];'
             f'[1:v]fps={fps},scale={width}:{height}:flags=lanczos,setsar=1[right];'
             '[left][right]hstack=inputs=2,format=yuv420p,'
             'setparams=range=limited:color_primaries=smpte170m:color_trc=bt709:colorspace=smpte170m[pair]')
    subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(local), '-i', str(community),
                    '-filter_complex', graph, '-map', '[pair]', '-map', '0:a:0', '-frames:v', str(fps * 2),
                    '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', '-c:a', 'copy', '-movflags', '+faststart',
                    '-colorspace', 'smpte170m', '-color_primaries', 'smpte170m', '-color_trc', 'bt709', '-color_range', 'tv', str(output)], check=True)
    record['pairedPreview'] = dict(file=str(output.relative_to(ROOT)), bytes=output.stat().st_size,
        sha256=hashlib.sha256(output.read_bytes()).hexdigest(), width=width * 2, height=height, fps=fps, seconds=2,
        method='One shared video/audio clock. Left local, right downloaded; both panels use identical display dimensions and resampling. Local 15 fps frames are repeated when the pair uses 60 fps; no motion interpolation is added.',
        audio='Exact AAC packet copy from the accepted local original-audio sample',
        qualification='Comparison-only derivative. Separate source proxies retain their own dimensions, frame rates and audio.')
    source.write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(dict(identity=record['identity'],output=str(output),fps=fps)), flush=True)
