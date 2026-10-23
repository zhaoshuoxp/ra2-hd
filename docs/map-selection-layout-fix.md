# Map selection content shift repair

Status: `PASS_AUTOMATED_DESKTOP_LAYOUT`; physical interaction and final user acceptance remain open. This repair is independent of Task C building production. Baseline: clean local `main` at `3e251383f7f59d2d0525e4c25987fb83f6715f82`, preserving accepted B runtime `e748dc8` and delivery predecessor `d35ad51`.

## Observed cause and minimal change

The real fullscreen application reproduced a content shift on map selection entry. Instrumenting the delayed `selectedRef.current.scrollIntoView()` showed `HTML.scrollTop` changing from 0 to 4.5 CSS px and `#ra2web-root` moving from approximately `[-0.000061, 0, 1920, 1080]` to `[-0.000061, -4.5, 1920, 1080]`. OS window/content bounds stayed `[0, 0, 1920, 1080]`; fullscreen was actually active. The viewport and scale transforms did not change. Windowed diagnosis also observed ancestor scrolling of 4 px. This demonstrates ancestor scrolling for the reproduced entry defect; it does not establish a separate scrollbar-only cause for every intermittent report.

`MapSel` now holds the map list's own DOM ref and calls `revealMapSelection(list, selected)` after filtered rows or selection change. The helper converts rendered bounds through the existing scale and changes only `list.scrollTop`, by the minimum distance needed to reveal the selected row. It preserves the delayed render timing and cleanup. The shared List implementation, CSS, fullscreen handling, logical coordinates, camera and input mappings are unchanged. No page reset, fixed translation or global focus/overflow override is used.

## Focused real-app evidence

Evidence lives under `.artifacts/map-selection-layout/`. The trace includes OS bounds, root/canvas/menu anchors, ancestor/document/list offsets, active element, viewport and transforms.

| Evidence | Result and boundary |
| --- | --- |
| `before-v5/report.json` | Three valid actual-fullscreen diagnosis cycles reproduced ancestor movement; the overall report later failed because a guessed windowed mode ID was unsupported. Preserve the trace without calling the whole run PASS. |
| `before-v4/report.json` | Valid windowed shift evidence. The initial native fullscreen request was ineffective; these cases are not fullscreen evidence. |
| `final-package-yr-v5/report.json` | Six cycles in the packaged app: three actual fullscreen and three windowed. Cold entry, saved last-row selection, real UI scrollbar drag, search/sort, keyboard Tab focus, Use Map and Cancel passed. |
| `final-package-ra2-v3/report.json` | Two quick packaged cycles, one in each actual display mode; entry, saved selection, drag and Use Map passed. |
| `final-package-yr-v1/report.json`, `final-package-ra2-v1/report.json` | Earlier passing packaged checks before explicit list-scroll/sort/focus assertions were added to the regression. |
| `typecheck-final.log` | `bun run typecheck:entry` passed. |
| `build-v1.log`, `build-v1/identity.json` | One isolated production build of the map fix; normal `dist` preserved. |
| `package-v1/package-receipt.json` | Current packager, ad-hoc signed macOS arm64 app, sibling resource root, immutable accepted resource hardlinks. Initial packager status remains `PACKAGED_RUNTIME_PENDING`; the separate runtime reports above supply the completed layout evidence. |

The regression asserts selected-row visibility at entry, stable outer root/canvas/menu anchors through interaction and closing, no outer ancestor scrolling, no `scrollIntoView` calls, and actual requested OS display mode. It also verifies that scrollbar drag changes the list's internal offset. The later YR cycles cover search, sort and keyboard focus; this is not a claim of adding keyboard map selection to a component that has no such handler.

The tests use Playwright against the actual Electron UI, with task-only profiles and explicit resource registration. They are controlled mouse/keyboard automation, not physical panel/input certification. Windows remains `NOT_TESTED`. Final user confirmation of the originally reported intermittent behavior remains separate.

## Failed attempts and applied lessons

- The sandboxed Electron launch did not start. Subsequent app launches used approved scoped execution and isolated profiles.
- The initial locator assumed an English map button. The regression uses the existing sidebar action order and reads the Skirmish locale key without modifying localization.
- A native OS fullscreen call left the app windowed. Replaced it with the app's own display API and asserted both native and simple-fullscreen state. Initial false-fullscreen results are explicitly excluded.
- A guessed windowed mode ID failed after valid fullscreen traces. The final regression selects an advertised windowed mode from the app's own choices.
- Validation expanded only to resolve those failures and to assert that the list still scrolls. No closed UI acceptance matrix or hardware campaign was replayed.
- Removing literal locale text exposed a wrong test selector (`.sidebar`); the actual buttons use `.menu-button`. A subsequent assertion mistook native preview-loading button visibility for layout movement. The final regression records buttons separately and waits for native loading completion; stable root/title/search remain the layout anchors. Both failed probes are retained as `final-package-yr-v3/v4`.

## Local review launch

The runnable folder is `.artifacts/map-selection-layout/package-v1/RA2-HD-Task-C-Map-Review/`. Run `Launch-Isolated-Review.command` there. It registers the sibling `RA2-HD-Editions-Resources` root through `isolated-review-profile`, sets `RA2_DESKTOP_NO_DISCOVERY=1`, and launches `Red Alert 2 HD Dual Edition R5.app`. Previous apps, profiles, resources and archives are preserved. The retained R5 bundle display name comes from the current packager.

This app contains the map fix and accepted predecessor artwork. New Yuri representative images are in the offline HTML beside the app; they are not installed world families. The app is not a completed Task C HD delivery.

Reproduce the focused regression, choosing a fresh evidence directory:

```sh
node scripts/m1/map-selection-layout/runtime.mjs \
  .artifacts/map-selection-layout/package-v1/package-receipt.json \
  .artifacts/map-selection-layout/manual-followup-yr --verify
```

For the bounded RA2 check, add `--ra2 --quick`. For a physical follow-up, enter map selection fullscreen with a previously saved selection near the end, drag its scrollbar, then Use Map or Cancel; confirm that only the list scrolls and the outer interface remains still. Continue feedback in this execution chat.

## Combined final Task C review app

`final-c-app-v1/report.json` passes two additional quick YR cycles (actual fullscreen and windowed) using the final C `package-v3` app and independently copied resources. The map source is unchanged from `ee35fcf`; the earlier detailed YR and quick RA2 evidence remains applicable. This bounded check verifies the final delivery boundary without repeating the detailed matrix. The combined runnable review now lives under `.artifacts/yuri-buildings/package-v3/RA2-HD-Task-C-Yuri-Review/`, with a separate task-owned profile and complete selected C resources. The older map-only app above remains preserved with its original art boundary.
