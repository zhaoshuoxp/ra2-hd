# Current development state

Canonical local `main` is the sole maintained source. Further performance experiments are paused at the user's request on 2026-11-13. See [current release](current-release.md) for package identity, verification and maintenance instructions.

## Included production behavior

RA2 and Yuri's Revenge support offline skirmish, Simplified Chinese and the existing other localizations, three-faction HD units/buildings/cameos, selected HD environments across the supported theaters, UI, save/load and the offline trainer. Campaign content includes 26 RA2 campaign/training maps, 14 YR maps and 136 HD movie identities, with mission selection, media/radar playback, outcomes and next-mission flow. Existing campaign-semantic and original-art exceptions remain qualified in the current release record.

The retained runtime includes the verified shadow-only VXL, equivalent mono IMA ADPCM decoder, integer-tuple VXL weld and direct merged-batch indices. The M4.3a vehicle-shadow instancing prototype remains opt-in and OFF by default. No reliable whole-scene benefit was established, all ten formal windows failed stable 60 FPS, and earlier two-scanline sidebar differences remain unexplained despite the latest exact image controls. Pausing work does not change those results.

## Development and data

Run `bun run desktop:prepare`, then `bun run desktop:start` from this repository. The regular browser preview is `bun run start:offline`. Tests use `bun scripts/test-suite.mjs --resource-root .local`; entry typecheck uses `bun run typecheck:entry`. Do not open or reset real user profiles for checks. App packaging must bind the production payload to committed source and verify selected resources.

Current `.local` resources, unique `.local/source-art` inputs, original `../Resource`, user-supplied movie/source downloads and actual Library profiles remain protected. Superseded applications and unused historical process artifacts can be removed after the new package is validated. Useful tests and the compact inputs they actually require stay available. Historical reports deleted from the working tree remain in Git history; old report paths are not current dependencies.

The five unrelated YR working files listed in AGENTS.md remain unstaged and outside all source exports. Commit only task-owned changes. GitHub receives the committed source snapshot through its existing separate ancestry; canonical history and `origin` are unchanged. No automatic Release or resource upload.
