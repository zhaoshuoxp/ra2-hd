"""Export non-activatable representative previews; retain uncensored raw candidates."""

import json, hashlib
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(".artifacts/m1-7")
out = root / "review-exports-v7"
out.mkdir(exist_ok=False)
previous = json.loads((root / "review-exports-v6/manifest.json").read_text())
inv = json.loads((root / "source-v3/inventory.json").read_text())
shp = {x["id"]: x for x in json.loads((root / "references-v2/selection.json").read_text())}
vxl = {
    x["id"]: x
    for x in json.loads((root / "vehicle-references-v2/vehicle-selection.json").read_text())
}
hashfile = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def remove_matte(im):
    a = np.asarray(im.convert("RGBA")).copy()
    rgb = a[:, :, :3].astype(float)
    if (a[:, :, 3] < 250).mean() > 0.05:
        a[a[:, :, 3] < 8] = 0
        return Image.fromarray(a), "generated-alpha; alpha below 8 cleared (no silhouette mask)"
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    d1 = (rgb[:, :, 1] - rgb[:, :, 0]) - (bg[1] - bg[0])
    d2 = (rgb[:, :, 1] - rgb[:, :, 2]) - (bg[1] - bg[2])
    dist = np.maximum(abs(d1), abs(d2))
    alpha = np.clip((dist - 5) / 9, 0, 1)
    a[:, :, 3] = (alpha * 255).astype("uint8")
    a[a[:, :, 3] == 0, :3] = 0
    return Image.fromarray(a), "border-median-chroma-matte; no native silhouette mask"


def bbox(im):
    return im.getchannel("A").point(lambda a: 255 if a > 64 else 0).getbbox()


report = {
    "status": "REPRESENTATIVE_EXPORTS_ONLY",
    "runtimeActivation": False,
    "completeFamilies": 0,
    "families": {},
    "limitations": [
        "Per-pose uniform bounding registration is provisional; not native runtime pivot validation.",
        "No native silhouette clipping, source RGB fill, owner-remap claim or animation interpolation.",
        "Retained black painted shadow pixels and matte fringes require visual inspection.",
    ],
}
for f in inv["families"]:
    if f["acceptedControl"]:
        continue
    id = f["id"]
    meta = (shp if id in shp else vxl)[id]
    is_shp = id in shp
    revision = (
        7
        if id == "HARV"
        else 3 if id == "APOC" else 2 if id in ["SHK", "DRON", "SQD", "YURIPR"] else 1
    )
    artdir = root / f"authoring-v{revision}" / id
    raw = Image.open(artdir / "raw.png").convert("RGBA")
    raw_ref = Image.open(
        root / ("references-v2" if is_shp else "vehicle-references-v2") / meta["reference"]
    )
    sx = raw.width / raw_ref.width
    sy = raw.height / raw_ref.height
    entry = {
        "rulesIdentity": id,
        "selectedRaw": str(artdir / "raw.png"),
        "rawSha256": hashfile(artdir / "raw.png"),
        "prompt": str(artdir / "prompt.txt"),
        "promptSha256": hashfile(artdir / "prompt.txt"),
        "sourceBoard": str(
            root / ("references-v2" if is_shp else "vehicle-references-v2") / meta["reference"]
        ),
        "sourceBoardSha256": hashfile(
            root / ("references-v2" if is_shp else "vehicle-references-v2") / meta["reference"]
        ),
        "tool": "built-in image_gen",
        "samples": [],
    }
    (out / id).mkdir()
    for i, cell in enumerate(meta["cells"]):
        x, y, w, h = cell["cell"]
        box = [round(x * sx), round(y * sy), round((x + w) * sx), round((y + h) * sy)]
        tile, method = remove_matte(raw.crop(box))
        bb = bbox(tile)
        if not bb:
            raise ValueError(f"Empty generated sample {id}/{i}")
        authored = tile.crop(bb)
        if is_shp:
            original = Image.open(
                root / "references-v2" / f'{id}-{cell["nativeFrame"]}-original.png'
            ).convert("RGBA")
            native_bbox = bbox(original)
            size = original.size
            display_scale = 1.2
            label = f'{cell["state"]} / frame {cell["nativeFrame"]}'
        else:
            original, ignore = remove_matte(
                Image.open(root / "runtime-references-v3" / cell["source"])
            )
            native_bbox = bbox(original)
            size = original.size
            display_scale = 1
            label = f'{cell["role"]} / yaw {cell["heading"]}'
        retained_shadow = None
        if id == "YURIPR":
            # Index 12 is also baked into the visible source frame. Do not anchor the
            # floating body to the bottom of this ground patch, or invent a new altitude.
            source = json.loads((root / "source-v3/yuripr.shp.json").read_text())
            frame = source["frames"][cell["nativeFrame"]]
            indices = np.array(frame["pixels"]).reshape(frame["height"], frame["width"])
            body = Image.fromarray(((indices != 0) & (indices != 12)).astype("uint8") * 255)
            b = body.getbbox()
            native_bbox = (
                b[0] + frame["x"],
                b[1] + frame["y"],
                b[2] + frame["x"],
                b[3] + frame["y"],
            )
            # Retain the exact native black pixels outside the body's color bounds.
            # No authored pixels are masked, clipped or filled with source body RGB.
            mask = indices == 12
            mask[b[1] : b[3], b[0] : b[2]] = False
            patch = np.zeros((*indices.shape, 4), dtype="uint8")
            patch[:, :, 3] = mask.astype("uint8") * 255
            retained_shadow = Image.new("RGBA", size)
            retained_shadow.alpha_composite(Image.fromarray(patch), (frame["x"], frame["y"]))
        nw = native_bbox[2] - native_bbox[0]
        nh = native_bbox[3] - native_bbox[1]
        scale = min(nw / authored.width, nh / authored.height)
        if id == "HARV":
            # Keep the earlier raw-pixel scale so enlarging the bin is not canceled
            # by fitting the enlarged whole vehicle back into the old bounding box.
            scale = previous["families"][id]["samples"][i]["uniformScale"]
        if id == "APOC":
            scale *= 1.06
        density = 4
        scaled = (
            authored.convert("RGBa")
            .resize(
                (
                    max(1, round(authored.width * scale * density)),
                    max(1, round(authored.height * scale * density)),
                ),
                Image.Resampling.LANCZOS,
            )
            .convert("RGBA")
        )
        canvas = Image.new("RGBA", (size[0] * density, size[1] * density))
        if retained_shadow is not None:
            canvas.alpha_composite(retained_shadow.resize(canvas.size, Image.Resampling.NEAREST))
        anchor = [
            round(((native_bbox[0] + native_bbox[2]) / 2) * density - scaled.width / 2),
            round(native_bbox[3] * density - scaled.height),
        ]
        canvas.alpha_composite(scaled, tuple(anchor))
        original.save(out / id / f"{i}-original.png")
        canvas.save(out / id / f"{i}-candidate.png")
        authored.save(out / id / f"{i}-detail.png")
        entry["samples"].append(
            {
                "index": i,
                "label": label,
                "nativeFrame": cell.get("nativeFrame"),
                "heading": cell.get("heading"),
                "role": cell.get("role"),
                "nativeCanvas": size,
                "displayScale": display_scale,
                "density": density,
                "generatedCrop": box,
                "authoredBounds": bb,
                "nativeBounds": native_bbox,
                "uniformScale": scale,
                "visualScaleAdjustment": 1.06 if id == "APOC" else 1,
                "registrationPolicy": (
                    "prior candidate raw-pixel scale"
                    if id == "HARV"
                    else "body-only native bounds" if id == "YURIPR" else "native bounds"
                ),
                "shadowEvidence": (
                    "Native visible-frame index-12 pixels outside color-body bounds retained; separate shadow frame is empty. Static review only."
                    if id == "YURIPR"
                    else "Full native shadow composition pending runtime integration."
                ),
                "anchorAt4x": anchor,
                "matte": method,
                "noSilhouetteMask": True,
                "effectiveSourceDensity": 1 / scale,
                "files": {
                    r: {
                        "path": str(out / id / f"{i}-{r}.png"),
                        "sha256": hashfile(out / id / f"{i}-{r}.png"),
                    }
                    for r in ["original", "candidate", "detail"]
                },
            }
        )
    report["families"][id] = entry
(out / "manifest.json").write_text(json.dumps(report, indent=2) + "\n")
print(
    "Exported",
    len(report["families"]),
    "families,",
    sum(len(f["samples"]) for f in report["families"].values()),
    "representative positions; 0 complete runtime packs",
)
