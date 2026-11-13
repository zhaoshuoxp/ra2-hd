# Main maintenance and next-stage assessment

Date: 2026-11-09. Starting main: `ed58760448f9d792862ad9572bf992d106a48e30`. Accepted runtime: `3cc718033e04a46344b463405d485b78988d8181`. This task changes maintenance documentation and historical storage only; no gameplay, selected artwork, resource selection, package or feature is changed.

## Cleanup outcome

The workspace occupied 130.59 GiB before this pass and 109.72 GiB after it, measured with one `du` traversal per snapshot. Filesystem free space increased by 20,480,000,000 bytes, approximately 20.5 GB / 19.1 GiB. Allocated-directory reduction and filesystem free-space increase differ because of shared storage, allocation and background activity.

| Remaining directory | Allocated size |
| --- | ---: |
| Canonical `ra2-hd` | 25.00 GiB |
| Historical sources and evidence | 59.37 GiB |
| Accepted combined YR r6 application folder | 11.87 GiB |
| Accepted RA2 V56 application folder | 10.59 GiB |
| Original retail installation | 2.69 GiB |
| Finished showcase folders | 0.18 GiB |

The pass consolidated 13,516 byte-identical historical files using hard links after SHA256, ownership, permissions, flags and extended-attribute comparisons. Their paths and content remain available. Three candidates with differing metadata were retained independently. Historical duplicates now share the retained inode and modification time; copy an input to a fresh output path before modifying it. No link was created into canonical resources or accepted apps. Detailed operations and hashes remain in `../project-history/main-maintenance-20261109/operations.jsonl` and `dedup-plan.json`.

The pass also retired 1,426 redundant full-frame context captures from passing road/Lunar diagnostic cases. Every corresponding native detail crop, report and at least one full-frame context per case remain. Failed cases, source artwork, final review boards and the self-contained accepted application review were preserved. Exact retired filenames/hashes are in `retired-context-captures.json.gz`; each affected case has a `context-capture-retirement.json` notice. Old report image paths are provenance where explicitly retired, not missing runtime resources. This retirement recovered a further measured 8.192 GB after deduplication.

Rebuildable subtitle Swift module cache and cleanup Python bytecode cache were removed, totaling approximately 93 MB. The original installation, canonical `.local`, source implementation, actual saves/settings, dependencies, unique authoring inputs, both accepted apps, finished showcase material and Git history remain. The historical directory still contains unique inputs and retained evidence; this pass does not claim it is a minimal distribution payload. No complete obsolete application was recreated or archived.

The first native Python attempt stopped before any mutation because this Python lacks `os.listxattr`. The audited script uses the macOS native extended-attribute API instead; candidates with different attributes are not consolidated.

## Verification and development state

- Before/after protection checks preserve 119,322 file/link metadata records during consolidation. After documentation changes and screenshot retirement, 118,894 non-Git protected metadata records remain exact. These are metadata comparisons, not a new full-content rehash of canonical assets.
- All consolidated file groups were content-hash checked before and after replacement. All 2,301 historical directory aliases still resolve. Every retired screenshot has its retained detail crop, context and report checked.
- Five pre-existing YR diagnostic working files retain their exact recorded SHA256 values. They remain uncommitted; the workspace must not be described as clean.
- Both accepted V56 and r6 apps pass `codesign --verify --deep --strict`.
- The final focused resource check covers time-machine registration, Lunar source/2X/4X/fallback and the complete castle collapse family. Its log is `resource-check-final.log` in the maintenance receipt directory.
- The earlier accepted 2,201-case full-suite result is retained. This storage-only pass does not repeat the complete suite, native gameplay or visual acceptance. Windows and physical 8/16 GiB targets remain unrun.

The workspace navigation and repository development notes now describe the accepted 40-map campaign state. The maintenance commit includes only its three documentation files. The five unrelated working files are neither committed nor deleted. No branch, worktree, agent, remote push, release, upload or new implementation has started.

## Corrected next scope: M3.4 HD cinematics

User clarification: the installed movies still use original low-resolution footage. The 40-map campaign acceptance covers implemented gameplay, HD map/object artwork and media behavior; it does not establish HD movie delivery. The campaign HD content milestone retains this outstanding work. Prioritize M3.4 before the proposed M4.1 combined-edition stabilization.

1. Inventory actual RA2/YR media by edition, original movie identity/hash, mission/use, duration, aspect ratio, audio and subtitles. Cover opening/briefing, victory/ending and in-game radar transmissions. Equal filenames across editions can have different cuts; reuse the existing edition-aware binding logic.
2. Research downloadable community masters and independently assess representative live-action, rendered-action and radar clips. Confirm full coverage, uncut timing, language and visible quality before treating a source as eligible. No HD footage has been downloaded or accepted in this planning task.
3. Review a small group of samples at their intended full-screen/radar display sizes before batch conversion. Prefer faithful restoration with original composition and timing. Preserve the selected original audio/subtitle synchronization; assess resolution, frame rate and encoding through actual playback rather than requiring 4K/60fps for every clip.
4. Add optional HD media resolution through the existing web/Electron media pipeline, keeping original footage as fallback for absent or undecodable replacements. Use independent versioned media manifests and integrity checks. Do not change original campaign triggers, save semantics, simulation timing or overwrite retail archives. Existing native-game DLL modifications are not required by this application's HTML video architecture.
5. Validate representative new-game introductions, direct mission selection, radar playback/restore, skipping, subtitles/audio, ending/next-mission flow and scene exit. Check both editions and both playback placements without repeating the accepted forty-mission gameplay matrix. Expand coverage checks to every selected movie binding.
6. After visual approval and focused Mac checks, complete the HD movie pack and report exact coverage and fallback entries. Then prepare M4.1 combined-edition Windows verification, targeted stability/performance work and final package organization. Keep the user's accepted performance boundary; 90 FPS is not a mandatory gate.

Start M3.4 in a new execution conversation when explicitly authorized. The present correction updates planning only; it does not begin downloading, processing, implementing or publishing movies. Same-outcome campaign repairs can remain in the existing campaign execution conversation.
