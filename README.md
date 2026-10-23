# Red Alert 2 HD — local prototype

**Current task branch:** [M2.1 bounded temperate environment prototype](docs/m2-1-temperate-environment.md), awaiting representative art-direction approval. M1 core faction units/buildings/cameos/rendering are complete within recorded scope; the final marker was user accepted in committed main `da3023c`; Windows/input tails remain in the [current handoff](docs/work-and-repair-handoff-20261006.md). M2 is skirmish environment HD. Campaign compatibility and cinematics are later work. The M1 entries below retain their historical checkpoint scopes.

**Historical M1.6b checkpoint:** all four Soviet building representatives were accepted, including the 21-frame NACNST production-motion sample. [Batch report](docs/m1-6b-soviet-building-batch.md). This checkpoint predates the completed M1 integrations; its original production status is retained in that report.

**Accepted M1.6a baseline:** `M1_6A_ACCEPTED_AND_DELIVERED`. The user accepted the complete optional temperate NAPOWR family and delivered local Mac app. See the [resources, launch instructions, acceptance and retained limits](docs/m1-6a-soviet-power-plant-hd.md). Preserve the accepted M1.5 R3 foundation; no further milestone starts automatically.

## Current local state

| Scope | Latest outcome |
| --- | --- |
| M1.5 unified macOS arm64 app | [R3 corrections](docs/m1-5-r3-fullscreen-loading-speed.md): stable fullscreen entry, full-viewport loading and five solo speeds (90 default), retaining all R2 fixes. Native checks pass; final visual acceptance pending. [Build, settings and acceptance report](docs/m1-5-unified-hd-desktop.md). Build a fresh isolated bundle with `bun run desktop:unified`. |
| Conscript | [M1.1 bounded acceptance](docs/m1-1-completion-acceptance.md), followed by [native state and bridge/paradrop corrections](docs/m1-1-state-validation.md). |
| Temperate GAPOWR | [M1.2 technical prototype](docs/m1-2-power-plant-prototype.md); its earlier visual review was superseded by [M1.4 final acceptance](docs/m1-4-completion-acceptance.md). |
| Rhino | [M1.3f normal-game, owner-color and firing acceptance](docs/m1-3f-rhino-gameplay.md); [M1.3g state evidence](docs/m1-3g-rhino-states.md) and [accepted translucent-shadow correction](docs/m1-3g-rhino-shadow-opacity.md). Original remains the default; opt-in HD is implemented. |
| Display | [M1.4 accepted delivery](docs/m1-4-completion-acceptance.md): reference height 900, production C, shroud, pause speed and density-aware HUD. |
| Transfer packages | [Mac ZIP, Windows x64 portable test package and shared external resources](docs/m1-5-transfer-packages.md). |
| Platform limits | Windows R3 runtime NOT RUN by agent (prior package user-tested); native 4K Mac output checked, prolonged battles unverified; local development bundle only. |

The summaries below describe retained milestone builds and historical decisions. Each old launcher remains bound to its own evidence; use the current M1.5 report for the unified desktop application.

**M1.4 accepted and delivered.** [Completion and acceptance](docs/m1-4-completion-acceptance.md). The power-plant animation is user-accepted. [Shroud boundary, paused game speed and HUD text](docs/m1-4-pause-options-and-shroud.md) correct boundary overlap and low-density money digits while retaining the confirmed 900-high presentation. `bun scripts/m1/play-production-c.mjs` opens the latest isolated build. [Native-size review](.artifacts/m1-4/pause-and-shroud/review-v3/review.html). The user accepted the final deliverable; independent Rhino work and review status are preserved.

**Historical M1.4 visual corrections.** [Unexplored-terrain and power-plant animation fix](docs/m1-4-shroud-and-animation-fix.md) removes speckles throughout unexplored terrain and stabilizes existing GAPOWR structure while retaining local fire/glow animation. [Before/after review](.artifacts/m1-4/followup-visual/review-v2/review.html). Run `bun scripts/m1/play-production-c.mjs` for the corrected isolated build. Technical checks passed; the user subsequently accepted the animation and final M1.4 deliverable. Artwork, C sampling, reference height 900 and independent Rhino work are preserved.

**Historical accepted Rhino M1.3e: eight headings and native movement.** [Report](docs/m1-3e-rhino-eight-headings.md) and [native-size review/video](.artifacts/m1-3e/review-v2/review.html). Run `bun scripts/m1/play-rhino-eight.mjs` for 8 × 8 independent combinations, original/candidate switching and native movement. The user accepted the reviewed appearance, turret attachment and turn transitions on 2026-09-18. The accepted low-profile M1.3d pixels, final M1.4 build and reference 900 are preserved; normal Rhino stays original. Fixed red, static treads and original fallback during firing remain explicit limits. That historical build predates the normal-game integration now recorded in M1.3f above. [Accepted M1.3d report](docs/m1-3d-rhino-independent-parts.md).

[Rhino handoff to the main planning conversation](docs/m1-3e-main-planning-handoff.md) distinguishes the accepted in-engine fixture from normal-game activation and proposes a bounded normal-match integration, remap and firing-continuity task. This historical proposal was subsequently implemented and accepted within the bounded [M1.3f normal-game scope](docs/m1-3f-rhino-gameplay.md).

**Historical accepted Rhino M1.3c: single-pose world artwork proof.** [Runtime fidelity report](docs/m1-3c-rhino-runtime-sprite-fidelity.md) and [native-size A/reference/R review](.artifacts/m1-3c/review-v1/review.html). Run `bun scripts/m1/play-rhino-sprite.mjs` for the opt-in fixture. Production C and reference height 900 are preserved; normal Rhino remains original. Runtime/depth checks pass; the user accepted actual runtime appearance and standard-900 clarity on 2026-09-18. The single-pose visual gate is complete; further work requires a separate instruction. That retained single-pose proof does not implement independent turret or full vehicle.

**Current M1.4: accepted C integrated.** [Production integration and validation](docs/m1-4-production-c.md) delivers remap-aware filtering and soft edges for the existing HD Conscript/GAPOWR world sprites, with shared edge buffers. The 19 paired full scenes match accepted experimental C exactly. Run `bun scripts/m1/play-production-c.mjs` for the new isolated build; C is automatic. The confirmed 900-high presentation, artwork and Rhino remain unchanged. [Native-size verification](.artifacts/m1-4/production-c/review-v2/review.html).

**Historical M1.4 sampling/edge experiment:** [A/B/C findings](docs/m1-4-sampling-and-soft-edges.md) record the user's acceptance of C for the reviewed Conscript/GAPOWR cases; the [native-size comparison](.artifacts/m1-4/edge-review/review-v1/review.html) retains the original evidence. Run `bun scripts/m1/play-display-edges.mjs` to switch original / filtered / soft-edge rendering in an isolated actual game. The default renderer, artwork, confirmed 900-high presentation and Rhino remain unchanged. **C_VISUAL_ACCEPTED.** Its retained build uses A by default; the new production build above integrates C.

**Current M1.4 display implementation:** [resolution-independent presentation and existing HD review](docs/m1-4-display-scaling-and-hd-review.md) provides a user-confirmed 900-high reference layout, aspect-preserving output presets, Retina-aware Auto output and consistent pointer transforms. **DISPLAY_CONTRACT_PASS / PRESENTATION_900_USER_CONFIRMED** for the bounded review; **C_VISUAL_ACCEPTED** for the subsequent bounded sampling/edge review; bounded production integration and state regression are documented above. [Native-size review](.artifacts/m1-4/review/review.html), [source/export/game fidelity review](.artifacts/m1-4/fidelity/review-v5/review.html) and [fidelity findings](docs/m1-4-fidelity-check.md). Run `bun scripts/m1/play-display-review.mjs` for the isolated playable scene with both existing 4x packs. The subsequent C selection completes the bounded visual gate; historical Conscript acceptance, GAPOWR review history and all independent Rhino decisions below remain intact. Windows and physical display output remain unverified; Rhino implementation remains outside M1.4.

**Historical Rhino display diagnostic:** [native 4K / camera-scale comparison](docs/m1-3-rhino-camera-scale-diagnostic.md) is **PASS_SAME_TICK_RHINO_NATIVE_4K_CAMERA_COMPARISON / DISPLAY_TARGET_ACCEPTED**. The [fixed-size review](.artifacts/m1-3-zoom/review-v1/review.html) compares original camera, true 2× camera and synthetic screenshot enlargement for original Rhino, the unchanged rejected runtime candidate and the accepted 2D target. No new assets or default camera changes. Main-color draws are native 4K; separate shadow draws are identified explicitly. The user selected `target-zoom2.png` as the implementation target; it remains a 2D composite with runtime realization unverified. The old runtime candidate stays rejected. No asset-production method or default camera change is selected.

**Current M1.3b runtime transfer:** the user selected the next bounded step after art acceptance. The [runtime-transfer proof](docs/m1-3b-rhino-runtime-transfer.md) is **RUNTIME_TARGET_NOT_MET / REVIEWED_NO_DIRECTION_SELECTED**. [Native-size comparisons](.artifacts/m1-3b/review-v1/review.html) show original, accepted 2D target and actual engine rendering. The proof retains separate parts and adds local matte armor response, but does not match the target's detail; geometry cost rises substantially. The user sees no improvement over the original; this route is not selected. Original Rhino remains active and the accepted M1.3a art target is preserved. No full-vehicle expansion or default override is selected.

**Current M1.3a artwork review:** the [Rhino art-first proof](docs/m1-3a-rhino-art-first.md) is **ART_TARGET_ACCEPTED / RUNTIME_TRANSFER_UNVERIFIED**. The user accepted the primary realism revision shown in the [native-size review](.artifacts/m1-3a/review-v2/review.html). The report records the acceptance decision; the review page retains its historical pending label. Candidate panels are 2D composites, not playable HD. The original Rhino remains active; no Phase B or override is started. The earlier complementary pose is retained and explicitly marked as preceding the realism correction.

**Current M1.3 outcome:** [Rhino feasibility Phase A](docs/m1-3-rhino-feasibility-prototype.md) ends with **REVIEWED_NO_DIRECTION_SELECTED**. The user finds B too simple and lacking detail and light/shade. Retain the original HTNK; no candidate is promoted and Phase B is not started. [Native-size review](.artifacts/m1-3/review-v2/review.html) and local diagnostic checks are retained. Conscript artwork and the GAPOWR baseline remain unchanged. Rhino corrections and review stay in this conversation.

Completed local milestone: [M1.1 Conscript HD Prototype — completion and acceptance](docs/m1-1-completion-acceptance.md). M0 is closed. Complete Conscript art, bounded macOS gameplay and selectable actual rendering up to 4K are delivered. Windows, packaged HD integration and sustained 4K performance remain unvalidated.

**2026-09-15 current-stage amendment:** [M1.2 Allied Power Plant HD prototype](docs/m1-2-power-plant-prototype.md) is **COMPLETE_BOUNDED_PROTOTYPE / PASS_BOUNDED_MAC_4K** for temperate GAPOWR only. Complete artwork is user-accepted; combined-HD gameplay, native state transitions, family fallback, original control and equal-size 4K checks pass in the isolated Chrome build. Keep its corrections and acceptance in the same conversation. Other buildings, vehicles, campaigns and desktop packaging remain excluded.

**Post-gameplay review amendment:** technical completion remains recorded, but **visual satisfaction is REVIEW_OPEN**. The user finds the authored-art improvement below expectations and the 1080p/4K output-density comparison more convincing; these compare different variables using the same HD 4K right-hand image. Read the [main-conversation decision handoff](docs/m1-2-review-handoff.md). Further implementation is paused pending that decision; earlier candidate approval does not imply final in-game visual satisfaction.

**Current M1.2a amendment:** the user subsequently selected a bounded [native-size clarity investigation](docs/m1-2a-native-size-clarity.md). The pipeline trace and three independent harness-only alternatives are ready in the [fixed-size visual review](.artifacts/m1-2a/review-v2/review.html). Status: **REVIEWED_NO_DIRECTION_SELECTED / REVIEW_OPEN**. The user finds all improvements limited and differences small. Retain the current baseline; promote none of the alternatives. M1.2 technical acceptance remains intact; no accepted artwork, production shader or full-family pack is replaced. Further implementation awaits a new bounded decision.

**Historical M0.1 baseline: scoped local PASS on macOS arm64.** Original-graphics offline 1v3 passed a continuous ten-minute observation and separate natural-result verification. The isolated compatibility adapter resolves the startup prerequisite without restoring upstream balance/art overrides. See [the acceptance report](docs/m0-1-report.md) for stability results and limits. This is not complete vanilla equivalence or the full remaster.

The [rendering follow-up](docs/rendering-followup.md) restores vehicle shadows and the existing vehicle motion smoothing path, and validates normal Harrier production/selection/flight. The [MCV shading correction](docs/mcv-rendering.md) uses the original local VPL lookup to recover wheel, cab and roof detail without changing geometry. Native Safari remains unvalidated; WebKit still shows occasional frame-time spikes, and exact retail pixel parity remains open. Add `?stats=1` to the offline URL for optional FPS/tick/frame-time counters. The earlier ten-minute run remains historical evidence; follow-up regression durations are recorded separately.

Use Bun **1.3.14**, pinned in `.bun-version`. The dependency lockfile is unchanged from upstream commit `898d89188542a3028a232031ce1a0bdc7c605b6f`. Local milestone changes are committed on `m0-2-stabilization`; M1.2 integration is `9a53092` and technical completion is `8e75955`. Windows x64 has not been tested; this run used macOS Apple Silicon.

## Local setup and start

```sh
bun install --frozen-lockfile --ignore-scripts
bun run setup:local-support
# Set this to your existing installation; the importer reads it without executing anything.
export RA2_SOURCE="/absolute/path/to/your/RA2/installation"
bun run import:ra2 --source "$RA2_SOURCE" --dry-run
bun run import:ra2 --source "$RA2_SOURCE"
bun run build
bun run start:offline
```

Open [the loopback offline entry](http://127.0.0.1:4000/). Imported files persist in `.local/assets/ra2` across reloads and server restarts. Choose **Offline Skirmish**, select **South Pacific (2-4)** (`MP01T4.map`), keep one human, and set three opponent slots to **Normal** AI. Set the human to team A and all bots to team B, assign starts 1-4, then start. The tested factions are Americans for the human and Libya for all bots. Other named difficulty branches currently use `DummyBot` and are outside the verified baseline. Stop the server with Ctrl-C. Only the three core archives are exposed to the browser. Campaign/media data, loose installation overrides, Yuri and CnCNet files are not runtime inputs. Do not select or mount the entire installation in legacy tools.

```sh
bun test
bun run typecheck:entry
# Requires installed Chrome, or set M01_BROWSER_PATH to a compatible browser executable.
node scripts/m0/browser.mjs
```

The smoke harness verifies a fresh offline main menu, reload, resource identity and network isolation. For the separately recorded gameplay scenarios, use:

```sh
# Natural result: speed 3, ten starting units, player deploys the existing MCV.
M01_DURATION_MS=600000 node scripts/m0/compat-browser.mjs
# Stability: standard speed 0, no starting army, finite normal human construction inputs.
M01_DURATION_MS=600000 M01_SPEED=0 M01_UNITS=0 M01_DEFENSE=1 \
  M01_OUTPUT=.artifacts/compat/defended-8 node scripts/m0/compat-browser.mjs
node scripts/m0/validate-runtime.mjs
```

Run these sequentially while the loopback server is running. Each browser process uses a fresh isolated profile. The optional output directory preserves separate runs; default evidence filenames are overwritten on rerun. A match ending early does not satisfy the continuous ten-minute stability check. The fixed seed is exposed through the existing debug start function; ordinary UI games use the current timestamp. Screenshots, console/network traces, manifests and original data remain ignored in `.artifacts/` and `.local/`. `setup:local-support` reads three binary files from the pinned local Git object into ignored storage; these have been removed from the public build. Upstream Git history still contains those binaries. Do not publish this checkout or redistribute local assets/builds.

[Asset import](docs/asset-import.md) · [Upstream baseline](docs/upstream-baseline.md) · [Acceptance and blockers](docs/m0-1-report.md) · [Compatibility adapter](docs/retail-compatibility.md) · [Next bounded task](docs/next-step.md)

---

## Preserved upstream README

The following is the original upstream text, preserved for context and notices. Its online features, scripts and download instructions do not describe the M0.1 offline workflow above; several advertised upstream scripts were absent from the fetched tree.

# RA2WEB React

免责声明：这是基于《时空分裂》中文版RA2WEB www.ra2web.com 的分析而开发，并意图基于最新的react和three版本进行重构。

但项目所有权利（包括收益权）归《时空分裂》/RA2WEB负责人所有。未经《时空分裂》的所有者/RA2WEB负责人许可，严禁用于任何商业行为。

需要注意的是，《时空分裂》的所有者从未以任何方式开源游戏客户端代码（即便存在诸如mod-sdk之类的周边开源内容）。本项目运行产生的BUG、功能不完善，不能等同视为对《时空分裂》的名誉贬损。任何基于本项目开展商业行为，包括但不限于植入广告、开发“弹幕红警”收受礼物获利、直接封装收费、以“作者”身份骗取赞助和充电收益等，均视为对《时空分裂》原作者Alexandru Ciucă和RA2WEB的侵权。

红色警戒2网页版，一款经典的即时战略类游戏的完整TypeScript重构版本，使用React + TypeScript + Vite + Three.js构建。

![动画](https://github.com/user-attachments/assets/d83f6001-d426-4d49-98a6-8282addc898d)

Disclaimer

This project is developed based on the analysis of the Chinese version of Chronodivide — RA2WEB (www.ra2web.com), and is intended to be refactored using the latest versions of React and Three.js. All rights to this project, including profit rights, belong to the owner of Chronodivide. Without permission from the owner of Chronodivide, any commercial use of this project is strictly prohibited.

It should be noted that the owner of Chronodivide has never open-sourced the game client code in any form, even though some peripheral open‑source content such as a mod‑SDK exists. Bugs, incomplete functions or other issues arising from the operation of this project shall not be regarded as damage to the reputation of Chronodivide. Any commercial activities conducted based on this project, including but not limited to placing advertisements, developing a “bullet-screen Red Alert” mode to profit from gifts, directly packaging and selling the project, or fraudulently obtaining sponsorship and donation revenue by claiming to be the “author”, shall be deemed as infringement upon the original author of Chronodivide, Alexandru Ciucă, and RA2WEB.

![image](https://github.com/user-attachments/assets/f146dc1c-ca15-456a-a8f0-4b43f2d431e8)

![image](https://github.com/user-attachments/assets/a23760df-e679-4b32-a9a2-ca51c214c420)

![image](https://github.com/user-attachments/assets/4781f451-7a51-45e2-919b-cbcb8bbd727a)

## 项目简介

本项目是使用Typescript编写，完全对标“红色警戒2”的游戏引擎，本地自行导入红色警戒2美术素材后，就可以获得类似红警2的游玩体验

## 当前技术状态

### 运行时和构建

- 包管理与本地运行时：`Bun 1.3.10`
- 开发服务器：`Vite 8.0.1`
- UI：`React 19.2.4` + `react-dom 19.2.4`
- 类型系统：`TypeScript 5.9.3`
- 渲染：`three 0.183.2`
- 自动化：`Playwright 1.58.2`
- 默认开发和预览端口：`127.0.0.1:4000`

## 快速开始

### 环境要求

- `Bun 1.3+`
- 现代浏览器，推荐 Chrome / Edge
- 浏览器需要支持：
  - `WebGL`
  - `Web Audio API`
  - `File System Access API`

### 安装与启动

```bash
cd redalert2
bun install
bun run dev
```

默认访问地址：

```text
http://127.0.0.1:4000
```

生产构建与预览：

```bash
bun run build
bun run preview
```

类型检查：

```bash
bun run typecheck:entry
```

## 自动化回归

仓库当前已经不再只依赖手点验证。`scripts/` 下维护了一组可直接执行的回归脚本，主要覆盖大厅、进图、机制和 tester 入口。

常用命令包括：

```bash
bun run debug:game-res-init
bun run debug:viewport
bun run debug:options
bun run debug:storage-explorer
bun run debug:skirmish
bun run debug:skirmish-lobby-data
bun run debug:victory-exit
bun run debug:superweapon
bun run debug:nuke
bun run debug:radiation
bun run debug:minimap-shroud
bun run debug:anti-air-hit
bun run debug:terror-drone
bun run debug:chrono-legionnaire
bun run debug:test-entries
bun run debug:tester-panels
```

这些脚本的产物默认会写入 `.artifacts/`，便于回看截图和 JSON 结果。

## 测试入口

主菜单中的测试入口目前分为三类：

1. 素材测试
   - `VXL测试`
   - `SHP测试`
   - `音频测试`
2. 机制测试
   - `建筑测试`
   - `载具测试`
   - `步兵测试`
   - `飞行器测试`
3. 场景测试
   - `大厅测试`
   - `世界测试`
   - `移动测试`

这些 tester 页面不是孤立 Demo，而是当前仓库里很重要的调试和回归入口。页面左侧面板状态会同步到调试状态对象，自动化脚本也会直接使用这些入口验证渲染和交互结果。

## 技术架构

### 核心技术栈

- `React 19.2.4`
- `TypeScript 5.9.3`
- `Vite 8.0.1`
- `three 0.183.2`
- `Bun 1.3.10`
- `Playwright 1.58.2`
- `7z-wasm`
- `file-system-access`
- `@ffmpeg/ffmpeg`
- `@ra2web/pcxfile`
- `@ra2web/wavefile`

### 目录说明

```text
redalert2/
├── public/          静态资源、配置、locale、遗留样式
├── scripts/         Playwright 自动化回归脚本
├── src/
│   ├── data/        原版资源格式、编码、地图、VFS
│   ├── engine/      渲染、音频、资源加载、底层引擎能力
│   ├── game/        游戏逻辑、对象系统、触发器、规则、超武
│   ├── gui/         主菜单、HUD、选项、游戏内 UI
│   ├── network/     网络和联机相关基础设施
│   ├── tools/       独立 tester 页面
│   └── util/        通用工具
├── docs/            对齐记录与工程说明
└── vite.config.ts   开发和构建配置
```

### 主要模块

`src/engine/`

- `gfx/`：three 渲染层、材质、批处理、viewport、lighting
- `renderable/`：游戏对象到可视对象的桥接层
- `sound/`：音频混音、音乐、音效播放
- `gameRes/`：资源导入、CDN 加载、缓存与目录处理

`src/game/`

- `gameobject/`：单位、建筑、抛射体、trait、locomotor
- `rules/`：INI 规则读取与对象规则构建
- `trigger/`：地图触发器、条件、执行器
- `superweapon/`：核弹、闪电风暴、超时空等超武逻辑

`src/gui/`

- `screen/mainMenu/`：主菜单、地图选择、大厅、选项
- `screen/game/`：游戏内 HUD、世界交互、菜单
- `component/`：React 组件
- `jsx/`：自定义 UI 渲染桥接

`src/tools/`

- 提供素材、机制、场景三类 tester 页面
- 当前是调试结果可视化和自动化断言的重要入口

## 开发命令

```bash
bun run dev
bun run build
bun run preview
bun run typecheck:entry
```

## 文档与调试约定

- 开发端口固定为 `4000`
- 主要技术对齐记录维护在 `docs/build-alignment-log.md`
- 自动化产物默认输出到 `.artifacts/`
- 构建通过并不等于所有行为已完全对齐，功能层面仍应优先参考专项脚本和实际流程验证

## 贡献建议

提交改动前，至少建议执行：

```bash
bun run typecheck:entry
bun run build
```

如果改动涉及大厅、资源加载、进图、HUD、机制或 tester，请补跑相应的 `debug:*` 脚本。

## 许可证

本项目基于GNU General Public License v3.0（GPL-3.0）许可证开源。详见 [LICENSE](LICENSE) 文件。

### 重要说明
- 可以自由使用、修改和分发，除非取得RA2WEB负责人许可，否则严禁用于商业目的
- 必须保留版权声明和许可证文本
- 任何衍生作品必须使用相同的 GPL-3.0 许可证
- 必须提供源代码，包括修改后的版本
- 不能将 GPL 代码集成到专有软件中

**注意：** 本项目仅用于学习和研究目的。红色警戒2是EA公司的知识产权，导入美术素材时请确保拥有合法的游戏副本。

## 致谢

- RA2WEB.COM
- Three.js 社区
- React 团队
- TypeScript 团队
- 相关开源依赖维护者
- 红警 2 玩家社区

---

**免责声明**: 本项目仅供学习研究使用，不用于商业目的。红色警戒2及相关商标归EA公司所有。

---
