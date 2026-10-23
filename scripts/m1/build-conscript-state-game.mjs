import { build } from 'vite';
await build({ build: { outDir: process.env.M11_STATE_BUILD ?? '.artifacts/m1-1/state-validation/build-v1' },
    plugins: [{ name: 'isolated-conscript-state-fixture', transformIndexHtml: { order: 'pre', handler() {
        return [{ tag: 'script', attrs: { type: 'module', src: '/scripts/m1/conscript-state-fixture.ts' }, injectTo: 'head' }];
    } } }] });
