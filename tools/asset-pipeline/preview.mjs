import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const modelRoutes = new Map([
  ['/', ['preview.html', 'text/html; charset=utf-8']],
  ['/preview-page.mjs', ['preview-page.mjs', 'text/javascript; charset=utf-8']],
]);
const threeRoot = resolve(fileURLToPath(new URL('../../node_modules/three/', import.meta.url)));

async function servePreview(bytes, spec) {
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://127.0.0.1').pathname;
      if (modelRoutes.has(path)) {
        const [filename, type] = modelRoutes.get(path);
        response.writeHead(200, { 'Content-Type': type });
        response.end(await readFile(new URL(filename, import.meta.url)));
      } else if (path === '/candidate.glb') {
        response.writeHead(200, { 'Content-Type': 'model/gltf-binary' }).end(bytes);
      } else if (path === '/spec.json') {
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(spec));
      } else if (path.startsWith('/three/')) {
        const location = resolve(threeRoot, decodeURIComponent(path.slice(7)));
        if (!location.startsWith(threeRoot + sep) || !location.endsWith('.js')) {
          response.writeHead(404).end();
          return;
        }
        const data = await readFile(location);
        response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(data);
      } else if (path === '/favicon.ico') {
        response.writeHead(204).end();
      } else {
        response.writeHead(404).end();
      }
    } catch {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

export async function capturePreview(bytes, spec, directory, channel, screenshots) {
  const server = await servePreview(bytes, spec);
  let browser;
  try {
    browser = await chromium.launch({
      channel, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 780, height: 620 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.evaluate(async () => { await window.ready; });
    const shots = ['front', 'side', 'back', 'isometric'].map(view => ({ view, filename: view + '.png' }));
    for (const [name, item] of Object.entries(spec.animations)) {
      shots.push({ view: 'action', name, time: item.sample, filename: 'animation-' + name.toLowerCase() + '.png' });
    }
    for (const { view, name, time, filename } of shots) {
      await page.evaluate(async data => (await window.ready).render(data.view, data.name, data.time), { view, name, time });
      await page.screenshot({ path: resolve(directory, filename), animations: 'disabled' });
      screenshots.push(filename);
    }
    const metrics = await page.evaluate(async () => (await window.ready).benchmark());
    if (errors.length) throw new Error(errors.join('\n'));
    return { ...metrics, browser: browser.version() };
  } finally {
    try {
      await browser?.close();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
}

