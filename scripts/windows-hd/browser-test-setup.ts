// Set the requested document edition before importing any cached engine modules.
if (process.env.RA2_TEST_EDITION) {
    if (!['ra2', 'yr'].includes(process.env.RA2_TEST_EDITION)) throw Error('Invalid test edition');
    (globalThis as any).location = { search: `?edition=${process.env.RA2_TEST_EDITION}` };
}
// The particle runtime installs its legacy Three facade on the browser global.
(globalThis as any).window ??= globalThis;
await import('../../src/setupThreeGlobal');
