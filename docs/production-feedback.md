# Production feedback correction

The edition selector draft is user-approved. The full dual-edition skirmish objective remains in progress.

Queued sidebar items now retain the complete pale-yellow clock mask at frame 1; only active production advances the sweep. Quantity, Ready and Hold text return to weight 700. Cameo name labels retain their accepted styling. The earlier asynchronous HD frame retention and separate hover-border depth remain intact.

Factory delivery plays the local owner's original selection response when a dedicated CreateSound is absent. Units with CreateSound keep their dedicated sound without duplication. Initial forces and unrelated spawns do not emit the fallback response. Successful vehicle-to-building morphs play the configured DeploySound, or retail BuildingSlam/PlaceBuilding at the surviving building. Infantry stance feedback now correctly distinguishes deploy from undeploy.

Validation: four focused tests / 20 assertions pass. Native Electron Allied and Soviet skirmishes pass with HD enabled and disabled: a queued engineer retains the full mask, later advances, is actually produced, and plays its faction-specific original response. MCV deployment requests PlaceBuilding. Nonzero decoded PCM reaches a running AudioContext. All quantity/status canvases use bold font weight; no page or GL errors were observed. This proves software playback, not a human listening test.

Evidence: `.artifacts/editions/build-feedback-v1`, `feedback-native-soviet-v6/result.json`, and `feedback-native-allied-v1/result.json`. Earlier failed harness runs are retained; they used the audio adapter instead of AudioSystem for instrumentation, then an incorrect assumed engineer sound name. The final harness observes the real system and retail EngAllSelect/EngSovSelect names.

Continue the same task with Yuri mechanics, AI and complete-match validation. No new test package or completed dual-edition release is claimed here.
