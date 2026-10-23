# M1.5 desktop validation

Run from the repository root on macOS arm64, one application check at a time. These harnesses use the actual executable from a build's `artifact.json`, launch outside the repository working directory and create disposable profiles under `.artifacts/m1-5/`.

```sh
node scripts/m1/desktop/smoke.mjs <artifact.json>
node scripts/m1/desktop/gameplay.mjs <artifact.json>
node scripts/m1/desktop/ui.mjs <artifact.json>
node scripts/m1/desktop/states.mjs <artifact.json>
node scripts/m1/desktop/fallback.mjs <artifact.json>
node scripts/m1/desktop/check-registration.mjs
node scripts/m1/desktop/audit-artifact.mjs <artifact.json>
```

- `smoke`: menu, options, actual runtime and security configuration.
- `gameplay`: ordinary Soviet production/combat/natural result, Allied construction/damage/repair/sale, next match and saved settings. Uses three Normal AI on separate teams. Existing diagnostics arrange lobby options and issue ordinary orders; no forced result or rules modification.
- `ui`: actual display/output, input, pause/settings and three-match cleanup. A Dummy opponent isolates UI/lifetime behavior. Set `M15_LIFETIME_ONLY=1` for a focused teardown diagnosis.
- `states`: supplementary controlled bridge teleport, cloak/warp and explicit removal of normally initialized units. It is not natural special-state evidence.
- `fallback`: copied external data, including a path with spaces/non-ASCII characters; damage affects copies only. Expected missing-resource/denied-route 404s are recorded.
- `check-registration`: byte/MIME/identity/containment checks against disposable pack copies.
- `audit-artifact`: full bundle integrity, payload exclusions and byte-for-byte runtime/build-input binding to current Git HEAD. It writes a sibling `implementation-binding.json`; the original build receipt stays unchanged.

`input.mjs` is a shared helper. None of these scripts is copied into the application. Native Pointer Lock/fullscreen results are recorded separately from renderer/UI checks; an inactive or locked macOS session cannot establish physical acceptance. Final user confirmation must remain explicit.

See `docs/m1-5-unified-hd-desktop.md` for the actual delivered artifact, failures, corrections and acceptance boundary.

For the user-feedback revision, `feedback.mjs <artifact.json> [original]` checks the single native resolution control, borderless macOS fullscreen, original checkbox images, measured 60/120 tick throughput, and frozen-frame Conscript coverage screenshots. Run both graphics modes sequentially. `display-persistence.mjs <artifact.json>` checks saved window resolution across process restarts, invalid mode rejection and the Alt+F round trip. These use disposable profiles; they do not approve visual quality or validate Windows execution.

`r3.mjs <artifact.json>` validates first fullscreen entry under repeated resize events, preserves current Options controls, captures the real loading view using a harness-only loader-completion hold, checks the five-tier solo default/persistence, measures every tier, and tests paused selection/resume. `--baseline` records the preserved R2 fullscreen navigation behavior without applying R3 assertions. Keep the runtime and visual acceptance statuses separate.
