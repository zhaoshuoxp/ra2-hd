"""Pack construction rigs with explicit authored layers and immutable foundations."""
import argparse
import copy
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import native_indices, pack_flat, pack_variant, read, retain_turret_dependencies, sha, unpack, write
from painted_motion import reduce_material
from painted_rig import encode_owner, over, place


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("authoring", type=Path)
    parser.add_argument("rigs", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--accepted-authoring", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    authoring = read(args.authoring)
    rigs = read(args.rigs)
    storage_sources = read('desktop/construction-storage-sources.json')['entries']
    checks = []
    for key, rig in rigs.items():
        assert not rig.get('unselectedGeometryViolations'), 'Diagnostic rigs cannot be registered'
        record = next(f for f in authoring["families"] if f["key"] == key)
        old_binding = record["newMember"]
        old_root = Path(".local/hd-packs") / old_binding["packId"] / old_binding["revision"]
        previous = read(old_root / "manifest.json")
        raw = read(record["nativeSource"])
        source = previous['source']
        pooled_storage = rig.get('losslessTilePool') and any(
            entry['member'] == source['member'] and entry['sha256'] == source['sha256']
            and entry['theater'] == source['theater'] and entry['canvas'] == previous['logical']['canvas']
            and entry['frames'] == len(previous['logical']['frames']) for entry in storage_sources)
        assert rig["nativeSourceSha256"] == sha(record["nativeSource"])
        assert len(rig["phases"]) == record["frames"]
        exports = args.output / "frames" / key
        exports.mkdir(parents=True)
        palette = np.array(record["palette"], np.uint8)
        full = []
        retained_phases = set()
        for phase, nodes in enumerate(rig["phases"]):
            if isinstance(nodes, dict) and nodes.get("retainPredecessor"):
                full.append([unpack(old_root, previous, 4, phase, role) for role in ("base", "data")])
                retained_phases.add(phase)
                continue
            painted = np.zeros((raw["canvas"][1] * 4, raw["canvas"][0] * 4, 4), np.uint8)
            for node in nodes:
                assert sha(node["image"]) == node["sha256"]
                source = Image.open(node["image"]).convert("RGBA")
                layer = place(source, node["box"], raw["canvas"])
                painted = over(layer, painted)
            indices = native_indices(raw, phase)
            # Reddish neutral weathering stays fixed until owner paint exists.
            pair = encode_owner(painted, palette, allow_owner=((indices >= 16) & (indices <= 31)).any())
            frame = previous["logical"]["frames"][phase]
            x, y = [v * 4 for v in frame["trimOrigin"]]
            w, h = [v * 4 for v in frame["trimSize"]]
            outside = pair[0][..., 3].copy()
            outside[y:y+h, x:x+w] = 0
            assert not outside.any(), (key, phase, "Authored coverage outside retained logical render bounds")
            full.append(pair)
            Image.fromarray(painted).save(exports / f"{phase:02}-painted-canvas.png")
            for role, array in zip(("base", "data"), pair):
                Image.fromarray(array).save(exports / f"{phase:02}-4x-{role}-canvas.png")
        new_root = old_root.parent / args.revision
        new_root.mkdir(exist_ok=False)
        manifest = copy.deepcopy(previous)
        manifest.update(packRevision=args.revision, paintedBuildup={
            "mode": "PAINTED_HD_RGB_NO_NATIVE_NEUTRAL_COLOR",
            "registration": ("Separate rigid anatomy, explicit telescoping shafts and complete ground platform"
                             if rig.get("rigidAnatomy") else
                             "Physical attachment landmarks with exact V6 foundation"
                             if rig.get("upperRegistration") else
                             "Independent native-world component rectangles and immutable authored foundation"),
            "cutout": "AUTHORED_COMPONENT_ALPHA_NO_FUTURE_PIXEL_DONORS",
            "ownerEpoch": "NO_PLAYER_REMAP_BEFORE_NATIVE_OWNER_SURFACES", "rigSha256": sha(args.rigs), "previousSha256": old_binding["sha256"]})
        if rig.get('retainedIdleCompletion'):
            assert rig['retainedIdleCompletion']['frame']==len(full)-1
            manifest['paintedBuildup']['completionPresentation']='retained-idle-v1'
        manifest["variants"] = []
        for density in (2, 4):
            canvases = full if density == 4 else [reduce_material(pair, palette) for pair in full]
            if density == 2:
                for phase in retained_phases:
                    canvases[phase] = [unpack(old_root, previous, 2, phase, role) for role in ("base", "data")]
            packed = []
            for phase, pair in enumerate(canvases):
                frame = previous["logical"]["frames"][phase]
                x, y = [v * density for v in frame["trimOrigin"]]
                w, h = [v * density for v in frame["legacyRenderSize"]]
                packed.append([a[y:y+h, x:x+w] for a in pair])
                for role, array in zip(("base", "data"), pair):
                    Image.fromarray(array).save(exports / f"{phase:02}-{density}x-{role}-canvas.png")
            variant = (pack_variant(packed, previous["logical"]["frames"], density, new_root, True)
                       if pooled_storage else
                       pack_flat(packed, previous["logical"]["frames"], density, new_root))
            manifest["variants"].append(variant)
        write(new_root / "manifest.json", manifest)
        binding = {**old_binding, "revision": args.revision, "sha256": sha(new_root / "manifest.json")}
        family = read(record["newFamilyPath"])
        family["members"] = [binding if m == old_binding else m for m in family["members"]]
        family_file = Path(record["newFamilyPath"]).parent.parent / args.revision / "family.json"
        retained = retain_turret_dependencies(family, family_file, source_family_file=record["newFamilyPath"])
        if rig.get("terminalCompletionOverlay"):
            assert family["family"] == "GTGCAN" and rig["terminalCompletionOverlay"]["frame"] == 11
            if family.get("turret"):
                family["turret"]["constructionCompletionFrame"] = 11
            else:
                assert family.get("sharedTurretSelection"), "Missing shared completed turret"
        write(family_file, family)
        record.update(newMember=binding, newFamilyPath=str(family_file), newFamilySha256=sha(family_file),
                      exportsPath=str(exports), componentRig=rig,
                      repairMode="PAINTED_HD_MATERIAL_NATIVE_POSE_REGISTRATION")
        checks.append({"key": key, "frames": len(full), "nativeNeutralRgbContribution": 0,
                       "serializedStorage": bool(pooled_storage),
                       "terminal": "REOPENED_CONSTRUCTION_ONLY", "retainedTurrets": retained,
                       "exactRetainedPhases": sorted(retained_phases)})
    authoring["revision"] = args.revision
    if any(rig.get('newConstructionArt') for rig in rigs.values()):
        progress=authoring['hdRepaintProgress']
        registered=list(progress['registeredCandidateKeys'])
        accepted=[]
        if args.accepted_authoring:
            accepted_authority=read(args.accepted_authoring)
            accepted=list(accepted_authority['hdRepaintProgress']['registeredCandidateKeys'])
            for key in accepted:
                assert next(f for f in authoring['families'] if f['key']==key)==next(
                    f for f in accepted_authority['families'] if f['key']==key), 'Accepted artwork changed'
        progress['registeredCandidateKeys']=sorted(set(registered)|set(rigs))
        progress['pendingKeys']=[key for key in progress['pendingKeys'] if key not in rigs]
        authoring['remainingConstructionRepair']={
            'baselineAuthoring':str(args.authoring),'baselineSha256':sha(args.authoring),
            'correctedKeys':sorted(rigs),'acceptedUnchangedKeys':accepted,
            'previousRegisteredKeys':registered,
            'acceptedAuthoring':str(args.accepted_authoring) if args.accepted_authoring else None,
            'method':'AUTHORED_COMPONENT_MASTERS_FIXED_WORLD_GEOMETRY_AND_RETAINED_IDLE_PRESENTATION',
            'visualAcceptance':'PENDING_NEW_SEQUENCES'}
    elif any(rig.get("cannonFit") for rig in rigs.values()):
        authoring["terminalAlignmentRepair"] = {
            "baselineAuthoring": str(args.authoring), "baselineSha256": sha(args.authoring),
            "correctedKeys": sorted(rigs), "baselineVisualAcceptance": "V9_GTGCAN_REJECTED_OTHER_REVIEWED_VISUALS_ACCEPTED",
            "foundationPreservation": "RETAINED_PLATFORM_WITH_RIGID_EARLY_STABILIZER_DEPLOYMENT",
            "visualAcceptance": "PENDING"}
    elif any(rig.get("terminalAlignment") for rig in rigs.values()):
        authoring.pop("rigidAnatomyRepair", None)
        authoring.pop("upperRegistrationRepair", None)
        authoring["terminalAlignmentRepair"] = {
            "baselineAuthoring": str(args.authoring), "baselineSha256": sha(args.authoring),
            "correctedKeys": sorted(rigs), "baselineVisualAcceptance": "V8_REJECTED_FOR_THREE_IDENTITIES",
            "foundationPreservation": "EXACT_V8_EXCEPT_GTGCAN_COMPLETED_PLATFORM_REGISTRATION",
            "visualAcceptance": "PENDING"}
    elif any(rig.get("rigidAnatomy") for rig in rigs.values()):
        authoring.pop("upperRegistrationRepair", None)
        authoring["rigidAnatomyRepair"] = {
            "baselineAuthoring": str(args.authoring), "baselineSha256": sha(args.authoring),
            "correctedKeys": sorted(rigs), "baselineVisualAcceptance": "V7_REJECTED_FOR_FIVE_IDENTITIES",
            "foundationPreservation": "EXACT_V7_EXCEPT_EXPLICITLY_REOPENED_GTGCAN_COMPLETENESS",
            "visualAcceptance": "PENDING"}
    if any(rig.get("upperRegistration") for rig in rigs.values()):
        authoring["upperRegistrationRepair"] = {
            "baselineAuthoring": str(args.authoring), "baselineSha256": sha(args.authoring),
            "correctedKeys": sorted(rigs), "fixedFoundation": "EXACT_V6_SOURCE_AND_PLACEMENT",
            "v6UpperVisualAcceptance": "REJECTED", "visualAcceptance": "PENDING"}
    write(args.output / "authoring.json", authoring)
    write(args.output / "component-registration.json", {"status": "UNSELECTED_COMPONENT_CANDIDATE",
          "checks": checks, "runtimeSelected": False, "sourceRigs": str(args.rigs)})
    print(len(checks), "component candidates packed; runtime selection unchanged")


if __name__ == "__main__":
    main()
