"""Encode timestamped native faction-menu captures without resizing or animation edits."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

root = Path(__file__).resolve().parents[2]
directory = Path(sys.argv[1]).resolve()
directory.relative_to(root)
report = json.loads((directory / "report.json").read_text())
if report["status"] != "PASS_HD_INTERFACE_AND_ORIGINAL_BRIDGE_INITIALIZATION_REPAIR":
    raise ValueError("Native interface and bridge validation must pass before encoding")
frames = report["menuFrames"]
if len({frame["frame"] for frame in frames}) < 3:
    raise ValueError("Insufficient distinct source animation frames")
lines = ["ffconcat version 1.0"]
identities = []
for index, frame in enumerate(frames):
    filename = directory / "frames" / frame["filename"]
    if filename.parent != directory / "frames" or not filename.is_file():
        raise ValueError("Unexpected native frame path")
    duration = (frames[index + 1]["timestamp"] - frame["timestamp"]) / 1000 if index + 1 < len(frames) else 0.15
    if duration <= 0:
        raise ValueError("Non-monotonic native capture timestamps")
    lines.extend([f"file '{filename.as_posix()}'", f"duration {duration:.6f}"])
    data = filename.read_bytes()
    identities.append({**frame, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
lines.append(f"file '{filename.as_posix()}'")
concat = directory / "menu-frames.ffconcat"
concat.write_text("\n".join(lines) + "\n")
encoder = imageio_ffmpeg.get_ffmpeg_exe()
output = directory / "menu-animation.webm"
subprocess.run([encoder, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
                "-i", str(concat), "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "26",
                "-pix_fmt", "yuv420p", "-fps_mode", "vfr", str(output)], check=True)
subprocess.run([encoder, "-hide_banner", "-loglevel", "error", "-i", str(output), "-f", "null", "-"], check=True)
receipt = {"status": "PASS_NATIVE_WINDOW_FRAMES_ENCODED_AND_FULLY_DECODED",
           "scope": "Actual native HD faction-menu hover animation. Silent, unresized, variable capture cadence; no interpolation, performance claim or original-engine timing certification.",
           "path": output.relative_to(root).as_posix(), "bytes": output.stat().st_size,
           "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "frames": identities}
(directory / "video-verification.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({key: value for key, value in receipt.items() if key != "frames"}, indent=2))
