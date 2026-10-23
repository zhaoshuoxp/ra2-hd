"""Pack complete authored SHP slots with source-guided owner color and native trims."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

parser = argparse.ArgumentParser()
parser.add_argument("identity")
parser.add_argument("--review", type=Path, required=True)
parser.add_argument("--revision", required=True)
args = parser.parse_args()
root = Path(".artifacts/allied-units")
work = json.loads((root / "production-shp-v3/worklist.json").read_text())
review_path = args.review / "manifest.json"
review = json.loads(review_path.read_text())
source = json.loads(Path(review["sourceFile"]).read_text())
member = next(m for m in work["families"][args.identity]["members"] if m["sourceMember"] == source["member"])
count, source_hash = member["requiredSlots"], member["sourceSha256"]
assert source["sha256"] == source_hash
assert review["identity"] == args.identity
assert review["status"] == "COMPLETE_AUTHORED_SLOT_EXPORT_RUNTIME_PENDING"
assert [f["frame"] for f in review["frames"]] == list(range(count))
assert len(review["frames"]) == count and review["sourceSha256"] == source["sha256"]
assert args.revision.replace("-", "").isalnum()
pack_id = f"allied-{Path(source["member"]).stem}-authored"
out = (root / "staged-packs") / pack_id / args.revision
out.mkdir(parents=True, exist_ok=False)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
logical = [
    {
        "nativeFrame": i,
        "trimOrigin": [f["x"], f["y"]],
        "trimSize": [f["width"], f["height"]],
        "legacyRenderSize": [
            f["width"] + f["width"] % 2,
            f["height"] + f["height"] % 2,
        ],
        "empty": f["empty"],
    }
    for i, f in enumerate(source["frames"][:count])
]
variants, checks = [], []
# Publish the audited export density with unchanged native registration.
page_width = 2048 if args.identity == "SQD" or review["density"] == 4 else 1024
for density in [review["density"]]:
    layouts, frames = [[]], []
    x, y, row_height = 2, 2, 0
    entries = list(zip(logical, review["frames"], strict=True))
    if args.identity == "SQD":
        entries.sort(
            key=lambda pair: (
                -pair[0]["legacyRenderSize"][1],
                -pair[0]["legacyRenderSize"][0],
                pair[0]["nativeFrame"],
            )
        )
    for f, item in entries:
        i = f["nativeFrame"]
        assert item["frame"] == i
        path = Path(item["path"])
        assert sha(path) == item["sha256"]
        full = Image.open(path).convert("RGBA")
        fx, fy = f["trimOrigin"]
        fw, fh = f["trimSize"]
        crop = full.crop((fx * density, fy * density, (fx + fw) * density, (fy + fh) * density))
        alpha = np.asarray(full)[:, :, 3].copy()
        alpha[fy * density : (fy + fh) * density, fx * density : (fx + fw) * density] = 0
        assert not alpha.any(), f"Authored pixels outside native trim: {i}"
        w, h = [v * density for v in f["legacyRenderSize"]]
        base = Image.new("RGBA", (w, h))
        base.paste(
            crop.convert("RGBa")
            .resize((fw * density, fh * density), Image.Resampling.BOX)
            .convert("RGBA")
        )
        rgba = np.array(base)
        indices = np.array(source["frames"][i]["pixels"], dtype=np.uint8).reshape(
            fh, fw
        )
        native_remap = Image.fromarray(
            ((indices >= 16) & (indices <= 31)).astype(np.uint8) * 255
        )
        support = np.zeros((h, w), dtype=bool)
        # Empty native slots have zero dimensions; Pillow's rank filter cannot
        # process them safely. They retain empty paint and their native slot.
        if fw and fh:
            support[: fh * density, : fw * density] = (
                np.asarray(
                    native_remap.filter(ImageFilter.MaxFilter(5)).resize(
                        (fw * density, fh * density), Image.Resampling.NEAREST
                    )
                )
                > 0
            )
        red, green, blue = (rgba[:, :, k].astype(float) for k in range(3))
        paint = (
            support
            & (rgba[:, :, 3] > 0)
            & (red > 35)
            & (red > green * 1.5)
            & (red > blue * 1.5)
        )
        # Exclude skin, warm metal and muzzle highlights from team paint.
        paint &= green - blue < (red - blue) * 0.25
        ramp = np.array(source["palette"])[16:32, 0]
        shade = abs(red[:, :, None] - ramp).argmin(axis=2).astype(np.uint8)
        data = np.zeros_like(rgba)
        data[:, :, 3] = 255
        data[:, :, 0] = paint.astype(np.uint8) * 255
        data[:, :, 1] = np.where(paint, shade, 0)
        if not np.any((indices >= 16) & (indices <= 31)):
            assert not paint.any(), "Native slot has no owner-color support"
        elif not f["empty"]:
            assert paint.any(), f"Missing source-guided remap: {i}"
        if x + w + 2 > page_width:
            x, y, row_height = 2, y + row_height + 4, 0
        if y + h + 2 > 2048:
            layouts.append([])
            x, y, row_height = 2, 2, 0
        frame = {
            "nativeFrame": i,
            "page": f"p{len(layouts) - 1}",
            "sampleRect": [x, y, w, h],
            "contentRect": [x, y, fw * density, fh * density],
        }
        frames.append(frame)
        layouts[-1].append((frame, base, Image.fromarray(data)))
        x += w + 4
        row_height = max(row_height, h)
        checks.append(
            {
                "frame": i,
                "density": density,
                "remapPixels": int(paint.sum()),
                "clippedAuthoredPixels": 0,
            }
        )
    pages = []
    for index, layout in enumerate(layouts):
        height = (
            (
                max(f["sampleRect"][1] + f["sampleRect"][3] + 2 for f, _, _ in layout)
                + 15
            )
            // 16
            * 16
        )
        page = {"id": f"p{index}", "size": [page_width, height]}
        for role_index, role in enumerate(["base", "data"], 1):
            atlas = Image.new(
                "RGBA", (page_width, height), (0, 0, 0, 255 if role == "data" else 0)
            )
            for item in layout:
                atlas.paste(item[role_index], tuple(item[0]["sampleRect"][:2]))
            name = f"{density}x-p{index}-{role}.png"
            atlas.save(out / name)
            page.update(
                {
                    role: name,
                    f"{role}Sha256": sha(out / name),
                    f"{role}Bytes": (out / name).stat().st_size,
                }
            )
        pages.append(page)
    frames.sort(key=lambda frame: frame["nativeFrame"])
    variants.append({"density": density, "pages": pages, "frames": frames})
manifest = {
    "schemaVersion": 2,
    "packId": pack_id,
    "packRevision": args.revision,
    "rulesIdentities": [args.identity],
    "purpose": "Complete authored native slots; runtime and final visual validation pending",
    "source": {
        "member": source["member"],
        "sha256": source["sha256"],
        "theater": "TEMPERATE",
        "kind": "resolved-shp-member",
    },
    "logical": {"canvas": source["canvas"], "frames": logical},
    "color": {"representation": "authored-sRGB-RGBA8-plus-RGBA8-data"},
    "variants": variants,
    "provenance": {
        "reviewSha256": sha(review_path),
        "representativeAcceptanceSha256": sha(
            Path("docs/allied-units-hd-direction.json")
        ),
        "remap": "Authored red team regions intersected with per-frame native owner-color support expanded by two logical pixels; neutral materials and the engineer's gold helmet are excluded",
    },
}
(out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
report = {
    "status": "COMPLETE_NATIVE_SLOT_PACK_RUNTIME_PENDING",
    "identity": args.identity,
    "root": str(out),
    "manifestSha256": sha(out / "manifest.json"),
    "variants": [
        {
            "density": v["density"],
            "gpuBytes": sum(p["size"][0] * p["size"][1] * 8 for p in v["pages"]),
        }
        for v in variants
    ],
    "checks": checks,
}
(root / f"{Path(source["member"]).stem}-pack-{args.revision}.json").write_text(
    json.dumps(report, indent=2) + "\n"
)
print(json.dumps({k: v for k, v in report.items() if k != "checks"}))
