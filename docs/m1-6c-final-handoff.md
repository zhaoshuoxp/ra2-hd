# M1.6C accepted Soviet building coverage

Status: `M1_6C_ACCEPTED_AND_DELIVERED`. The user explicitly approved the consolidated final review without exceptions. `m1-6c-final-acceptance.json` binds this decision to the delivered archive, source and selected resources. Prior pending labels in immutable packages and test evidence remain historical.

## Accepted scope

RA2 and Yuri's Revenge each contain 18 applicable Soviet building identities, with a union of 20 and 162 edition/theater/building cells. There are no Soviet building Original exceptions in this matrix. Industrial Plant and Battle Bunker, snow families, missing Power Plant construction variants and verified native-family reuse are included. Accepted M1.6/M1.7/UI work is preserved; SQD/YURIPR retain their separate Original unit exceptions.

The evidence includes 74 focused tests, TypeScript checking, eight native retail-map runs, controlled Lunar loading, 1080p/4K output buffers and 16:10 layouts, Industrial Plant economics, bunker occupancy/fire/evacuation/destruction, repeated civilian evacuation, a bounded 120-second Soviet-versus-Yuri production/combat run, whole-family fallback, HD toggling and texture teardown. Both relocated signed packaged editions passed their guard/promotion/unit regressions and all 18 applicable building activations. Human acceptance does not broaden Lunar evidence into retail-map gameplay or validate Windows, campaigns or other faction artwork.

## Source and preserved delivery

- Worktree: `/Users/Aone/RA2remaster/ra2-hd-buildings-m1-6c`, branch `m1-6-soviet-edition-coverage`.
- Runtime source: `9e635b1`; delivered documentation: `c03c445`. Acceptance records follow as a documentation-only commit.
- ZIP: `.artifacts/m1-6c/delivery-v2/RA2-HD-Soviet-Buildings-M1.6C-R1.zip`.
- ZIP SHA-256: `49ec4f5655c30cf1ab79115ee79bfa582bcd2ae4127eefa9ea49e8a26b82055d`.
- Offline review: `REVIEW-DASHBOARD.html` and `BUILDING-REVIEW.html` inside the corresponding unpacked directory.
- Selected new resources: 245 files, pinned by `docs/m1-6c-added-resources.json`; source matrix: `docs/m1-6c-coverage-matrix.csv`.

The accepted ZIP, validation receipts and all 245 selected resource hashes were rechecked when recording acceptance. No artwork, application, resource, ZIP or profile was changed to record this decision. Rejected attempts remain preserved.

## Main integration

At acceptance, main was clean at `f0412b9`, adding the independent combat/audio R5 correction after the accepted package's `477341f` baseline. The user subsequently authorized main integration. Merge `89207af` preserves R5 and the accepted building implementation; main fast-forwarded from `f0412b9` to `69a50dd`. See `m1-6c-main-integration.md` and its receipt for integration validation. The historical accepted package remains unchanged and does not silently include R5. Main is the source baseline for subsequent development.

This accepted M1.6C artwork objective is closed. Continue this same task for corrections or subsequent integration of this outcome. Start a new execution task only for a materially different objective selected by the user; do not create one automatically.
