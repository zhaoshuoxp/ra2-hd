"""Pin incremental native evidence and copied representative resource delivery."""
import csv
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

root = Path.cwd()
inventory_path, receipt_path, output = map(Path, sys.argv[1:4])
output.mkdir(parents=True, exist_ok=False)


def read(path):
    return json.loads(Path(path).read_text())


def pin(path):
    path = Path(path).resolve()
    return {"path": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def save(name, value):
    with (output / name).open("x") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")


catalog = read("src/offline/officialSkirmishCatalog.json")["maps"]
audit = {row["mapId"]: row for row in read(".artifacts/m2-4/source-audit-v3/audit.json")["maps"]}
evidence = read(".artifacts/m2-4/native-evidence-v3.json")
native = {row["mapId"]: row for row in evidence["maps"]}
inventory = read(inventory_path)
receipt = read(receipt_path)
resources = Path(receipt["resources"])
reports = {}
for record in native.values():
    for key in ("evidence", "structuralEvidence", "representativeNativeFailure"):
        if record.get(key):
            reports[record[key]] = pin(record[key])
ledger = []
for entry in catalog:
    source, observed = audit[entry["mapId"]], native[entry["mapId"]]
    assert source["source"]["sha256"] == entry["source"]["sha256"] == observed["sourceSha256"]
    rules = source.get("ruleOverrides", {})
    modes = entry["originalModes"]
    ambiguity = entry["source"]["sha256"].startswith("a4f07f9b9271")
    ledger.append({
        "mapId": entry["mapId"], "edition": entry["edition"], "theater": source["theater"],
        "source": entry["source"], "runtimeName": entry["runtimeName"],
        "originalModes": modes, "modeProvenance": entry["modeProvenance"],
        "selectedCatalogSource": entry["selected"], "starts": entry["starts"], "maxSlots": entry["maxSlots"],
        "declaredMaxSlots": entry.get("declaredMaxSlots"), "menuSelectable": entry["starts"] >= 2,
        "adaptation": "STANDARD_INI_AND_OPTIONS_WITH_ORIGINAL_MAP_MECHANISMS",
        "legacyLabelAdmissionChanged": bool(modes and "standard" not in modes),
        "restoredMapSection": "MultiplayerDialogSettings" if "MultiplayerDialogSettings" in rules else None,
        "preservedMapRuleSections": sorted(name for name in rules if name != "MultiplayerDialogSettings"),
        "nativeStatus": observed["status"], "nativeEvidence": observed.get("evidence"),
        "structuralEvidence": observed.get("structuralEvidence"),
        "ruleClassification": "PENDING_UNIT_START_CLASSIFICATION" if ambiguity else "REVIEWED_PRESERVED_MAP_MECHANISMS",
    })
save("mode-adaptation.json", {"schema": "m2-4-unified-skirmish-adaptation-v1", "maps": ledger})
with (output / "mode-adaptation.csv").open("x", newline="") as stream:
    columns = ["mapId", "theater", "runtimeName", "originalModes", "starts", "maxSlots", "menuSelectable",
               "legacyLabelAdmissionChanged", "restoredMapSection", "nativeStatus", "ruleClassification"]
    writer = csv.DictWriter(stream, fieldnames=columns)
    writer.writeheader()
    for row in ledger:
        values = {key: row[key] for key in columns}
        values["originalModes"] = ",".join(values["originalModes"])
        writer.writerow(values)

files = []


def copied(relative, expected=None):
    local, delivered = root / ".local" / relative, resources / relative
    a, b = pin(local), pin(delivered)
    assert a["sha256"] == b["sha256"], relative
    assert expected is None or a["sha256"] == expected, relative
    files.append({"relative": str(relative), "source": a, "delivered": b, "bytes": delivered.stat().st_size})


for kind in ("terrain", "environment"):
    pointer_name = Path(f"{kind}-snow-selection.json")
    copied(pointer_name)
    pointer = read(root / ".local" / pointer_name)
    pack_root = Path(f"{kind}-packs") / pointer["revision"]
    copied(pack_root / "manifest.json", pointer["sha256"])
    pack = read(resources / pack_root / "manifest.json")
    assert pack["theater"] == "SNOW"
    if kind == "terrain":
        for group in pack["groups"]:
            assert [v["density"] for v in group["variants"]] == [2, 4]
            for variant in group["variants"]:
                copied(pack_root / variant["file"], variant["sha256"])
    else:
        for family in pack["families"].values():
            for member in family["members"]:
                member_path = pack_root / member["path"]
                copied(member_path, member["sha256"])
                manifest = read(resources / member_path)
                assert [v["density"] for v in manifest["variants"]] == [2, 4]
                for variant in manifest["variants"]:
                    for page in variant["pages"]:
                        for channel in ("base", "data"):
                            assert page[channel] == f"{variant['density']}-{page['id']}-{channel}.png"
                            copied(member_path.parent / str(variant["density"]) / page["id"] / f"{channel}.png",
                                   page[channel + "Sha256"])
snow_reports = {}
for density in (2, 4):
    report_path = Path(f".artifacts/m2-4/native-snow-{density}x-v1/report.json")
    report = read(report_path)
    assert report["status"] == "PASS_SELECTED_NATIVE_CASES" and not report["errors"]
    assert report["combinedWorldAllocation"]["total"] <= report["combinedWorldAllocation"]["limit"]
    snow_reports[str(density)] = {**pin(report_path), "worldAllocation": report["combinedWorldAllocation"],
                                  "nativeBindings": len(report["newNativeBindings"])}
native_counts = dict(Counter(row["nativeStatus"] for row in ledger))
options_path = Path(".artifacts/m2-4/native-options-v4/report.json")
options = read(options_path)
assert options["status"] == "PASS_SELECTED_NATIVE_CASES" and not options["errors"]
counts = {
    **inventory["counts"], "editionSourceEntries": len(catalog),
    "distinctMapSources": len({(m["source"]["archive"], m["source"]["member"], m["source"]["sha256"]) for m in catalog}),
    "distinctMapByteStreams": len({m["source"]["sha256"] for m in catalog}),
    "declaredModeVariants": sum(len(m["originalModes"]) for m in catalog),
    "sourcesWithoutCatalogModeDeclaration": sum(not m["originalModes"] for m in catalog),
    "menuSelectable": sum(row["menuSelectable"] for row in ledger),
    "nativeVerified": sum("PASS" in row["nativeStatus"] or "REUSED" in row["nativeStatus"] for row in ledger),
    "nativeStatuses": native_counts,
}
save("receipt.json", {
    "schema": "m2-4-checkpoint-2-v1", "status": "TECHNICAL_REPRESENTATIVES_PASSED_VISUAL_DIRECTION_PENDING",
    "m2_4Complete": False, "fullSnowComplete": False, "userAccepted": False, "windows": "NOT_RUN",
    "mainBaseline": "a5d7b86c3721511ec6c054a52dd3cdb0f7450c02",
    "runtimeSourceHead": receipt["runtimeSourceHead"], "catalog": pin("src/offline/officialSkirmishCatalog.json"),
    "inventory": pin(inventory_path), "nativeEvidence": pin(".artifacts/m2-4/native-evidence-v3.json"),
    "counts": counts, "theaters": inventory["theaters"], "nativeReports": list(reports.values()),
    "snowNative": snow_reports, "package": pin(receipt_path), "app": receipt["app"], "resources": str(resources),
    "customOptionsNative": pin(options_path),
    "profile": receipt["profile"], "newCopiedResourceFiles": files,
    "review": pin(receipt_path.parent / "Review" / "review-manifest.json"),
    "reviewUi": pin(".artifacts/m2-4/review-ui-v2.json"),
    "remaining": ["SNOW full resource production and visual acceptance", "URBAN representatives and full production",
                  "NEWURBAN and DESERT representatives and full production", "Four original archive structure failures",
                  "mp13s4mw unit-start classification", "Full coverage and affected integration validation"],
    "boundary": "A source merge alone omits ignored art. Preserve the copied sibling resources and profile. Main integration awaits visual acceptance.",
})
print(json.dumps({"counts": counts, "copiedNewResourceFiles": len(files)}))
