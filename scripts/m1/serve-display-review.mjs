// Fresh M1.4 browser build; local retail and HD routes stay outside the build.
process.env.M12_BUILD_DIR = '.artifacts/m1-4/build';
process.env.M12_PORT = process.env.M14_PORT ?? '4034';
await import('./serve-power-plant-game.mjs');
console.log(`M1.4 display review: http://127.0.0.1:${process.env.M12_PORT}/?power-plant-hd=4&conscript-hd=4`);
