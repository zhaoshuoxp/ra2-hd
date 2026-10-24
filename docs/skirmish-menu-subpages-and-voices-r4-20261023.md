Save and load now open as subpages of the actual menu. Home loading inherits the main menu frame, sidebar and button artwork. In-game saving and loading inherit the current faction's pause menu, sidebar and buttons. The file area fills the available content region across aspect ratios, and its live controls survive HUD resizing.

Popup buttons use the main menu's red, amber hover, yellow pressed and dark disabled panels. A thin silver ring samples the same original metal material; the surrounding chassis and extensions are omitted. RA2 and YR retain their corresponding HD popup artwork. The popup keeps the full original background ratio and all four frame edges. While a modal is open, the dimmed file canvas returns texture space for the popup, then regains its normal density on dismissal. The 16 MiB UI budget is unchanged.

The R3 trainer save extension remains intact: applied commands, reset boundaries, active effects, protected object IDs and paused pending commands survive restart, replay restoration, continuation and another save. Existing save serialization and storage are preserved. The accepted match-start/map-loading artwork remains unchanged; the corrected file-selection backgrounds use the original neutral/faction panel families. Retail neutral panels shared by RA2 and YR remain shared.

The voice audit found a real command acknowledgement defect: the order path supplies numeric `OrderFeedbackType` values while the sound handler compared strings. Numeric move, attack, capture and special-attack feedback now selects the unit's own original voice group. EVA uses Allied, Russian or Yuri entries for the active faction. The imported retail audit resolves the named audio files and records stock silent placeholders separately; no replacement voice pack was introduced.

| Validation | Result |
| --- | --- |
| Focused tests and entry typecheck | 43 cases, 442 assertions, no failures; typecheck passed |
| Responsive native menus | 9 sizes for in-game save and 9 for home load, from 640×480 to 3440×1440 |
| Three faction persistence controls | RA2 Allied 2X, YR Soviet 4X and YR Yuri 4X passed save, restart, exact restoration, 600-tick continuation and resave with the trainer enabled |
| Native audio | Five edition/faction routes, all EVA mappings and 35 PCM-matched Web Audio playback requests passed |
| Final thin trim | Actual native normal, hover, pressed, disabled and complete-frame captures passed |
| Final installed and ZIP-extracted apps | Soviet 4X and RA2 Allied 2X trainer persistence controls passed; desktop startup reused the existing HD 4X profile |
| Resources and archive | All 13,978 canonical pins unchanged; all 14,522 non-directory payload entries and extracted app signatures verified |
| Acceptance | Mac technical/package checks passed; user visual acceptance pending; Windows NOT_RUN_ON_THIS_MAC |

R6 established the complete faction and viewport matrix. The final R7 change only composes the thin metal button ring; R7 style checks, installed-app gameplay and actual ZIP-extracted gameplay are separate final controls. Earlier failed and superseded evidence is retained. The default profile has a verified 48-file snapshot. Prior app and ZIP deliveries are preserved. Source remains an uncommitted repair on local main; no push or unrelated worktree mutation was performed.

Desktop entry: `/Users/Aone/Desktop/Red Alert 2 HD Skirmish Repairs R4 20261023.app`, pointing to the complete independent app in `/Users/Aone/Applications/Red Alert 2 HD Skirmish Repairs R4 Final 20261023.app`. Full independent ZIP: `/Users/Aone/Desktop/Red Alert 2 HD Skirmish Repairs R4 20261023 Mac arm64.zip` (5,660,977,398 bytes; SHA-256 `93b0db8e741791c03ef20d6133b48c94fc73363527e78630820106768da748d9`).

Evidence is under `.artifacts/skirmish-save-ui-r4-20261023/`, with final hashes in `delivery-final.json` and the 97-file source snapshot in `source-snapshot-final/manifest.json`. The reused built-in imagegen prompts, source references and original output paths are retained in `.artifacts/skirmish-save-ui-r3-20261023/artwork-prompts.json`; the existing HD exports are `public/res/ui/save-files-neutral-r3.png`, `save-files-allied-r3.png` and `save-files-soviet-r3.png`. No new artwork generation was needed for the final menu and button corrections.

Continue this conversation for corrections or visual acceptance of this delivery.
