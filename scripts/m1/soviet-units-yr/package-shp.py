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
root = Path(".artifacts/m1-7-yr")
ledger = json.loads((root / "production-ledger.json").read_text())
family = ledger["families"][args.identity]
assert family["representativeAcceptance"] == "ACCEPTED"
review_path = args.review / "manifest.json"
review = json.loads(review_path.read_text())
source = json.loads(
    Path(review.get("sourceFile", root / "source-v3/dron.shp.json")).read_text()
)
policies = {('CCOMAND', 'ccomand.shp'): (348, '5aba156dbbf64e84b794a2659216086566caf113cdeab3c1e414bc09cfb4549a'), ('PTROOP', 'ptroop.shp'): (315, 'a0344e19daceed8ae1642a58eab79a9dea20829f272e70fe0650b3f781e937ee'), ('BORIS', 'boris.shp'): (409, '00c67236fb55c3992d3bd0ab55279adc058b83aa4105f5cd095ae8b9441db02e'), ('SCHP', 'schpdepl.shp'): (11, 'aaf691e3ba92bb071003005da69ebf02402ab727fb6b2f1d95b9c0050802250a')}

assert (
    args.identity,
    source["member"],
) in policies, "Review each family's remap/body policy."
count, source_hash = policies[(args.identity, source["member"])]
assert source["sha256"] == source_hash
assert review["identity"] == args.identity
assert review["status"] == "COMPLETE_SLOT_CANDIDATE_ONLY"
assert [f["frame"] for f in review["frames"]] == list(range(count))
assert len(review["frames"]) == count and review["sourceSha256"] == source["sha256"]
assert args.revision.replace("-", "").isalnum()
pack_id = f"yr-soviet-{Path(source["member"]).stem}-authored"
out = Path(".local/hd-packs") / pack_id / args.revision
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
# Squid's large native rectangles cannot fit the established 4x page/memory
# limits. Retain 4x source exports, but publish only a validated 2x runtime pack.
page_width = 2048 if args.identity == "SQD" else 1024
for density in ([2] if args.identity == "SQD" else [2, 4]):
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
        path = Path(item["files"]["candidate"]["path"])
        assert sha(path) == item["files"]["candidate"]["sha256"]
        full = Image.open(path).convert("RGBA")
        fx, fy = f["trimOrigin"]
        fw, fh = f["trimSize"]
        crop = full.crop((fx * 4, fy * 4, (fx + fw) * 4, (fy + fh) * 4))
        alpha = np.asarray(full)[:, :, 3].copy()
        alpha[fy * 4 : (fy + fh) * 4, fx * 4 : (fx + fw) * 4] = 0
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
        if args.identity in [
            "BORIS",
            "CCOMAND",
            "PTROOP",
            "SENGINEER",
            "FLAKT",
            "SHK",
            "IVAN",
            "CIVAN",
            "YURI",
            "YURIPR",
            "TERROR",
            "DESO",
            "SQD",
        ]:
            # Red vest/tool paint can be adjacent to gold helmet highlights.
            # Exclude skin, gold coils, hair, helmet highlights and muzzle flames.
            paint &= green - blue < (red - blue) * 0.25
        ramp = np.array(source["palette"])[16:32, 0]
        shade = abs(red[:, :, None] - ramp).argmin(axis=2).astype(np.uint8)
        data = np.zeros_like(rgba)
        data[:, :, 3] = 255
        data[:, :, 0] = paint.astype(np.uint8) * 255
        data[:, :, 1] = np.where(paint, shade, 0)
        no_native_remap = (
            args.identity == "TERROR" and i in [180, 181, 182, 184, 186, 187]
        ) or (
            args.identity == "SQD"
            and source["member"] == "sqdg.shp"
            and i < 80
            and i % 10 < 6
        )
        if no_native_remap:
            assert not np.any((indices >= 16) & (indices <= 31))
            assert not paint.any(), "This native slot has no owner-color pixels"
        else:
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
        root / "representative-acceptance-v1.json"
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
