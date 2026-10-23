"""Pack complete authored SHP slots with full authored owner color and native trims."""

import argparse
import hashlib
import json
from pathlib import Path

import sys
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "owner-color"))
from paint import complete_data

parser = argparse.ArgumentParser()
parser.add_argument("identity")
parser.add_argument("--reviews", nargs=2, type=Path, required=True)
parser.add_argument("--worklist", type=Path, required=True)
parser.add_argument("--revision", required=True)
args = parser.parse_args()
root = Path(".artifacts/yuri-units")
work = json.loads(args.worklist.read_text())
ledger = json.loads((root / "ledger.json").read_text())
family_identity = args.identity
if args.identity == "SLAV":
    # The slave artwork belongs to the complete mixed SMIN demand family.
    parents = [r["id"] for r in ledger["rows"] if r["rules"].get("Enslaves") == "SLAV"]
    assert parents == ["SMIN"], "Native Enslaves identity changed"
    family_identity = parents[0]
review_paths = [p / "manifest.json" for p in args.reviews]
reviews = [json.loads(p.read_text()) for p in review_paths]
assert sorted(r["density"] for r in reviews) == [2, 4]
review = reviews[0]
source = json.loads(Path(review["sourceFile"]).read_text())
member = next(m for m in work["families"][args.identity]["members"] if m["sourceMember"] == source["member"])
count, source_hash = member["requiredSlots"], member["sourceSha256"]
assert source["sha256"] == source_hash
assert review["identity"] == args.identity
assert review["status"] == "COMPLETE_AUTHORED_SLOT_EXPORT_RUNTIME_PENDING"
assert [f["frame"] for f in review["frames"]] == list(range(count))
assert len(review["frames"]) == count and review["sourceSha256"] == source["sha256"]
assert args.revision.replace("-", "").isalnum()
pack_id = f"yuri-{Path(source["member"]).stem}-authored"
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
# Publish both independently exported densities in one complete revision.
for review in sorted(reviews, key=lambda r: r["density"]):
    assert review["identity"] == args.identity and review["sourceSha256"] == source_hash
    assert review["status"] == "COMPLETE_AUTHORED_SLOT_EXPORT_RUNTIME_PENDING"
    assert [f["frame"] for f in review["frames"]] == list(range(count))
    density = review["density"]
    page_width = 2048 if density == 4 else 1024
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
        data = np.zeros_like(rgba)
        data[:, :, 3] = 255
        # Apply the accepted infantry neutral-material policy to new infantry IDs.
        # This changes only classification, never constrains paint to native pixels.
        policy_identity = 'E2' if args.identity in ('INIT', 'BRUTE', 'VIRUS', 'SLAV') else args.identity
        data, added, neutral = complete_data(rgba, data, density, policy_identity, source['member'])
        paint = data[:, :, 0] >= 128
        native_owner = np.any((indices >= 16) & (indices <= 31))
        if not native_owner:
            assert not paint.any(), f'Unexpected owner material in native neutral frame: {i}'
        elif not f['empty']:
            assert paint.any(), f'Missing authored owner paint: {i}'
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
                "neutralCandidatePixels": neutral,
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
    "rulesIdentities": [family_identity],
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
        "reviewSha256": [sha(p) for p in review_paths],
        "worklistSha256": sha(args.worklist),
        "representativeAcceptanceSha256": sha(
            Path("docs/yuri-units-representative-acceptance.json")
        ),
        "remap": "Full authored owner-paint components, independently derived without clipping to native coordinates; skin, brown material and hot psychic effects are excluded; original palette verifies per-frame owner-material presence",
    },
}
(out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
report = {
    "status": "COMPLETE_NATIVE_SLOT_PACK_RUNTIME_PENDING",
    "identity": args.identity,
    "familyIdentity": family_identity,
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
