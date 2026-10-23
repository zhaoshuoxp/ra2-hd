// Isolated build of the production C renderer; historical M1.4 builds stay intact.
process.env.M12_BUILD_DIR = '.artifacts/m1-4/pause-and-shroud/build-v4';
process.env.M12_PORT = process.env.M14_PORT ?? '4034';
await import('./serve-power-plant-game.mjs');
