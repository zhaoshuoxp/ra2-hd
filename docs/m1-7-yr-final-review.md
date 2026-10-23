# YR Soviet unit complete-family review delivery

Current status: all reviewed families are accepted and integrated into main. See `m1-7-yr-final-acceptance.json` and `m1-7-yr-main-integration.md`; delivery-time pending and isolated-branch labels below are historical.

Status: `COMPLETE_FAMILY_REVIEW_PENDING`. The representative artwork is accepted. Full production, integration and technical verification are complete; final visual/gameplay acceptance remains pending.

Selected delivery: `.artifacts/m1-7-yr/delivery-v2/RA2-HD-YR-Soviet-Units-R1.zip` (858,972,304 bytes). SHA-256: `2b7f6959142967a4b706d3237f20beebe700b4796c636676ace678196a9a6cfe`. Runtime source commit: `1da6c75646e497086af5ceea66bf673aa33f2878`. The independent Apple Silicon app is `RA2 HD YR Soviet Units R1.app`; keep its sibling `RA2-HD-Editions-Resources` directory beside it. It uses a separate profile. Delivery v1 is retained history.

The package contains both editions, all accepted building/UI/unit resources, and four new YR Soviet families: BORIS with BPLN, SCHP with flight/rotors/deployment/artillery, CCOMAND and PTROOP. The YR roster is 27 HD roots plus accepted Original SQD/SQDG. The new versioned inventory contains 50 files. The complete packaged resource inventory contains 1,214 files. Accepted Conscript, Rhino and prior unit/building artwork are unchanged.

`YR-Soviet-Units-Full-Review.html` opens directly, with no server or network: 1,072 native infantry slots, two owner colors, paired Original/HD views, four action recordings, chopper contacts and aircraft headings. All 4,288 image views reconstruct pixel-identically from their native captures. The 1x view preserves captured 1080p framebuffer pixels; larger scales are inspection aids. Browser decoding, controls, video playback and zero-network checks pass.

Production, weapons, special abilities, shadows, native gunfire death, rotor motion, forward/reverse deployment, normal/elite airstrikes and resource lifecycle checks pass. There are 52 focused passing tests and a passing entry type check. All four final package cases pass: RA2/YR on temperate maps and Bering Strait snow maps, retaining 18 applicable HD building families in each case. Both snow cases also pass actual lamp GPU blending and pause-menu-to-score validation. Unit-specific action tests use controlled legal prerequisite/target fixtures; no natural-match victory is claimed.

The shared 256 MiB optional allocation cap is unchanged. Whole-family resource failure falls back atomically. Edition gates keep the four YR additions out of RA2. `m1-7-yr-coverage.json` records every root, dependencies, exclusions, measured allocation and evidence; `m1-7-yr-resources.json` pins selected resources; `m1-7-yr-delivery.json` pins the final app/ZIP receipt. Generic death/weapon effects remain native. Windows, campaigns and exhaustive other-theater gameplay are outside the evidence.

Main's committed changes through `f508f43` are merged into this isolated unit branch, including buildings, combat/audio, snow-unit loading, lamp coefficients and score duration. No main working files were changed and this extension has not been merged back. Recheck then-current main before later authorized integration. Continue final review and corrections in this same execution task; no publication or new task is implied.
