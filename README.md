# Red Alert 2 HD

An offline desktop HD remaster project for **Command & Conquer: Red Alert 2** and **Yuri's Revenge**, built with TypeScript, React, Three.js and Electron. It brings sharper faction artwork, map environments and interface graphics to local skirmish play on macOS and Windows, while preserving the familiar isometric presentation and original gameplay rules as its compatibility target.

## Reference projects and implementation

The codebase starts from [huangkaoya/ts-redalert2](https://github.com/huangkaoya/ts-redalert2), previously available as `huangkaoya/redalert2`. That project describes its origins in analysis of RA2WEB, the Chinese adaptation of [Chrono Divide](https://chronodivide.com/), a browser-based recreation of Red Alert 2.

Red Alert 2 HD extends that foundation with dual-edition offline play, a high-density artwork pipeline, complete skirmish-theater coverage, localized desktop presentation and packaged local resources. TypeScript implements the game and resource handling, React provides the interface, Three.js renders the battlefield, and Electron supplies the desktop application and local resource access. The game runs through this engine rather than launching or patching the original Windows executable.

The emphasis is on improving the game's appearance without changing unit footprints, building placement, movement distances or combat rules to accommodate larger artwork. Engine compatibility and AI behavior are separate from visual fidelity: the built-in AI is not the original retail executable's AI.

## Playing experience

- **Two editions:** select Red Alert 2 or Yuri's Revenge, with their corresponding factions, units, buildings and maps.
- **Offline skirmish:** play against multiple AI opponents, choosing sides, teams and player slots within each map's starting-position limits. All supported maps use one standard skirmish setup.
- **Original, 2X and 4X graphics:** choose original artwork or higher-density resources, with fallback when an HD resource family cannot be loaded.
- **Stable display scale:** rendering resolution and logical presentation are separate. On the same display and viewport, increasing output resolution adds detail without shrinking units and interface elements or changing the visible battlefield. Different window sizes and aspect ratios can reveal different amounts of the map.
- **Localized presentation:** English, Simplified Chinese and Traditional Chinese cover menus, map names and game text.
- **Optional offline trainer:** enable it through the main-menu or pause-menu options to expose in-game controls and configurable shortcuts. Its toolbar disappears when disabled.
- **Desktop operation:** fullscreen and windowed play, persistent settings, match results, return to menu and subsequent matches work within the standalone application.

## What has been upgraded to HD

The artwork covers the Allied, Soviet and Yuri factions and the environments used by the supported original skirmish catalogs. World resource packs provide both 2X and 4X artwork; interface assets use appropriate high-density artwork and text rendering.

| Area | HD coverage |
| --- | --- |
| Faction buildings | Allied, Soviet and Yuri structures, defenses and superweapon buildings, including applicable snow variants, damaged states and animated components. |
| Construction | Building construction sequences follow the corresponding original animation frames, keeping their placement, timing and transitions connected to the game's building lifecycle. |
| Infantry | Faction infantry and edition-specific units, with movement, combat and other supported action sequences, ownership colors and native shadows. |
| Vehicles, aircraft and naval units | Faction unit artwork, directional views, independent body/turret components where applicable, and supported deployment and special states. |
| Terrain | Ground surfaces, slopes, cliffs, shorelines, water, roads, bridges and urban terrain across Temperate, Snow, Urban, New Urban and Desert theaters. |
| Map objects | Civilian and technology buildings, vegetation, scenery, walls, fences, gates, ore, gems and other map overlays within the supported skirmish-map scope. |
| Menus and screens | Main-menu artwork, interface backgrounds, buttons, loading images and skirmish victory/defeat presentation. |
| Build sidebar | Allied, Soviet and Yuri building/unit icons, relevant rank aliases and superweapon icons. |
| In-game presentation | Game-style cursors, command and status indicators, health displays, hover labels and scalable interface text. |

The map catalog contains **62 Red Alert 2 maps and 151 Yuri's Revenge maps**, following each edition's original published list and order. These 213 maps share the HD environment resources appropriate to their theater. Coverage refers to these catalogs; arbitrary custom maps and archive-only extras are outside that scope.

## How the HD presentation works

Higher-density art is registered against the original sprite frames and logical coordinates. A more detailed infantry sprite, tank or building therefore occupies the same gameplay footprint as its original counterpart. Animation state, facing, player-color remapping, shadows and depth ordering remain connected to the live game, including building occlusion and bridge/elevation behavior.

Resource families load as complete compatible sets. The renderer can fall back to an available lower density or original artwork rather than displaying a partially loaded family. Original mode remains available for the world graphics. HD density and output resolution are independent: 4X artwork supplies more source detail, while a higher-resolution framebuffer provides more pixels in which to display it.

The result combines redrawn detail with sufficient display resolution. It does not rely on enlarging gameplay objects, and it does not imply that every original effect, movie or sound has been remade.

## Desktop applications and resources

| Platform | Complete package | Program-only package |
| --- | --- | --- |
| macOS Apple Silicon | A single `Red Alert 2 HD.app` containing the required local resources; it can be moved as one application. | A smaller application using the shared `GameResources` folder. |
| Windows x64 | A portable folder containing the executable, runtime dependencies and `GameResources`; keep the folder together. | A smaller program folder using the same shared resources as macOS. |

The common resource pack is platform-independent and can be split into separate ZIP parts. Extracting every part into the same destination assembles one `GameResources` directory. Programs can find it beside the application/executable or inside their user-data directory:

- macOS: `~/Library/Application Support/Red Alert 2 HD`
- Windows: `%APPDATA%/Red Alert 2 HD`

Settings remain in the user-data directory when the application is moved or replaced. No online account or runtime resource download is required once the local resources are installed. macOS is the primary validation platform; Windows packages are available, but performance and compatibility of a newly combined build require native Windows testing. Intel Macs are outside the supported target.

## Source checkout and development

This repository contains source code and supporting documentation. Imported original game archives, complete HD packs, prepared resource caches and packaged applications are stored separately. **Cloning the repository alone does not provide a playable game or reproduce the complete HD artwork.** Original game data must come from a legitimately owned local installation.

Use the Bun version recorded in `.bun-version` and the committed lockfile:

```bash
bun install --frozen-lockfile --ignore-scripts
bun run typecheck:entry
bun run test:source
bun run build
```

With the required local resources imported and registered, `bun run start:offline` serves the built application. Desktop packaging and resource-import tooling live under `desktop/` and `scripts/`; `src/` contains the engine, HD rendering and interface implementation.

## Scope and attribution

The playable focus is offline skirmish. Campaign execution, campaign movies, LAN and online multiplayer are not enabled; reserved menu entries do not indicate those modes are implemented. The original gameplay is the compatibility target, not a claim of complete equivalence with the retail engine.

This is an unofficial project, unaffiliated with Electronic Arts or the Chrono Divide team. Command & Conquer, Red Alert 2, Yuri's Revenge and their original assets belong to their respective rights holders. Original game archives are not included in this source backup; private complete packages containing imported game data are not public redistribution packages.

See [LICENSE](LICENSE) for the code's actual licensing status. Chrono Divide-derived material in this repository has not been licensed by its copyright holder; the repository must not be described as wholly GPL-licensed or as granting redistribution rights to that material.
