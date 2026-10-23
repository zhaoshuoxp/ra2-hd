"""Prepare native pose guides and finished-HD references for new sprite painting."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import native_indices, read, sha, unpack, write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("authoring", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--keys", required=True)
parser.add_argument("--group-size", type=int, default=6)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
jobs = []
for key in args.keys.split(","):
    r = next(f for f in read(args.authoring)["families"] if f["key"] == key)
    raw, palette = read(r["nativeSource"]), np.array(r["palette"], np.uint8)
    width, height = raw["canvas"]
    cell = max(width, height) * 4 + 64
    folder = args.output / key
    folder.mkdir()
    binding = r["newMember"]
    root = Path(".local/hd-packs") / binding["packId"] / binding["revision"]
    manifest = read(root / "manifest.json")
    base = unpack(root, manifest, 4, r["frames"] - 1)
    data = unpack(root, manifest, 4, r["frames"] - 1, "data")
    weight = data[..., :1] / 255
    def linearize(a):
        return np.where(a <= .04045, a / 12.92, ((a + .055) / 1.055) ** 2.4)
    light = linearize(base[..., :3] / 255) * (1 - weight)
    light += linearize(palette[16 + np.minimum(data[..., 1], 15)] / 255) * weight
    rgb = np.where(light <= .0031308, light * 12.92, 1.055 * light ** (1 / 2.4) - .055)
    base[..., :3] = np.clip(np.floor(rgb * 255 + .5), 0, 255)
    terminal = Image.new("RGBA", (cell, cell))
    terminal.paste(Image.fromarray(base), ((cell - width * 4) // 2, (cell - height * 4) // 2))
    terminal_file = folder / "retained-hd-terminal.png"
    terminal.save(terminal_file)
    for number, start in enumerate(range(0, r["frames"] - 1, args.group_size)):
        phases = list(range(start, min(start + args.group_size, r["frames"] - 1)))
        columns = 3 if len(phases) >= 3 else len(phases)
        rows = (len(phases) + columns - 1) // columns
        sheet = Image.new("RGBA", (cell * columns, cell * rows))
        details = []
        for n, phase in enumerate(phases):
            indices = native_indices(raw, phase)
            rgba = np.dstack((palette[indices], (indices > 0).astype(np.uint8) * 255))
            rgba[indices == 0] = 0
            pose = Image.fromarray(rgba).resize((width * 4, height * 4), Image.Resampling.NEAREST)
            sheet.paste(pose, (n % columns * cell + (cell - pose.width) // 2,
                              n // columns * cell + (cell - pose.height) // 2))
            f = raw["frames"][phase]
            details.append({"phase": phase, "bounds": [f["x"], f["y"], f["width"], f["height"]],
                            "nativeOwnerPixels": int(((indices >= 16) & (indices <= 31)).sum())})
        guide = folder / f"{number:02}-native-pose-guide.png"
        sheet.save(guide)
        prompt = f'''Use-case: stylized-concept. Production artwork for a Red Alert 2 HD construction sprite sequence.
Reference image 1 is the EXACT anatomy and layout guide: {key}, {r['identity']}, {r['theater']}; {columns} columns by {rows} rows; cells in reading order depict native phases {phases}. Preserve this cell layout, sprite bounds, empty margins, camera angle, incomplete-part geometry, component count, construction order and transparent holes. Every guide cell is a separate required pose. An unused last cell must remain empty.
Reference image 2 is the retained finished HD building, used ONLY for faithful material, architectural details and lighting. Do not copy its completed geometry into earlier construction stages.
Repaint every visible sprite surface as crisp, detailed HD game art: machined edges, believable panel seams and rivets, small material wear, coherent metal and concrete textures, matching the finished reference. Author exposed interiors and moving/folded panels where the native construction guide shows them. Preserve intentional black openings, foundation footprint, fixed component attachment and the exact anatomy of each guide. Keep the same texture placement and brightness on unchanged components across the cells. This is reconstruction of the depicted Red Alert 2 object, not redesign.
Red owner paint appears ONLY on corresponding red surfaces of the native guide. No early towers, generators, roof, crane, dome, flags or supports unless visible in that particular native phase. No additional props, workers, UI, text, shadows or colored background. For SNOW, retain snow only where the native phase and finished reference show it; no snow inside machines.
Native pose metadata for alignment (geometry controls only): {details}.
Output one transparent sprite sheet with the SAME {columns} by {rows} arrangement as the first reference, all {len(phases)} requested poses, clean antialiased edges, and no labels. Keep full transparent margins around each sprite. Do not merely enlarge pixels or blur Original color: all visible material must be newly painted HD artwork.'''
        prompt_file = folder / f"{number:02}-prompt.txt"
        prompt_file.write_text(prompt + "\n")
        jobs.append({"id": f"{key}-{number:02}", "key": key, "phases": phases, "grid": [columns, rows],
                     "guide": str(guide), "guideSha256": sha(guide), "terminal": str(terminal_file),
                     "terminalSha256": sha(terminal_file), "prompt": str(prompt_file),
                     "nativeSourceSha256": raw["source"]["sha256"], "status": "PENDING_PAINTING"})
write(args.output / "jobs.json", jobs)
print(len(jobs), "painting jobs", sum(len(j["phases"]) for j in jobs), "intermediate poses")
