# M1.2 review and main-conversation handoff

Prepared: 2026-09-15, after technical completion `8e75955` and subsequent user visual feedback. Repository: `/Users/Aone/RA2remaster/ra2-hd`; branch: `m0-2-stabilization`. This handoff updates documentation only. Implementation is paused for the user's next decision in the existing main planning conversation.

**Later decision:** the user selected [M1.2a native-size clarity investigation](m1-2a-native-size-clarity.md) in the original execution conversation. The controlled review is complete: the user finds all improvements limited and differences small. No candidate is selected, accepted defaults remain unchanged, and visual satisfaction stays REVIEW_OPEN. The next bounded decision returns to the existing main planning conversation. The unselected options and documentation-only pause below are historical handoff state, not the current M1.2a scope.

## Decision summary

**Technical prototype: COMPLETE_BOUNDED_PROTOTYPE / PASS_BOUNDED_MAC_4K. Visual satisfaction: REVIEW_OPEN. Next implementation: NOT SELECTED.**

The user accepted the sample direction and complete 44-frame candidate before gameplay integration. After reviewing actual gameplay, the user found GAPOWR's authored-art improvement modest relative to the generated source images; Conscript looks somewhat better but also falls short of the source-image impression. The user finds the same-HD-art 1080p/4K comparison more convincing. Preserve those earlier approvals without treating them as final in-game visual satisfaction.

## What was delivered and verified

- Temperate GAPOWR only: body `ggpowr.shp`, activity `ggpowr_a.shp`, construction/sale `gtpowrmk.shp`; 44 authored visible frames, complete 2x/4x variants, original shadows and shared effects retained.
- Simultaneous accepted HD Conscript, independent switches and whole-building-family 4x to 2x to original fallback. Eight cross-faction Conscripts in the match harness are explicitly disclosed fixtures; native production, combat, geometry and timing are unchanged.
- Actual native building production, damage, repair, sale and separate destruction; red/blue owner colors, selection, infantry/building occlusion, page transitions and resource teardown.
- Original-art control and same-frame 1920x1080/3840x2160 output with equal logical geometry, camera and input coordinates. Combined 4x HD pages use 69 MiB and release on teardown.
- 528 calibration comparisons with pixel difference 0; 34 tests / 682 assertions, entry typecheck and isolated build passed at the technical checkpoint. Original resources, Conscript art, applications, dist and normal user data passed preservation comparison.

The report update does not rerun gameplay or imply additional test coverage. Windows, physical external monitors, manual play, long-duration combat, all-theater and GPU recovery acceptance remain NOT RUN. The inherited ordinary indexed-material dynamic-uniform limitation remains documented. Accepted desktop applications do not contain M1.2.

## What the pictures actually compare

| Evidence | Held constant | Changed | Interpretation |
| --- | --- | --- | --- |
| `original-vs-hd.png` | 4K output, matching recorded building frame/geometry/camera | Original versus authored artwork, in separate fixed-seed matches | Incremental authored-art improvement at the same output density |
| `same-art-output-density.png` | Accepted HD art, one synchronous tick, logical viewport and display size | 1080p versus 4K drawing buffer | Output-density benefit for the existing HD art |
| Generated artwork / complete candidate review | Source or exported frame viewing conditions | Not a controlled gameplay pair | Art direction and frame coverage; cannot substitute for final in-game appearance |

The two gameplay boards use **the identical right-hand HD 4K screenshot and crop**, as specified in `scripts/m1/build-power-plant-game-review.py`. Their different left-hand controls explain why one comparison can look more impressive. Both are 3x logical-size detail crops; review the normal-size scene as well. The stronger density comparison is not evidence of a different or better authored pack.

Confirmed pipeline facts: nearest sampling without mipmaps, original-pixel alpha constraints, 16-shade owner remap, fixed screen size, and a 336x368 normal-body 4x export from an 84x92 native trim. These are plausible contributors to the gap from source art. Their separate contributions, an optimal filtering strategy and achievable improvement are UNVERIFIED; no controlled sampling/alpha/remap alternatives were run. No claim that higher source resolution alone will solve the gap is established.

## Questions for the main planning conversation

1. Should the current result remain a technical prototype checkpoint, with visual refinement deferred, or should M1.2 remain the next quality target?
2. If refinement is selected, what is the target: clearer native-size gameplay, closer resemblance to the generated source, or a particular reference at matched display size?
3. A possible bounded follow-up is a single-frame comparison of source/export/game output, then isolated sampling, alpha and remap alternatives before any full-family revision. This is a proposal for decision, not work already authorized by this handoff. Preserve logical size, all prior accepted packs and regression evidence; review any changed artwork explicitly.

No renderer modification, regeneration, increased camera scale, new content object or desktop packaging is started. Return M1.2 corrections to this execution conversation if selected. A materially different objective should use a separately chosen execution conversation; none is created automatically.

## Checkpoints and local evidence

- `dae7f20`: accepted M1.1 baseline.
- `9a53092`: approved GAPOWR family integration, independent Conscript selection.
- `8e75955`: bounded M1.2 gameplay/4K completion and evidence tooling.
- Subsequent documentation-only commit: this visual-feedback handoff; identify with `git log --oneline -4`.
- [Detailed M1.2 report](m1-2-power-plant-prototype.md), including activation commands, source identities, approval hash and limitations.
- Actual-game static review: `.artifacts/m1-2/game-review-v1/review.html`; direct PNGs: `original-vs-hd.png`, `same-art-output-density.png`, `normal-size-scene.png`, `gameplay-states.png`.
- Complete-art review and unchanged approval receipt: `.artifacts/m1-2/full-art-review-v1/`.
- Runtime family: `.local/hd-packs/power-plant-authored/1/family.json`; immutable family SHA-256 `31b76d8632f470e41886aaf2987c3df618370f1b25ea80725d044e450f94b2d2`.
- `.artifacts/m1-2/acceptance.json` remains the historical technical-checkpoint summary. Read it together with this later visual-feedback amendment; it is not a new final visual endorsement.

All art, imports, screenshots and builds remain ignored and local. No push or publication. The handoff changes neither the accepted assets nor the tested runtime.
