"""Survey every selected building's native construction phases at both densities."""
import argparse
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from buildup import native_indices, read, sha, unpack, write


def selected_jobs(reference):
    jobs = []
    for side in ("allied", "soviet", "yuri"):
        catalog = read(reference / f"desktop/{side}-building-coverage.json")
        jobs.extend({"side": side, "key": key, "entry": entry} for key, entry in catalog.items())
    profile = (reference / "desktop/hd-profile.mjs").read_text()
    power_paths = dict(re.findall(r"(\w+): '([^']+)'", profile.split("export const powerPlantFamilyPaths = ")[1].split(";")[0])) if "export const powerPlantFamilyPaths = " in profile else {}
    revisions = dict(re.findall(r"(\w+): '([^']+)'", profile.split("export const sovietBatchRevisions = ")[1].split(";")[0]))
    for slug, revision in revisions.items():
        jobs.append({"side": "legacy", "key": slug, "entry": {"family": slug.upper(), "theater": "TEMPERATE",
            "familyPath": f"hd-packs/soviet-{slug}-authored/{revision}/family.json"}})
    jobs.append({"side": "power", "key": "napowr", "entry": {"family": "NAPOWR", "theater": "TEMPERATE",
        "familyPath": power_paths.get("napowr", "hd-packs/soviet-power-plant-authored/owner-r3/family.json")}})
    jobs.append({"side": "power", "key": "gapowr", "entry": {"family": "GAPOWR", "theater": "TEMPERATE",
        "familyPath": power_paths.get("gapowr", "hd-packs/power-plant-authored/owner-r3/family.json")}})
    return jobs


def iou(a, b):
    union = np.count_nonzero(a | b)
    return float(np.count_nonzero(a & b) / union) if union else 1.0


def survey(args):
    args.output.mkdir(parents=True, exist_ok=False)
    sources = [(args.source_root / side, read(args.source_root / side / "inventory.json"))
        for side in ("allied", "soviet", "yuri")]
    previous = {f["key"] for f in read(args.previous)["families"]}
    report = {"schema": "all-building-buildup-survey-v1", "reference": str(args.reference),
        "previousAuthoringSha256": sha(args.previous), "boundary": "All selected resources; every native phase; visual inspection follows metrics",
        "sourceInventories": [{"path": str(root / "inventory.json"), "sha256": sha(root / "inventory.json")} for root, _ in sources],
        "sequences": [], "withoutBuildup": []}
    for job in selected_jobs(args.reference):
        if args.keys and job["key"] not in args.keys:
            continue
        side, key, entry = job["side"], job["key"], job["entry"]
        family_path = args.reference / ".local" / entry["familyPath"]
        family = read(family_path)
        if "familyHash" in entry:
            assert sha(family_path) == entry["familyHash"]
        members = [m for m in family["members"] if m["member"].endswith("mk.shp")]
        if not members:
            report["withoutBuildup"].append({**job, "status": "NO_SELECTED_MK_MEMBER", "familySha256": sha(family_path)})
            continue
        assert len(members) == 1
        binding = members[0]
        folder = args.reference / ".local/hd-packs" / binding["packId"] / binding["revision"]
        manifest = read(folder / "manifest.json")
        assert sha(folder / "manifest.json") == binding["sha256"]
        source, inventory, native_row = next((s, inv, r) for s, inv in sources for r in inv["matrix"]
            if r["id"] == entry["family"] and r["theater"] == entry["theater"] and any(
                m["source"]["sha256"] == manifest["source"]["sha256"] and "BUILDUP" in m["roles"] for m in r["members"]))
        raw_path = source / "members" / (manifest["source"]["sha256"] + ".json")
        raw = read(raw_path)
        count = len(manifest["logical"]["frames"])
        palette = np.array(native_row["palette"]["colors"], np.uint8)
        w, h = raw["canvas"]
        row = {**job, "identity": entry["family"], "theater": entry["theater"], "frames": count,
            "familySha256": sha(family_path), "member": binding, "nativeSource": str(raw_path), "nativeSourceSha256": sha(raw_path),
            "editions": sorted({r["edition"] for s, inv in sources for r in inv["matrix"]
                if r["id"] == entry["family"] and r["theater"] == entry["theater"] and any(
                    m["source"]["sha256"] == manifest["source"]["sha256"] and "BUILDUP" in m["roles"] for m in r["members"])}),
            "priorRepair": key in previous, "phases": []}
        exports = args.output / "frames" / key
        exports.mkdir(parents=True)
        cell_w, cell_h, columns = max(180, w), h + 28, 6
        sheet = Image.new("RGB", (cell_w * columns, cell_h * 2 * ((count + columns - 1) // columns)), "#34483d")
        draw = ImageDraw.Draw(sheet)
        for n in range(count):
            indices = native_indices(raw, n)
            native_mask = indices > 0
            original = Image.fromarray(np.dstack([palette[indices], np.uint8(native_mask) * 255]))
            original.save(exports / f"{n:02}-original.png")
            for density in (2, 4):
                base = unpack(folder, manifest, density, n)
                data = unpack(folder, manifest, density, n, "data")
                Image.fromarray(base).save(exports / f"{n:02}-{density}x-before.png")
                # Area reduction makes authored antialias fringes distinct from missing structures.
                alpha = base[..., 3].reshape(h, density, w, density).mean(axis=(1, 3)) / 255
                owner = ((base[..., 3].astype(float) * data[..., 0] / 255)
                    .reshape(h, density, w, density).mean(axis=(1, 3)) / 255) >= .5
                source_owner = (indices >= 16) & (indices <= 31)
                reference = np.repeat(np.repeat(native_mask, density, axis=0), density, axis=1)
                row["phases"].append({"phase": n, "density": density, "terminal": n == count - 1,
                    "coverageIoU": iou(alpha >= .5, native_mask), "ownerIoU": iou(owner, source_owner),
                    "exactCoverage": bool(np.array_equal(base[..., 3] > 0, reference)),
                    "nativeArea": int(native_mask.sum()), "hdArea": float(alpha.sum()),
                    "emptyOriginal": not bool(native_mask.any()), "emptyHD": not bool((alpha >= .5).any())})
                if density == 4:
                    for label, image, offset in (("Original", original, 0), ("Before", Image.fromarray(base).resize((w, h), Image.Resampling.LANCZOS), 1)):
                        x, y = n % columns * cell_w, (n // columns * 2 + offset) * cell_h
                        sheet.paste(image, (x + (cell_w - w) // 2, y + 28), image)
                        draw.text((x + 6, y + 4), f"{label} {n:02}", fill="white", font_size=18)
        checks = [p for p in row["phases"] if not p["terminal"]]
        row["minimumCoverageIoU"] = min(p["coverageIoU"] for p in checks)
        row["meanCoverageIoU"] = sum(p["coverageIoU"] for p in checks) / len(checks)
        row["minimumOwnerIoU"] = min(p["ownerIoU"] for p in checks)
        row["emptyPhaseMismatch"] = any(p["emptyOriginal"] != p["emptyHD"] for p in checks)
        row["status"] = "RETAIN_PRIOR_REPAIR" if row["priorRepair"] else "REQUIRES_VISUAL_REVIEW"
        row["exportsPath"] = str(exports)
        row["contactSheet"] = str(args.output / f"{key}-contact.png")
        sheet.save(row["contactSheet"])
        report["sequences"].append(row)
        write(args.output / "survey.json", report)
        print(key, count, f"min IoU={row['minimumCoverageIoU']:.3f}", f"owner={row['minimumOwnerIoU']:.3f}", row["status"], flush=True)
    report.update(selectedSequences=len(report["sequences"]), identities=sorted({r["identity"] for r in report["sequences"]}),
        densityFrames=sum(len(r["phases"]) for r in report["sequences"]), selectedWithoutBuildup=len(report["withoutBuildup"]),
        status="COMPLETE_PHASE_METRICS_PENDING_VISUAL_REVIEW")
    write(args.output / "survey.json", report)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--previous", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--keys", nargs="+", help="Explicit supplementary selections; full survey is the default")
    survey(parser.parse_args())
