# DISK drain continuity and alignment repair

Runtime `c7e4c0e` passes packaged 2X and actual Desktop-ZIP extracted 4X checks. This repair covers refinery payments, the continuous native concentric-ring animation shared with power plants, and hovering directly above the drained building. See the [machine receipt](disk-drain-repair-20261005.json) for the final runtime, Desktop ZIP and verification status. User acceptance remains pending; Windows is unverified.

## Confirmed causes and changes

The unchanged combined baseline began draining NAREFN at tick 180, with its first payment due at tick 210. Passive acquisition selected the refinery's delayed free HARV at tick 195, changing the current target and stopping the drain. Footprint distance remained 1 tile within the native 1.5-tile range; the earlier center-distance hypothesis does not explain this failure. The fixture retains the actual delayed harvester and disables only its movement/mining to isolate funds.

Retail `FireOnce=yes` ends the attack task before the continuous channel ends. The initial active-only protection (`66c57ed`) passed two native runs but failed a Desktop retarget rerun: at tick 595, passive HARV acquisition preceded NAPOWR projectile impact. The final repair protects pending and active drain intent against automatic acquisition and retaliation. Projectile identity rejects canceled or superseded impacts. Payments, blackout and animation begin only on valid impact; explicit orders and invalid targets still cancel the channel.

Actual loaded retail DISKRAY already has four frames and `LoopCount=-1`. Its apparent flicker was caused by interrupted drain state. An initially added loop override was removed after native inspection. The final animation plugin and original art remain unchanged; both refinery and power channels retain the same native animated rings.

The generic attack movement stopped at weapon range near the building edge. The final flying-drain approach uses the building's exact world center and waits for movement completion before firing. Even-sized foundations place the center on a cell boundary; their legacy `centerTile` is not the exact destination cell. The approach uses a matching destination cell and fractional offset and bypasses the ordinary balloon-hover center-tile gate only for this drain approach. Native range, money amount/delay, ordinary attack movement and artwork are unchanged.

## Evidence and boundaries

Raw evidence is retained under `.artifacts/disk-drain-20261005/`. Baseline failures, the incomplete active-only Desktop failure, and the first centered-approach timeout retain their original labels. The centered timeout showed exact horizontal alignment but repeated movement tasks due to the legacy center-tile gate; the follow-up fixes that gate.

Focused tests cover range, acquisition/retaliation, pending intent and stale impacts, cancellation, insufficient funds, animation-controller cycling and drain-specific approach behavior. Native cases verify three conserved payments, ordinary acquisition after Stop, refinery-to-power replacement, sustained blackout, move/capture/destruction cancellation, continuous animation cycles and measured horizontal alignment. Final reports and recordings are indexed in the machine receipt.

All accepted C/D/UI selections and prepared resources must remain byte-identical to the prior integrated delivery. The final Desktop ZIP must pass exact archive/extraction hashes, modes, symlinks, strict app signature, isolated launcher discovery and actual in-match drain checks. Historical integration and source-art acceptance reports remain unchanged. Continue testing and corrections in this conversation; no remote publication is authorized.

## Delivered result

- Desktop: `/Users/Aone/Desktop/RA2-HD-Main-Disk-Fix-20261005-c7e4c0e-macOS-arm64.zip` (3,292,291,545 bytes).
- SHA-256: `d6599ca1c87402e4830ac279c39ade174af9385a76451d529292b4485aa3475a`.
- 38 focused tests / 384 assertions and entry type checking pass. All 4,778 selected resource files are unchanged; all 5,480 ZIP and extracted entries verify, including modes, symlinks and strict signature. No user profile is included.
- The actual extracted launcher passes resource discovery, C/Allied/E1 world bindings and visible UI selection. Both native densities pass conserved refinery payments, sustained power blackout, cancellation and retargeting. Every observed drain start has zero horizontal center offset; both four-frame DISKRAY animations remain attached, visible and running across repeated cycles.
- Videos: `centered-2x-v2/{refinery,power}-continuous-native-diskray.webm` and `desktop-centered-4x-final/{refinery,power}-continuous-native-diskray.webm`, relative to the evidence root. Matching screenshots and per-frame animation observations are retained.

The previous combined Desktop ZIP is preserved. The incomplete `66c57ed` ZIP was moved from Desktop into retained failure evidence after exact hash verification. Final user appearance approval remains open; continue any feedback in this conversation.
