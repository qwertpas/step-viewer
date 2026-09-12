import { createServer } from 'node:http';
import { access, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const local = dirname(fileURLToPath(import.meta.url));
const repo = resolve(local, '../..');
const [baseline, portArg = '5180'] = process.argv.slice(2);
if (!baseline || baseline === '--help') {
  console.log('Usage: node scripts/browser-check/server.mjs /path/to/baseline/dist [port]');
  process.exit(baseline ? 0 : 1);
}
const port = Number(portArg);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535');
const roots = { before: resolve(baseline), after: join(repo, 'dist') };
await Promise.all(Object.values(roots).map(root => access(join(root, 'index.html'))));
const reports = await mkdtemp(join(tmpdir(), 'step-viewer-browser-check-'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml' };
const instrumentation = `<script>
window.cadBenchmark = { latest: null, phases: [], errors: [] };
const OriginalWorker = window.Worker;
window.Worker = class extends OriginalWorker {
  constructor(...args) {
    super(...args);
    this.addEventListener('message', ({data}) => {
      if (data.progress) window.cadBenchmark.phases.push({stage: data.progress, at: performance.now()});
      if (data.result?.geometries) window.cadBenchmark.latest = {stats: data.result.stats, timings: data.result.timings || {}, cached: Boolean(data.result.cached), receivedAt: performance.now(), sentAt: this.sentAt};
      if (data.error) window.cadBenchmark.errors.push(data.error);
    });
  }
  postMessage(message, ...rest) {
    if (message.type === 'open') this.sentAt = performance.now();
    return super.postMessage(message, ...rest);
  }
};
window.addEventListener('error', event => window.cadBenchmark.errors.push(event.message));
window.addEventListener('unhandledrejection', event => window.cadBenchmark.errors.push(String(event.reason)));
</script>`;

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'POST' && ['/results', '/regression-results'].includes(url.pathname)) {
      let body = '';
      for await (const chunk of request) { body += chunk; if (body.length > 2_000_000) throw new Error('Report too large'); }
      JSON.parse(body);
      const name = url.pathname === '/results' ? 'results.json' : 'regression-results.json';
      await writeFile(join(reports, name), body);
      response.end('Saved ' + join(reports, name));
      return;
    }
    if (url.pathname === '/manifest') {
      const versions = {};
      for (const [name, root] of Object.entries(roots)) {
        const files = await readdir(join(root, 'assets'));
        const wasmFile = files.find(file => file.endsWith('.wasm'));
        const wasm = await readFile(join(root, 'assets', wasmFile));
        versions[name] = {root, wasmFile, wasmBytes: wasm.length, wasmHash: createHash('sha256').update(wasm).digest('hex')};
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(versions));
      return;
    }
    if (['/regression.html', '/regression.js'].includes(url.pathname)) {
      response.setHeader('Content-Type', types[extname(url.pathname)]);
      response.end(await readFile(join(local, url.pathname.slice(1))));
      return;
    }
    if (url.pathname.startsWith('/fixtures/')) {
      const name = url.pathname.slice('/fixtures/'.length);
      if (!['bracket.step', 'nested-brackets.step'].includes(name)) throw new Error('Unknown fixture');
      response.setHeader('Content-Type', 'application/step');
      response.end(await readFile(join(repo, 'test/fixtures', name)));
      return;
    }
    const [, version, ...segments] = decodeURIComponent(url.pathname).split('/');
    const root = roots[version];
    const path = root ? resolve(root, segments.join('/') || 'index.html') : join(local, 'index.html');
    if (root && !path.startsWith(root + '/')) throw new Error('Invalid path');
    let data = await readFile(path);
    if (root && extname(path) === '.html') data = Buffer.from(data.toString().replace('<head>', '<head>' + instrumentation));
    response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    response.end(data);
  } catch (error) {
    response.statusCode = 500;
    response.end(error.message);
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Open http://127.0.0.1:${port}/ manually or with Computer Use.`);
  console.log(`Original: ${roots.before}\nOptimized: ${roots.after}`);
  console.log(`Reports: ${reports}/results.json and ${reports}/regression-results.json`);
});
