# Complete Mac repair test application

Delivered application: `/Users/Aone/Desktop/Red Alert 2 HD Repairs 20261022.app`.

This Apple Silicon macOS application contains the frozen road-markings-v5 runtime and all selected game, world, UI and prepared resources inside `Contents/Resources/GameResources`. Finder presents one `.app` bundle. Its 13,978 resource files and 14,504 total entries occupy 9,801,863,078 logical bytes. The application runs independently of the development workspace and sibling resource folders.

The default test profile is `~/Library/Application Support/Red Alert 2 HD Repairs 20261022`. It was created cleanly, with HD enabled at 4X; the user can select 2X or Original. Actual gameplay fixtures use separate QA profiles under the project artifacts. The default profile contains no QA matches or controlled game state. Existing profiles and Desktop items are preserved.

The repair runtime is the tested uncommitted snapshot based on main `dc494dbd59363439ae830fad5e81134ef36ee95b`. All 241 frozen payload files other than the packaging metadata retain exact hashes. Packaging adds an isolated-profile bootstrap, the existing internal-resource discovery entry and the accepted application icon. The construction-clock transparency, result-background protection and road/parking repairs are retained. Source changes remain uncommitted.

## Verification

- Two resource-layout checks / seven assertions pass.
- Every copied app file, framework link and executable permission matches the staged inventory. Every selected resource matches its pinned source. The entire Desktop payload is rechecked after native execution.
- Direct Desktop startup passes with `app.isPackaged === true`, internal resource registration and the separate default profile. No profile override or external-resource environment variable is supplied.
- A native Desktop RA2 Alamo 2X match publishes the encountered terrain and displays the repaired intersection, crosswalk and parking members.
- A native Desktop YR Austin 4X match displays the repaired NewUrban intersection, parking and slope members.
- A native Desktop YR Alamo 4X pressure case preserves the fallback clock's 0.50173 median shaded/clear ratio across 3,740 pixels, renders the complete victory picture within the 16 MiB UI budget, and releases result surfaces on exit.

The clean staged bundle passes ad-hoc deep/strict code-signature verification. The Desktop File Provider immediately reattaches root `com.apple.FinderInfo` after removal, producing a separate strict Desktop metadata diagnostic. The copied payload bytes match the signed clean bundle; actual Desktop startup and game execution pass. The diagnostic is retained separately from the byte/signature and native evidence. Developer ID signing and notarization are not performed for this local test build.

Current receipt and inventories: `.artifacts/road-markings-repair/mac-single-app-v1/delivery.json`, `app-inventory.json` and `resource-inventory.json`. Native reports, screenshots and the metadata diagnostic are retained in that directory. `scripts/distribution/package-repair-mac.py` assembles the complete bundle from a verified resource stage; `native-repair-mac-direct.mjs` checks ordinary startup and the private default profile. No ZIP or additional platform package was requested or created. Final visual and natural long-match acceptance remain for user testing in this conversation.
