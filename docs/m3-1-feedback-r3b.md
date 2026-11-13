# M3.1 feedback R3b

Runtime `fa8494701e08c0b1d4a0af68240f541fb897ff0d` implements the five requested corrections and the Original-mode clock regression found during final testing. R3b supersedes the retained R3 intermediate. The accepted base, original rules/scripts/objectives and all 14,004 bundled game/resource files remain unchanged. Current visual and physical-input acceptance is pending; native Windows is NOT_RUN_ON_THIS_MAC.

- Original AlliedCampaignSelect, BootCampSelect and SovietCampaignSelect playback on hover/focus.
- Loading world-map registration uses the original centered mission plane and a stable Atlantic-US locator.
- Score apparatus and live text share a 0.78 scale; per-frame matting removes the opaque baked plate.
- Named campaign saving/loading reuses the frozen bugfix UI, confirmations and HD artwork. The journal-v3 checkpoint remains unchanged inside a separate checksum envelope/database; the old manual slot is a read-only list row until the user explicitly overwrites or deletes it.
- Lit and unlit progress use the same glossy cylinder texture, seams and highlights; amber lighting is bounded to the cylinder. Existing silver ornaments and exposed cable remain.
- A shared frame selector clamps callbacks before effect startup and holds the last opening frame, fixing the Original-mode renderer exception found in the intermediate R3.

## Verification and delivery

51 focused cases / 811 assertions and entry typecheck pass. The final candidate and actual Desktop extraction pass Original-mode repeated hovering, nine entry/edition-recovery/playability/return cases, named-save restart/restore/overwrite/delete/cancel, corrupted-save rejection and default-profile legacy-slot preservation. Compatibility uses an authentic accepted checkpoint fixture in independent profiles; an empty default manual slot is not a claim of migrating existing user data. The final native victory reaches tick 20090 with the original medal/typewriter animation and completed voice/cheer. Unchanged English, Traditional Chinese and defeat evidence is labeled separately in the review. Native DOM clicks pass; OS pointer-lock acquisition is rejected by the automation host, with a separately labeled controlled locked-input handoff.

- Desktop ZIP: `/Users/Aone/Desktop/RA2-HD-M3.1-Mac-arm64-20261024-R3b.zip`
- SHA-256: `cf1489ae763293aad7ebe4f97d7ee224f05e35293395f8a030b67a87152d1ca3` (5755930109 bytes; 14546 verified archive entries).
- App: `Red Alert 2 HD M3.1 Campaign R3b.app`.
- Offline review: `/Users/Aone/RA2remaster/ra2-hd-m3-1-campaign/.artifacts/m3-1/feedback-r3b/M3.1-Feedback-R3b-Review.html` (16 byte-identical embedded PNGs; no server or adjacent assets).

The in-app browser rejected file:// navigation under its URL policy. No workaround was attempted; static image decoding/hash checks pass and the HTML is included for manual opening.

## Main integration preparation

The isolated frozen-source rehearsal passes typecheck, 56 focused cases / 844 assertions and the retained native campaign/skirmish save flows. No save-backend, GameScreen or simulation changes follow those native combined-source checks; later changes only affect campaign UI animation and loading material. Both save formats remain independent and use one shared browser in the rehearsal. Campaign route 22, skirmish-load route 23 and campaign-save route 24 are distinct; each game owns a copied route map.

Read `.artifacts/m3-1/feedback-r3b/integration-preparation.json`. Resolved head `eee81c005651598b376a05fa04a359f96909bed9` and the hash-verified final Git bundle preserve the shared-source resolutions and frozen bugfix snapshot. Canonical main is unchanged by this task. Recheck both live source identities before the later main merge. No cleanup, push, publication or next mission is performed.

Preserve the R3 intermediate's Original-mode failure and all prior archives, profiles, masters and acceptance evidence. Continue the current execution conversation for manual feedback on this same M3.1 outcome.
