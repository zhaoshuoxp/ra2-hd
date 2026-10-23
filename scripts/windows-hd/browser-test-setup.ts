// The particle runtime installs its legacy Three facade on the browser global.
(globalThis as any).window ??= globalThis;
await import('../../src/setupThreeGlobal');
