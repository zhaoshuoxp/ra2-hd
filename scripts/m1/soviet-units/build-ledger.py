"""Resumable representative checkpoint. Existing user decisions are never inferred."""

import json, hashlib, sys
from pathlib import Path

checkpoint = Path(".artifacts/m1-7/ledger.json")
if checkpoint.exists():
    previous = json.loads(checkpoint.read_text())
    untouched = (
        previous.get("stage") == "GROUPED_REPRESENTATIVES"
        and previous.get("finalAcceptance") == "PENDING"
        and all(
            value == "PENDING" for value in previous.get("representativeDecisions", {}).values()
        )
        and all(
            family.get("representativeAcceptance") in ("PENDING", "PRESERVED")
            and all(value == "NOT RUN" for value in family.get("requiredStates", {}).values())
            for family in previous.get("families", {}).values()
        )
    )
    if "--refresh-pending" not in sys.argv or not untouched:
        raise SystemExit(
            "Existing checkpoint preserved. Only an untouched pending checkpoint can use --refresh-pending; update accepted production ledgers incrementally."
        )
root = Path(".artifacts/m1-7")
inv = json.loads((root / "source-v3/inventory.json").read_text())
exports = json.loads((root / "review-exports-v3/manifest.json").read_text())
audit = json.loads((root / "rules-audit.json").read_text())
groups = {
    "infantry": "SENGINEER DOG FLAKT SHK IVAN YURI TERROR DESO CIVAN YURIPR".split(),
    "ground": "HARV SMCV HTK DRON V3 APOC TTNK DTRUCK".split(),
    "air-naval": "ZEP SAPC SUB HYD DRED SQD".split(),
}
risks = {
    "SENGINEER": [
        "walk",
        "enter/capture/repair/removal",
        "Allied ENGINEER isolation",
        "captured-owner remap",
    ],
    "DOG": ["run", "leap/attack", "death", "hidden-state disposal"],
    "FLAKT": ["walk", "ground/air targeting", "fire", "death"],
    "SHK": ["walk", "ground firing", "Tesla charging", "death"],
    "IVAN": ["walk", "attach explosive", "native detonation", "death"],
    "CIVAN": [
        "native teleport/hide/reappear",
        "attach explosive",
        "native detonation",
        "stolen Allied technology acquisition",
    ],
    "YURI": ["walk", "mind control", "ownership transfer/remap", "deploy psi", "death/release"],
    "YURIPR": [
        "mind control",
        "ownership transfer/remap",
        "deploy psi",
        "death/release",
        "stolen Soviet technology and build limit",
    ],
    "DESO": ["walk", "fire", "deploy/radiation", "undeploy", "death"],
    "TERROR": ["walk", "suicide attack", "native detonation/removal"],
    "HARV": [
        "harvest",
        "turret combat",
        "loaded/unloading HORV transition",
        "refinery docking",
        "credit deposit",
    ],
    "SMCV": ["move", "deploy to NACNST", "legal native repack only when enabled"],
    "HTK": ["move", "independent aim/fire", "passenger embark/disembark", "transport visibility"],
    "DRON": ["walk", "leap/infect", "hidden inside host", "host/removal cleanup"],
    "V3": [
        "move",
        "loaded/empty V3WO body",
        "native V3ROCKET launch/flight",
        "reload",
        "destruction",
    ],
    "APOC": ["move", "independent turret and twin barrels", "ground/air weapons", "destruction"],
    "TTNK": ["move", "independent Tesla aim/fire", "destruction"],
    "DTRUCK": ["move", "death/detonation", "cleanup", "civilian TRUCKA isolation"],
    "ZEP": ["flight altitude", "movement", "bombing", "ground shadow", "crash/fall/removal"],
    "SAPC": ["water/shore/land movement", "load/unload", "bridge restrictions", "destruction"],
    "SUB": [
        "naval movement",
        "submerged concealment",
        "surfacing/torpedo attack",
        "waterline",
        "sinking",
    ],
    "HYD": ["naval movement", "ground/air target fire", "waterline/visibility", "sinking"],
    "DRED": [
        "naval movement",
        "loaded/empty DREDWO body",
        "DMISL launch/flight",
        "water/depth/shadow",
        "sinking",
    ],
    "SQD": [
        "swimming",
        "submerged concealment",
        "attack/grapple",
        "SQDG host-attached animation",
        "host/death/removal",
    ],
}
notes = {
    "SENGINEER": [
        "Representative retains painted dark foot/death patches; production must preserve native shadows without adding a second shadow."
    ],
    "DOG": [
        "Attack/leap anatomy and duplicate native-frame consistency need review; no continuous canine animation is authored."
    ],
    "SHK": ["Revision 2 corrects duplicate death helmet. Only six poses are represented."],
    "DRON": [
        "Revision 1 attack offsets were wrong. Revision 2 uses 68/70/71; leg topology and phase continuity still need review."
    ],
    "SQD": [
        "Revision 1 attack offsets were wrong. Revision 2 uses 216/218/219. SQDG grapple member is inventoried but not authored."
    ],
    "V3": [
        "V3ROCKET is decoded and captured separately but flight artwork and launch motion are not authored."
    ],
    "DRED": [
        "DMISL is decoded and captured separately but flight artwork and launch motion are not authored."
    ],
    "YURIPR": [
        "Original RA2 SHP identity, not the Yuri's Revenge hover-chair design. Natural stolen-tech acquisition remains unverified."
    ],
    "CIVAN": ["Natural stolen-tech acquisition and teleport gameplay remain unverified."],
    "HARV": [
        "Revision 2 replaces the closed cargo roof with an open ore-filled hopper, as requested. The user permits a uniform ore-filled top if dynamic load stages are impractical. Empty/partial/full runtime visuals, turret and docking continuity remain unverified."
    ],
    "DTRUCK": [
        "TRUCKA also serves unrelated rules identities; a filename-only override is prohibited."
    ],
    "SMCV": [
        "NACNST artwork belongs to the building task. This branch contains only its committed revision-2 baseline."
    ],
}
ledger = {
    "schema": 1,
    "milestone": "M1.7",
    "status": "VISUAL_REVIEW_PENDING",
    "stage": "GROUPED_REPRESENTATIVES",
    "scope": groups,
    "base": inv["baseline"],
    "branch": "m1-7-soviet-units",
    "worktree": str(Path.cwd()),
    "upstreamIntegrations": [],
    "pendingUpstream": "Active uncommitted building corrections and remaining-building work are excluded. Merge only later committed checkpoints into this branch; never merge into the dirty main worktree.",
    "counts": inv["count"],
    "completeNewFamilies": 0,
    "newRuntimeActivation": False,
    "representativeDecisions": {g: "PENDING" for g in groups},
    "finalAcceptance": "PENDING",
    "families": {},
    "exclusions": inv["excluded"],
    "missingRegistrySections": inv["missingSections"],
    "ruleAudit": audit["status"],
    "sourceInputs": inv["inputs"],
    "baselineResourceReceipt": "baseline-resources.json",
    "authoringTool": "built-in image_gen only",
    "fullResourceDelivery": "PENDING_REPRESENTATIVE_APPROVAL",
    "combinedMacApp": "PENDING_REPRESENTATIVE_APPROVAL",
    "preservedControls": ["E2", "HTNK"],
}
for f in inv["families"]:
    id = f["id"]
    members = list(
        dict.fromkeys(
            f["members"]
            + [m for c in f["children"] for m in c["members"]]
            + [a["member"] for a in f["attachments"]]
        )
    )
    source_members = []
    estimate = {2: 0, 4: 0}
    for m in members:
        a = inv["assets"][m]
        row = {k: a[k] for k in ["member", "archive", "sha256"]}
        if m.endswith(".shp"):
            has_shadow = (
                f["rules"].get("NoShadow", "no").lower() != "yes"
                and f["art"].get("Shadow", "yes").lower() != "no"
            )
            if m == "sqdg.shp":
                has_shadow = f["attachments"][0]["art"].get("Shadow", "no").lower() == "yes"
            count = a["totalFrames"] // 2 if has_shadow else a["totalFrames"]
            frames = a["frames"][:count]
            row.update(
                nativeCanvas=a["canvas"],
                totalFrames=a["totalFrames"],
                requiredSlots=count,
                requiredNonempty=sum(not x["empty"] for x in frames),
                originalShadowSlots=a["totalFrames"] - count,
                frames=frames,
            )
            for density in estimate:
                estimate[density] += sum(
                    (x["width"] + x["width"] % 2)
                    * (x["height"] + x["height"] % 2)
                    * density
                    * density
                    * 8
                    for x in frames
                )
        else:
            row["sections"] = a.get("sections")
        source_members.append(row)
    state = "PRESERVED_ACCEPTED_CONTROL" if f["acceptedControl"] else "VISUAL_REVIEW_PENDING"
    ledger["families"][id] = {
        **f,
        "status": state,
        "group": next((g for g, ids in groups.items() if id in ids), "accepted-controls"),
        "bindingContract": {
            "rulesIdentity": id,
            "resolvedArt": f["image"],
            "sourceMemberHashes": {a["member"]: a["sha256"] for a in source_members},
            "sequence": f["sequence"],
            "theaters": ["TEMPERATE", "SNOW", "URBAN"],
            "ownerPolicy": "Rules identity follows captured unit; current faction is never the identity gate. Native owner palette ramp governs remap.",
        },
        "sourceMembers": source_members,
        "requiredStates": {s: "NOT RUN" for s in risks.get(id, [])},
        "representationCoverage": (
            "SHP native sequence slots"
            if f["representation"] == "SHP"
            else "Independent native VXL/HVA components, yaw, pitch/roll and mechanism states"
        ),
        "artwork": exports["families"].get(id),
        "activation": "PRESERVED_OPTIONAL" if f["acceptedControl"] else "ORIGINAL",
        "complete": False if not f["acceptedControl"] else None,
        "representativeAcceptance": "PENDING" if not f["acceptedControl"] else "PRESERVED",
        "blockers": (
            []
            if f["acceptedControl"]
            else [
                "VISUAL_REVIEW_PENDING: grouped decision required before full expansion",
                "Full authoring, remap, complete-family routing and native gameplay tests not yet executed",
            ]
        ),
        "candidateNotes": notes.get(id, []),
        "upstreamGameplay": "UNVERIFIED; no upstream blocker inferred from missing tests",
        "memory": {
            "rgbaBasePlusDataTrimEstimateBytes": estimate,
            "estimateOnly": True,
            "atlasAndGpuUpload": "NOT MEASURED",
            "voxelComponentAtlas": "NOT AUTHORED" if f["representation"] == "VXL/HVA" else None,
        },
        "testEvidence": {
            "rules": "rules-audit.json",
            "source": "source-v3/inventory.json",
            "originalVxlReferences": (
                "runtime-references-v3/result.json" if f["representation"] == "VXL/HVA" else None
            ),
            "nativeHdGameplay": "NOT RUN",
        },
    }
ledger["memoryPolicy"] = {
    "inheritedOptionalTextureCapBytes": 256 * 1024**2,
    "baselineCommittedAllSelectedBytes": 258507328,
    "baselineHistoricalHeadroomBytes": 256 * 1024**2 - 258507328,
    "baselineMeasurementSource": "docs/m1-6b-soviet-building-batch.md; historical, not a new measurement",
    "newRuntimeAllocatedBytes": 0,
    "newShpTrimEstimateBytes": {
        str(d): sum(
            f["memory"]["rgbaBasePlusDataTrimEstimateBytes"][d]
            for f in ledger["families"].values()
            if not f["acceptedControl"]
        )
        for d in [2, 4]
    },
    "decision": "No all-family preload or cap increase. After approval, implement and measure bounded demand loading with immutable shared ownership, preserve accepted controls, complete-family Original until fully loaded. SHP 4x/2x only after actual packing; VXL densities must be authored and measured independently.",
    "combinedPeak": "NOT RUN",
    "instanceGeometryAndDrawCost": "NOT MEASURED",
}
ledger["userFeedback"] = [json.loads((root / "harv-feedback.json").read_text())]
(root / "ledger.json").write_text(json.dumps(ledger, indent=2) + "\n")
print("Ledger saved:", len(ledger["families"]), "identities; no new completion claims")
