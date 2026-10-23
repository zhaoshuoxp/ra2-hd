# Yuri R11 motion reference and implementation

This correction covers Chaos Drone gas motion and Floating Disc surface rotation. Accepted unit mother images, installed resource families, weapon rules and camera geometry remain unchanged. Visual acceptance of the new motion is pending.

## Reference evidence

- Retail `cdgas.shp` has a 268 × 150 canvas and 40 frames (39 distinct pixel hashes). SHA-256: `6c3ab540f73736e71d6fe24e761048eae4b6d394078cca74a22fa0679d7c74d6`.
- Retail `[CDGAS]` uses `Rate=450`, `Flat=true`, and `Translucent=no`. The project's existing parser resolves that rate to 7.5 frames per second multiplied by game speed. The native sequence emits narrow streams, expands into broken arcs, forms a cloud ring and dissipates.
- R10 Original-resource and HD recordings both advance through the native sequence. A stopped frame counter was not reproduced. Repeated attacks overlap long ring stages, and discrete palette frames make that stage look static.
- Original-resource comparison recordings use the project engine. They are not recordings of the Westwood executable.
- Public gameplay reference: [MasterofRoflness, Floating Discs of Yuri](https://www.youtube.com/watch?v=r9kVlfDfLOI&t=2052). Twenty browser-displayed frames at 50 ms intervals were captured from 2052.385 to 2053.335 seconds. This is a public gameplay recording, not a newly run local retail game; its executable revision and tick rate are not attested.
- The public sequence shows rim markings changing bearing around a complete circular body during movement. Camera scroll and unit translation must be separated from surface rotation. The available frames support a qualitative motion comparison; they do not establish an exact revolution duration.
- Retail `disk.vxl` is a lower plate; `disktur.vxl` contains the visible disc/cabin turret. The accepted HD bearing images repeat essentially the same surface orientation. Crossfading those images changes registration and brightness without carrying a landmark around the rim.

## Selected changes

Chaos Drone HD gas uses the existing native indexed atlas and palette. Each cloud samples its current and next trimmed frame in the common SHP canvas, resolves palette colors before interpolation, and adds small continuous displacements inside the cloud. Emission, expansion and disappearance follow native frame timing. No additional atlas is allocated. Original mode and complete-family fallback retain the native SHP path. Each cloud owns and releases only its geometry and material.

The disc displays one canonical registered image per native component. A projected conical surface maps gold-plate seams, vents and red-collar markings around the turret axis. Constant surface radius retains the collar's height. The cabin roof uses the same conical longitude mapping while its outline remains registered. The occluded rear texture reuses the visible front surface, so this is an approximate surface reconstruction, not a full recovered 3D texture.

Silhouette alpha is always sampled at the original UV; base color and owner remap move together. Opaque, edge, depth and translucent coverage passes share the same phase. The previous eight-view crossfade and raised overlay are removed. Native translation, pitch, bank, shadows and joint transforms remain live. The R10 native 32-tick revolution cadence is retained; no claim of exact Westwood timing is made.

Received native headings are unwrapped in the forward direction, including skipped samples and 360-degree crossings. Rendering can interpolate within one native tick, and a stopped simulation settles at its last received heading. CPU tests cover this interpolation; a heavily loaded renderer may display discrete native phases rather than every intermediate phase.

## Validation boundaries

Focused tests cover native animation timing, forward rotation across zero and skipped samples, stable component registration, paired owner sampling on every coverage pass, shared atlas ownership and cloud disposal. Selected-package recordings additionally check native deploy/undeploy, smoke frame progression and cleanup, a complete disc revolution, eight flight bearings, and laser ring/ray lifecycle.

The first reconstructed mesh candidate was rejected for stretched textures and missing wedges. A subsequent elliptical collar mapping was rejected for dragging its red band across the roof. Diagnostic builds and failed reports are retained as superseded evidence. Only the conical mapping is eligible for delivery.

An exact freshly recorded Westwood comparison remains unavailable on this Mac. Windows validation, main integration and user visual acceptance remain separate from the local technical checks.
