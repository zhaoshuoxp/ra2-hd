# Soviet Buildings R4: targeting and post-launch closure

Current status: **ACCEPTED_AND_DELIVERED** following the user's final all-tests-passed confirmation. See [final handoff](soviet-buildings-final-handoff.md) and `.artifacts/soviet-remaining/final-acceptance.json`. Historical pending labels below describe earlier delivery stages and are superseded by that receipt.

The user accepted R3, then requested concentric targeting without green tiles, natural silo closure after launch, and HD versions of the four displayed retail target cursor families. R4 final visual/gameplay acceptance remains pending.

The isolated retail `mouse.shp` confirms red concentric Iron Curtain cursor frames 346–350, yellow nuclear symbols 319–328, clock imagery 357–368 and storm imagery 279–298. This is resource evidence, not a claim that a retail executable draws the new ground overlay. R4 keeps those native cursor identities, animation boundaries, 55×43 logical canvas and (27,21) hotspot. Authored vector drawing supplies 4× sampling for all 47 frames through the existing HD switch; other pointer frames remain Original. No additional setting or pointer-coordinate conversion is added.

The targeting overlay has three concentric bands and no filled cells. Its outer radius and command tile retain R3's native-effect calculation. Iron Curtain still affects its native nine-tile square; the circles are aim guides, not a change to that effect. Accepted construction range bands remain unchanged.

Only NAMISL's normal/damaged `ngmisl_h.shp` closing frames change. R3 reused opening artwork (including the missile) and scaled whole images against changing frame bounds. R4 removes the fired missile and translates two rigid armor parts over one fixed foundation, with an exact accepted closed endpoint. Native trim, frame counts, timing and shadows remain unchanged. Construction, opening, ready and closed member exports are byte-identical to accepted R3. Pack revision 7 uses new immutable paths. The initial r8 candidate had a mismatched platform footprint; it is retained as failed evidence, and r8c keeps the accepted foundation and its exact edge alpha; the retained r8b candidate double-composited that edge.

Review artifacts, actual-app checks and package receipts are recorded under `.artifacts/soviet-remaining/feedback-r4`, `complete-review-r4` and `desktop-transfer-r4`. Historical failures and old-profile differences remain separate from new technical checks. Keep further corrections and acceptance in this task.

## Delivered candidate and checks

Implementation checkpoint: `120153e`. The final app is `.artifacts/soviet-remaining/build-2026-09-21T23-51-18-571Z/Red Alert 2 HD Soviet Buildings R4.app`, with 1,326 runtime source files content-bound to that checkpoint. The complete review is `.artifacts/soviet-remaining/complete-review-r4/Soviet-Buildings-Review.html`; adjacent cursor, targeting and validation pages are portable.

Technical checks passed: 62 tests / 1,416 assertions, TypeScript checking, 1,492 native-controller motion captures across 17 families, all 47 HD cursor frames with Original fallback, eight range captures at 1080p/4K, and five global/independent fallback cases including NAMISL corruption. The combined optional GPU allocation is 178.44 MiB under the unchanged 256 MiB cap. All 502 recorded accepted source-art files and the R3 selected resources/app/local ZIP are unchanged. The 54,009-entry baseline payload check passes; four historical old-profile cache/runtime differences remain strict-equality failures.

Desktop delivery: `/Users/Aone/Desktop/RA2-HD-Soviet-Buildings-R4-macOS-arm64-App-Resources-Review.zip` (683,487,715 bytes), SHA-256 `7bcfdb80142b29fb155d6f95fee0485bd4ca24872a67b249299c119b4a4ddfe4`. All 429 resource files, application links/executable permissions and portable review files were verified in the ZIP, then the Desktop copy was hash-checked. Old deliveries and profiles remain retained.

Status: `R4_DELIVERED_FINAL_VISUAL_GAMEPLAY_ACCEPTANCE_PENDING`. Review the new cursor drawings, targeting appearance and normal/damaged post-launch silo closure in this task. Native-controller fixtures do not establish a new end-to-end superweapon battle result; R3's accepted evacuation/loading fixes remain unchanged. Windows and physical cursor handoff are not newly validated.
