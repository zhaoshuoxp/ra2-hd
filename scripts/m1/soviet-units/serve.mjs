import fs from 'node:fs/promises';
import { preview } from 'vite';
import { registerHdResources } from '../../../desktop/hd-profile.mjs';
const hd = await registerHdResources('.local');
const server = await preview({
  build: { outDir: '.artifacts/m1-7/baseline-build' },
  preview: { host: '127.0.0.1', port: 4297, strictPort: true },
  plugins: [
    {
      name: 'unit-isolated-resources',
      configurePreviewServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (hd.selections.has(req.url)) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(hd.selections.get(req.url)));
            return;
          }
          const file = hd.routes.get(req.url);
          if (file) {
            res.setHeader(
              'Content-Type',
              req.url.endsWith('.png') ? 'image/png' : 'application/octet-stream',
            );
            res.end(await fs.readFile(file));
            return;
          }
          next();
        });
      },
    },
  ],
});
console.log(server.resolvedUrls.local[0]);
