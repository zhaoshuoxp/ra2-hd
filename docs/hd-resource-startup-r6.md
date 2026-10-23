# R6: desktop HD resource startup recovery

## Observed failure

The user reported that the R5 speed build retained HD icons but rendered units and buildings in Original. The affected Desktop profile pointed to its correct sibling `RA2-HD-Editions-Resources` directory. Its saved session recorded 61 unexpected `ENOENT` failures during HD registration, in addition to the two accepted Original exceptions. Missing-path errors included Conscript, Rhino and the Soviet building families. Registration caught each error and permanently published Original fallback for that process; UI registration succeeded separately.

The delivered files were present when investigated. An independent registration of the same Desktop directory resolved every expected family. Relaunching the unchanged R5 app with isolated profiles passed both editions' building availability, unit renderer bindings and existing guard/combat checks. This establishes a transient file-availability failure followed by recovery. It does not establish the underlying macOS/filesystem trigger; cloud synchronization is not a confirmed cause. No user settings or resource files were changed to obtain that recovery.

R5 verified payload hashes but omitted final packaged HD gameplay validation. File integrity did not prove runtime activation. This verification gap allowed the reported failure to reach the user.

## Correction

- Preserve the filesystem error code in HD registration diagnostics.
- Retry the complete validated registration after 250, 750 and 1,500 ms when a family reports `ENOENT`. Only the final registration is published; every pass retains existing path, hash, size and complete-family checks.
- For complete packaged edition/trainer deliveries using their sibling resources, stop startup with a resource-readiness explanation if files remain missing. Optional external profiles retain bounded Original fallback. Deliberate SQD/YURIPR exceptions and integrity failures are not treated as transient missing files.
- Record retry failures, final readiness and attempt count. Extend native package validation to require successful readiness and only the two accepted registration exceptions, in addition to its existing actual building/unit HD checks.
- Preserve the 25% speed reduction and all prior trainer, cursor, icon and loading-image corrections. No artwork, geometry, balance or user-profile changes.

## Verification and evidence

Evidence is retained under `.artifacts/hd-resource-r6/`:

- `user-failure-session.json`: preserved original session, read without modifying the user profile.
- `baseline/result.json`: unchanged R5 Desktop app passes both editions after relaunch, including real unit renderer bindings and 18 building families per edition.
- `tests.log`: 13 tests, 79 assertions, zero failures, covering retry recovery/exhaustion, optional fallback, identity failures, path restrictions and complete-density behavior.
- `typecheck.log`: entry typecheck passes.
- `transient-recovery.json`: inject one `ENOENT` for the real Desktop Conscript manifest without changing any files; the second registration restores HD and leaves only the accepted Original exceptions.

The final clean-source build, new Desktop delivery and native validation receipts are recorded separately under this evidence directory. The user subsequently approved the review and confirmed normal operation; see the [acceptance receipt](hd-resource-startup-r6-acceptance.json). The exact original filesystem trigger remains unconfirmed; bounded recovery addresses the observed startup failure and prevents an incomplete bundled registration from silently becoming an Original session.

## Delivery lesson

Verify the copied Desktop app against its own discovered sibling resources, using isolated profiles. Require both registration completeness and actual in-match building/unit HD activation. Menu icons alone are not evidence that gameplay HD is active. Preserve original failure logs before restarting, and distinguish an observed missing-file error from speculation about its operating-system cause.

## Accepted main baseline

The user accepted the delivered R6 app and requested applying the update to main. Runtime commit `bd25c83` and delivery evidence commit `a28914c` were already on local `main`; ancestry and a clean checkout were verified before recording acceptance. This closes the reported HD regression review, with the R5 speed reduction and earlier corrections retained. The original delivery receipt remains unchanged as historical evidence. No runtime rebuild, resource replacement, profile change or remote push was needed. Continue corrections to this accepted result in the same task.
