# Development starting point

Continue new development in `/Users/Aone/RA2remaster/ra2-hd` on local `main`. Skirmish rendering, roads, fountains, saves, trainer persistence, inherited menus and faction voices are integrated with the final localized edition footer and loading-button removal. The independent `ra2-hd-m3-1-campaign` worktree on `task/m3-1-soviet01` remains active and must remain untouched. See `docs/skirmish-repairs-main-20261024.md` for the integrated repairs and `docs/distribution-main-20261024.md` for the refreshed complete/modular packages and private source backup. Earlier milestone notes describe historical checkpoints.

## Working files

- `src/`, `public/`, `desktop/`, `scripts/`: current implementation and repeatable tooling.
- `.local/`: canonical imported data, selected world/UI/terrain artwork and prepared loading data. These are active dependencies, not disposable packaging caches.
- `desktop/icons/`: generated icon master, platform exports and prompts, retained for future builds.
- `node_modules/` and `.local/playwright/`: installed development and browser-test dependencies.
- `dist/` and `desktop/app-files.json`: generated local development output, refreshed together by `bun run desktop:prepare`.
- `../project-history/`: compact receipts and unique authoring sources. Historical paths may refer to retired outputs; do not recreate entire old task trees.
- `../Resource/`: original installation, preserved unchanged.

Historical skirmish test packages, including Desktop copies and five complete test apps under `~/Applications`, are retired. Distribution assemblies and disposable test profiles are retired after verified delivery; final outputs remain in `/Users/Aone/Desktop/RA2-HD-v0.2-20261024` and compact receipts in `../project-history/distribution-20261024`. Retained evidence, authoring metadata, profile snapshots and deletion receipts are under `../project-history/skirmish-repairs-main-20261024`. Actual user saves and settings remain in their existing Library profiles. Original installation, canonical resources and independent campaign outputs are outside this cleanup.

## Start working

Dependencies and canonical resources are already installed. Refresh the development build after changing source:

```bash
bun run desktop:prepare
bun run start:offline
```

The browser entry is `http://127.0.0.1:4000/`. Start servers or applications only when needed. Use focused checks appropriate to the next change; unchanged accepted artwork does not require a new full review matrix. The current packaged application remains the reference for delivered behavior; a fresh development build is not a new desktop delivery or new Windows acceptance.

## Git and platform boundaries

Local main retains the full source history. Its upstream `origin` remains `huangkaoya/redalert2`; the ahead count describes committed local changes, not uncommitted work. Do not push this branch to upstream.

The private `zhaoshuoxp/ra2-hd` repository has separate snapshot ancestry. Do not push canonical main directly there, since doing so would import the old history. The current-main source snapshot includes the skirmish repairs, saves, distribution tooling, bilingual README and icon. Consult `../project-history/distribution-20261024/github-backup.json` for the exact local source and remote snapshot identities.

Windows optimization and fixes remain in main. Latest combined-package native Windows execution is still unverified, and 90 FPS is not an achieved target. Same-outcome delivery corrections can stay in the current conversation; start a new execution conversation for a new feature or milestone, using this file as the starting point.
