# Fountain and original UI correction R2

The correction stabilizes HD fountains and restores edition-specific original save/load presentation. It preserves the previously delivered persistent saves, player-defeat feedback, long-play UI and road repairs. Source remains an uncommitted repair on `main`, based on `dc494dbd59363439ae830fad5e81134ef36ee95b`; no commit or push is included. The independent campaign worktree is outside this task.

## Fountain

The last two authored water-animation frames contain a different basin. Hiding the dry base alone could not remove that change. Buildings also aggregate their SHP images, so the animation's frame offset must be applied when selecting the fixed reference and clipping each water frame. Early candidates and their failed observations are retained.

`FountainSurface.ts` now renders the first active frame's basin below native row 62 and retains the real ten-frame water animation above it. Both positions and UV coordinates are clipped together. The reference borrows the existing HD pages; it adds no texture pages, changes no resource pixels, and preserves the original world anchor, timing and density. Original and unavailable-HD paths retain the native layers. Teardown restores the original geometry and releases the owned material and clipped geometry.

The original published catalogs contain 27 maps with 79 fountains across TEMPERATE, URBAN, NEWURBAN and DESERT. Every placed fountain was checked through real animation cycles at 4X with a strict per-render basin-pixel hash. Manhattan's first observation contained a short transient pixel change; that failure and its captures remain preserved. With a 1.5-second camera/startup settling interval, all three Manhattan fountains pass the unchanged assertion. Four additional maps cover all four theaters at 2X, including damaged and multiple placements. Bay of Pigs also has separate 30-second 2X and 4X recordings, sampling every water frame repeatedly. The Original control retains the original base and animation with no HD composite.

These are controlled graphics fixtures with AI stopped and the map revealed, not natural long-match or FPS measurements. Raw coverage and every initial failure are under `.artifacts/skirmish-visual-r2-20261023/`; `fountain-coverage.json` identifies selected and historical results separately.

## Original UI references

The original local `game.exe` and `gamemd.exe` dialog resources supply Save template 692 and Load template 183. Their control positions define the separate 640x480 RA2 and 800x600 YR file screens. Save name, file list, right-side actions, keyboard selection and modal confirmation retain the existing save format and storage implementation. Working, overwrite and success messages reuse `TXT_SAVING_GAME`, `TXT_LOADING`, `TXT_CONFIRM_SAVE` and `TXT_GAME_WAS_SAVED` from the retail strings.

| Presentation | RA2 source | Yuri's Revenge source |
| --- | --- | --- |
| Save/load file background | `fsbkgdsm.shp`, 472x448, `uibkgd.pal`, three emblems | `fsbkgdlg.shp`, 632x568, `fsbkgdlg.pal`, ruined city |
| Neutral dialog and progress | `pudlgbgn.shp`, 451x326, `dialog.pal`, orange city | `pudlgbgn.shp`, 454x328, `dialogn.pal`, green city and cyan lightning |
| Country loading panel | RA2 SHP and `mpls.pal` | YR SHP and the original per-country palette |

The YR palette changes also apply to the native CSS fallback. Generic confirmation/error dialogs and save/load progress share the correct edition's HD neutral backdrop. Custom dialog sizing remains available. Opening a file screen releases the hidden pause artwork, and closing it restores the pause controls.

## HD artwork and memory

The built-in ImageGen tool produced source-referenced bitmap backgrounds. Selected PNGs were copied unchanged into `public/res/ui/`; no generated output was post-processed. Full prompts, source references, dimensions, hashes and unused attempts are retained in the task's `authoring` folder. The selected exports are:

- `dialog-background-r2.png` and `dialog-background-yr-r2.png`.
- `save-files-ra2-r2.png` and `save-files-yr-r2.png`.
- `loading-allied-r2.png` and `loading-soviet-r2.png`.

`src/gui/hd/nativeUiBackdrops.json` pins the dialog/file PNGs. `loadingBackdropSources.json` pins the common loading images and 18 country-panel vector exports. The latter derive from each edition's original palette pixels, preserving its geography and country panel rather than inventing replacement maps. The existing accepted country-unit images and full Yuri loading illustration remain unchanged.

Displayed canvases reserve their surfaces within the existing 16 MiB UI budget. Temporary decoded bitmaps close after drawing, country-unit DOM canvases are counted, and whole-background preparation releases its texture before the DOM surface mounts. The loading canvas leaves room for the unit, a 2X working popup and the result banner. All 19 edition/country combinations retain at least 1.973x canvas density in the 16:9 fixture, reserve at most 16,704,384 bytes including result headroom, and release every surface at teardown. Missing vector files leave the complete original background visible. World budgets and all 13,978 canonical resource pins remain unchanged.

## Validation and delivery

- Focused checks: 22 passed, zero failures, 187 assertions across seven files.
- Application-entry typecheck, frozen build and whitespace validation pass. The unreferenced historical `ModMeta.ts:52` parse error still prevents the broader `tsc --noEmit` command; that file is unchanged.
- Headless component checks: 19 HD country combinations, two Original controls and two missing-map fallback controls, with real preparation leases, popup surfaces, result headroom and teardown checks.
- The selected self-contained app passes native RA2 2X and YR 4X save, full application restart, exact restored state, 600 further AI ticks, resave/reload and confirmation controls. Both checkpoints save at tick 2181.
- The packaged UI-pressure control retains half-transparent construction clocks and the complete protected result image, then releases its result surfaces. The actual ZIP-extracted app passes a fresh Bay of Pigs fountain loop. Desktop-entry startup passes with the preexisting default profile and its own embedded resources. Final user visual acceptance is pending.
- Windows: `NOT_RUN_ON_THIS_MAC`.

The selected self-contained arm64 bundle is version 31. Its complete ZIP is 5,669,319,156 bytes, SHA-256 `d24303f5c20d7c03a1022ac77c2ba7153266da95e757ec3370b93b93e1d0a4ee`. The bundle uses the existing application profile so prior saves/settings remain available. The pre-update default profile and previous installed bundle are preserved. Desktop delivery uses an app entry pointing to the complete bundle in Applications, plus a full ZIP containing the actual app. Every ZIP entry is decompressed and checked against the app inventory; the extracted app receives its own signature and native-startup check.

Continue this conversation for testing and corrections to this outcome. Start a new execution conversation only after acceptance and a materially different objective.
