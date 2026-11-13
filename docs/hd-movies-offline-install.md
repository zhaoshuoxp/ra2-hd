# Offline HD movie pack

The complete M3.4 Mac app already contains the movie pack and the original movie fallback. Open Options and enable **HD movies**. The choice applies to the next clip and is independent of Original/2X/4X artwork density. Both edition preferences are saved separately.

The independent `downloaded-1080p-r1` pack contains 136 complete identities: 80 RA2 and 56 Yuri's Revenge, with 53 full-screen and 83 radar films. Its `hd-movie-selection.json` selects `media/hd-movies/downloaded-1080p-r1/manifest.json`. Every movie has a pinned retail source identity, byte count, SHA256, original-audio provenance, source clock and caption timeline. Keep both items together. No network service, subscription or API is needed for installation or playback.

To add the independent pack to an existing imported resource folder, unpack it and run:

```sh
python3 install-pack.py --resource-root /absolute/path/to/imported/resources
```

For this repository the resource folder is `/Users/Aone/RA2remaster/ra2-hd/.local`. The installer checks all 136 files before selecting the pack, preserves immutable existing revisions and refuses a different active selection. To replace an existing selection while retaining its previous pointer, add `--replace-selection`. Restart the app after installation. The imported original resources are still required.

Do not install into a signed `.app` bundle. Use the delivered complete app or an external imported resource folder. Copying files into a signed bundle invalidates its signature.

For manual installation, copy the `media/hd-movies/downloaded-1080p-r1` directory to the same relative location in the imported resource folder, then copy `hd-movie-selection.json` to that folder. Retain any previous selection pointer before replacing it. Disable **HD movies** to use the original clips. Removing the new selection pointer also restores original playback; keep the original media files.

The player validates the selected identity and streams video from disk. Missing, mismatched, damaged or unsupported HD entries use the original movie. The 51 downloaded full-screen films use native 1440x1080 and 60 fps. All 83 retained HD radar films use 560x440 and 15 fps; two unavailable library-only movies retain their prior HD files. The original audio packet and game-caption clocks remain exact. Upstream interpolation, variable picture phase, cut blends, motion blur, soft boundaries and MRZJL watermark remain intact. Use the updated r4 runtime for the 60 fps pack; the complete r4 Mac app already includes it and the Yuri menu title.

The user selected the downloaded full-screen sources and explicitly retained the existing HD radar movies. Complete-film visual acceptance remains pending final review. Native validation covers Mac arm64. Windows playback and physical 8/16 GiB memory targets were not tested. The pack and complete app are private local deliverables; no publication is authorized.
