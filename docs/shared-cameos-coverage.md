# RA2 and Yuri's Revenge shared-faction cameo omissions

Status: `PASS_SHARED_CAMEOS_DESKTOP_DELIVERY / NEW_ART_VISUAL_REVIEW_PENDING`. Baseline is accepted R8 main `3795e36`. The user accepted the R8 corrections and explicitly requested auditing and completing Allied/Soviet building, unit and power icons in both the original game and Yuri's Revenge.

The audit resolves each edition's native rules, art, country eligibility, full faction prerequisites and stolen technology against the selected 474-entry UI catalog. RA2 has 87 eligible production rules and 117 distinct relevant references, with no missing HD entry whose native source exists. YR has 92 rules and 127 references; nine canonical pictures and four veteran aliases were absent from the catalog. All accepted UI files exist and match their recorded hashes, so this omission is not a cache regression.

| Identity | Subject | Added identities |
| --- | --- | --- |
| BFRT | Battle Fortress | bfrticon.shp, bfrtuico.shp |
| GGI | Guardian GI | gdgiicon.shp, gdgiuico.shp |
| GAROBO | Robot Control Center | rbccicon.shp |
| ROBO | Robot Tank | roboicon.shp |
| NABNKR | Battle Bunker | bnkricon.shp |
| BORIS | Boris | brisicon.shp, brisuico.shp |
| NAINDP | Industrial Plant | indpicon.shp |
| SCHP / SCHD | Siege Chopper | schpicon.shp, schpuico.shp |
| SpyPlaneSpecial | Spy Plane power | spypicon.shp |
| ORCA, both editions | Harrier veteran fallback | falcuico.shp using accepted falcicon.shp |

Both editions declare an absent `falcuico.shp`; the previous sidebar selected a placeholder after veteran aircraft production was enabled. During cameo collection, a missing trainable alternate now retains its declared identity while borrowing its existing normal native frame. Existing native alternate images are never replaced. HD adds the accepted base plus shared rank overlay; Original displays the normal native frame. Untrainable engineer alternates, nonbuildable scenery, campaign-only and unused placeholders remain explicit source-audit exclusions.

The four YR veteran pairs differ from their normal native images only inside the existing top-left rank region. The new `shared-cameos-ra2-yr-v1` catalog has 488 entries, retains all 474 accepted entries and their file bytes, and preserves menu videos and Yuri loading. Nine newly authored masters yield independent 120 by 96 and 240 by 192 PNGs. Logical geometry stays 60 by 48, runtime UI stays 4X independently of world density, and the 16 MiB / 512-entry limits remain unchanged. World selections, prepared payloads, accepted R8 assets and gameplay rules are unchanged.

Reproducible scripts are under `scripts/ui/shared-cameos/`. Native derivatives, masters, provenance, exports and offline review remain ignored under `.artifacts/shared-cameos/` in the isolated `ra2-hd-shared-cameos-20261004` checkout. The review includes original/HD, both export densities, logical-size samples and all five rank aliases. Native validation and delivery evidence will be recorded in the companion receipt. New artwork remains pending user review; no remote push or Task D work is authorized.

## Completed incremental validation and delivery

The source candidate is `4804ab4a2b6015afd0fabdf6aeb73d42d17d640b`. Sixteen focused tests pass 88 assertions; entry typecheck, additive preservation, both-edition source audit and native veteran-pair pixel checks pass. Four real packaged-app scenarios and four fresh actual Desktop scenarios cover YR Allied/Soviet new normal/rank/power bindings plus RA2 Allied/Soviet controls and the missing Harrier veteran fallback. They check native geometry/UVs, dynamic labels, correct texture identities, rank overlays, UI cap, HD Off and HD On. The Desktop runs additionally check 16 rapid category changes per scenario. No page errors occur. The first RA2 harness assertion raced sidebar publication; its failed report is preserved, the wait was corrected, and affected checks passed without rebuilding application code.

The new Desktop archive is `RA2-HD-Main-Shared-Cameos-R1-20261004-4804ab4-macOS-arm64.zip`, 3,260,427,918 bytes, SHA-256 `d9cbfb6b4f88a441d7c5491f5e2fc963bca16e68ef446f1e2a2aeca8e3634fa4`. Every one of 5,360 extracted entries, links and executable modes matches; the app signature passes. `Shared-Cameos-Review.html` is self-contained with 50 verified images. `Shared-Cameo-Exports/2x` and `/4x` each contain all 14 new or completed identities, including composed veteran variants. The complete sibling world resources retain accepted R8 and all main outcomes. Exact evidence is in [the receipt](shared-cameos-coverage.json).

Local main received the immutable additive UI pack and verified 488-entry registration. The final helper/evidence commit leaves the compiled runtime source unchanged. Previous apps, ZIPs, profiles, selections and historical reports remain intact. Review the new icon appearance together; continue corrections to this delivered result here. No remote push or Task D work occurred.
