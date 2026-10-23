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
root = Path(".artifacts/m1-7")
ledger = json.loads((root / "ledger.json").read_text())
family = ledger["families"][args.identity]
assert family["representativeAcceptance"] == "ACCEPTED"
review_path = args.review / "manifest.json"
review = json.loads(review_path.read_text())
source = json.loads(
    Path(review.get("sourceFile", root / "source-v3/dron.shp.json")).read_text()
)
policies = {
    ("SQD", "sqd.shp"): (
        296,
        "dcbac9af11d7d13be98de775ab23deff04116e5d9cc2920887930db2ae6835d2",
    ),
    ("SQD", "sqdg.shp"): (
        240,
        "f75be15eb3b2d63c98966a8787a218aca3b6f975c6d1cc0c1127052835ae144c",
    ),
    ("YURIPR", "yuripr.shp"): (
        315,
        "1c73fa3a7bdce534f4c4d3a6470a974490dccad18ee2da7bca01177aa1098ef9",
    ),
    ("CIVAN", "civan.shp"): (
        267,
        "48569d57cf5a77fe611a000ea8db14992160d0515d4e4b9bf22c03198c010523",
    ),
    ("DESO", "deso.shp"): (
        322,
        "7f157a5089a3ec822ae73eb951993a410c8fabc0d1fa839ddb0eed255aabfcc4",
    ),
    ("TERROR", "trst.shp"): (
        188,
        "96a6ff78111593f5435116a0b3f36c1e9d740c72421ca62419282225cacd78db",
    ),
    ("YURI", "yuri.shp"): (
        316,
        "8d5964c758cb6e51699ec0118a323c9ab096ac37df060bf3024ecbac0bfd9a3f",
    ),
    ("DRON", "dron.shp"): (
        88,
        "c5d2a3a0b58c664bd5d8cbf033f865588224e6888552c83ec4b44f2b32dd2e94",
    ),
    ("DRON", "dronp.shp"): (
        32,
        "ce9a848c52f36abe8f873c6c3efe421373c0cde3f304090a03c3188ecadff161",
    ),
    ("SENGINEER", "engineer.shp"): (
        253,
        "f8eb0dc0156a877028ac2ed57bf2e71a9445ffcb6ef6a4caf3b0dbb7b111834c",
    ),
    ("DOG", "dog.shp"): (
        172,
        "7fd747a5d874c8a3613fae87eb8ef438e9b31778c32150830afcd7a992383ff7",
    ),
    ("DOG", "dogp.shp"): (
        32,
        "9571109f20bddd2ba051bf3ce0eae5071ddfa40275996f631235cc025f18d855",
    ),
    ("FLAKT", "flakt.shp"): (
        301,
        "2be57b9db70eefa6630f9c19abfb96715cc3da58de57a6c8fef08523851e64d9",
    ),
    ("SHK", "shk.shp"): (
        301,
        "7d46dcfc1509ce6684c89782be388f7a438f8946bd187300bd0490a48f8f4122",
    ),
    ("IVAN", "ivan.shp"): (
        267,
        "4a78fb72494d380cdd34fa89bebf7f4c6c2270724202c3b6811340af66bc7959",
    ),
}
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
pack_id = f"soviet-{Path(source["member"]).stem}-authored"
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
            root / "representative-acceptance-v3.json"
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
