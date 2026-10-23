"""Pin the complete roster, repair selection and source/theater audit ledger."""
import argparse
import csv
import re
from pathlib import Path

from buildup import read, sha, write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("survey", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--repairs", type=Path, nargs="+", required=True)
parser.add_argument("--previous", type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
survey = read(args.survey / "complete-survey.json")
before = {s["key"]: s for s in survey["sequences"]}
previous = read(args.previous)
families = [*previous["families"]]
for file in args.repairs:
    families.extend(read(file)["families"])
assert len({f["key"] for f in families}) == len(families) == len(before)
catalogs = {side: read(f"desktop/{side}-building-coverage.json") for side in ("allied", "soviet", "yuri")}
profile_file = Path("desktop/hd-profile.mjs")
profile = profile_file.read_text()
ledger = []
for family in families:
    s = before[family["key"]]
    assert sha(family["newFamilyPath"]) == family["newFamilySha256"]
    manifest = Path(".local/hd-packs") / family["newMember"]["packId"] / family["newMember"]["revision"] / "manifest.json"
    assert sha(manifest) == family["newMember"]["sha256"]
    family["editions"] = s["editions"]
    if family["side"] == "legacy":
        key = family["key"]
        start = profile.index("export const sovietBatchRevisions = ")
        end = profile.index(";", start)
        profile = profile[:start] + re.sub(rf"({key}: ')[^']+(')",
            rf"\g<1>{family['newMember']['revision']}\2", profile[start:end]) + profile[end:]
        profile = re.sub(rf"({key}: ')[a-f0-9]{{64}}(')", rf"\g<1>{family['newFamilySha256']}\2", profile)
    elif family["side"] == "power":
        key = "powerPlant" if family["key"] == "gapowr" else "napowr"
        profile = re.sub(rf"({key}: ')[a-f0-9]{{64}}(')", rf"\g<1>{family['newFamilySha256']}\2", profile)
        profile = profile.replace(s["entry"]["familyPath"], Path(family["newFamilyPath"]).relative_to(".local").as_posix())
    else:
        catalogs[family["side"]][family["key"]].update(
            familyPath=Path(family["newFamilyPath"]).relative_to(".local").as_posix(), familyHash=family["newFamilySha256"])
    ledger.append({"key": family["key"], "identity": family["identity"], "theater": family["theater"],
        "editions": s["editions"], "frames": family["frames"], "priorRepair": s["priorRepair"],
        "minimumBeforeCoverageIoU": s["minimumCoverageIoU"], "minimumBeforeOwnerIoU": s["minimumOwnerIoU"],
        "repairMode": "RETAIN_PRIOR_REPAIR" if s["priorRepair"] else family["repairMode"],
        "newMemberSha256": family["newMember"]["sha256"], "contactSheet": s["contactSheet"]})
for side, catalog in catalogs.items():
    write(f"desktop/{side}-building-coverage.json", catalog)
profile_file.write_text(profile)
write(args.output / "authoring.json", {**previous, "scope": "ALL_SELECTED_BUILDUP_SEQUENCES", "revision": "full-survey-20261011-r8",
    "priorRepairSequencesRetained": len(previous["families"]), "newlyCorrectedSequences": len(families) - len(previous["families"]),
    "families": families})
write(args.output / "findings.json", {"status": "ALL_SELECTED_PHASES_SURVEYED_AND_REPAIRED_PENDING_VALIDATION", "ledger": ledger,
    "withoutBuildup": survey["withoutBuildup"], "surveySha256": sha(args.survey / "complete-survey.json")})
with (args.output / "findings.csv").open("w", newline="") as stream:
    writer = csv.DictWriter(stream, fieldnames=list(ledger[0]))
    writer.writeheader()
    writer.writerows(ledger)
roster = read(args.survey / "retail-roster.json")
source_rows = [r for side in ("allied", "soviet", "yuri")
    for r in read(f".artifacts/buildup-source-20261011/{side}/inventory.json")["matrix"]]
selected_names = {f["identity"] for f in families}
for edition, data in roster["editions"].items():
    for row in data["rows"]:
        if not row.get("buildup"):
            row["surveyDisposition"] = row["status"]
        elif row["id"] in selected_names:
            row["surveyDisposition"] = "ALL_SELECTED_HD_MK_PHASES_AUDITED_SOURCE_GUIDED_ORIGINAL_FALLBACK_FOR_UNSELECTED_THEATERS"
        elif row["id"] == "AMRADR":
            row["surveyDisposition"] = "EXACT_SHARED_GAAIRC_FAMILY_AND_MK_SOURCE_NATIVE_ALIAS_CHECK_REQUIRED"
        elif row["id"] == "YADEPT":
            row["surveyDisposition"] = "ORIGINAL_RETAINED_NATIVE_TECHLEVEL_15_NOT_STANDARD_SKIRMISH_PRODUCTION"
        else:
            row["surveyDisposition"] = "ORIGINAL_RETAINED_NON_PRODUCTION_NO_SELECTED_HD_MK"
    assert all(row["surveyDisposition"] for row in data["rows"])
write(args.output / "complete-retail-roster.json", roster)
cells = []
for row in source_rows:
    buildup = next((m for m in row["members"] if "BUILDUP" in m["roles"]), None)
    cells.append({"edition": row["edition"], "theater": row["theater"], "identity": row["id"],
        "sourceSha256": buildup["source"]["sha256"] if buildup else None,
        "status": "NATIVE_MK_SOURCE_ACCOUNTED" if buildup else "NO_NATIVE_MK",
        "exactSelectedMK": [f["key"] for f in families if f["identity"] == ("GAAIRC" if row["id"] == "AMRADR" else row["id"])
            and buildup and read(f["nativeSource"])["source"]["sha256"] == buildup["source"]["sha256"]]})
write(args.output / "edition-theater-sources.json", {"cells": cells,
    "boundary": "Matching MK alone does not establish complete-family HD eligibility; other members may require Original fallback"})
print("COMPLETE_SURVEY_SELECTION", len(families), "sequences", sum(f["frames"] * 2 for f in families), "density frames")
