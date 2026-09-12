const $ = (id) => document.getElementById(id);
const points = { top: [.544131, .489792], ring: [.242557, .399863], circle: [.289695, .427946] };
const topArea = 'Face area: 2,336.3827 mm²';
let report, current, frame, win, doc, errors;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function fitFrame() {
  if (!frame) return;
  const scale = Math.min($('stage').clientWidth / 1440, 1);
  frame.style.transform = `scale(${scale})`;
  $('stage').style.height = `${900 * scale}px`;
}
new ResizeObserver(fitFrame).observe($('stage'));
const frames = () => new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));
function q(selector, root = doc) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}
function text(selector) { return q(selector).textContent; }
function check(label, condition, actual) {
  if (!condition) throw new Error(`${label}${actual === undefined ? '' : `; received ${JSON.stringify(actual)}`}`);
  current.checks.push(label);
  $('status').textContent = `${current.name}: ${label}`;
}
async function until(label, predicate, timeout = 45000) {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeout) throw new Error(`Timed out: ${label}; viewer status=${text('#status')}; selection=${text('#selection-result')}`);
    await delay(25);
  }
  check(label, true);
}
async function equals(selector, expected) {
  await until(`${selector} = ${expected}`, () => text(selector) === expected);
}
async function click(target) {
  const element = typeof target === 'string' ? q(target) : target;
  check(`Enabled ${element.id || element.getAttribute('aria-label') || element.textContent}`, !element.disabled);
  element.click();
  await frames();
}
async function key(key, extra = {}) {
  doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
  await frames();
}
async function undo(redo = false) {
  const mac = /Mac|iPhone|iPad|iPod/.test(win.navigator.platform);
  await key('z', { metaKey: mac, ctrlKey: !mac, shiftKey: redo });
}
async function clickModel(point, shiftKey = false) {
  const canvas = q('#canvas canvas'), bounds = canvas.getBoundingClientRect();
  const position = { clientX: bounds.left + bounds.width * point[0], clientY: bounds.top + bounds.height * point[1] };
  const common = { ...position, pointerId: 41, pointerType: 'mouse', isPrimary: true, button: 0, bubbles: true, cancelable: true, composed: true, shiftKey };
  canvas.dispatchEvent(new win.PointerEvent('pointermove', { ...common, buttons: 0 }));
  await frames();
  canvas.dispatchEvent(new win.PointerEvent('pointerdown', { ...common, buttons: 1 }));
  canvas.dispatchEvent(new win.PointerEvent('pointerup', { ...common, buttons: 0 }));
  await frames();
}
async function fresh() {
  frame = document.createElement('iframe');
  frame.title = 'Optimized viewer under regression test';
  const loaded = new Promise((resolve, reject) => { frame.onload = resolve; frame.onerror = reject; });
  frame.src = '/after/?regression=' + Date.now();
  $('stage').replaceChildren(frame); fitFrame();
  await loaded;
  win = frame.contentWindow; doc = frame.contentDocument;
  await frames();
  errors = [];
  win.addEventListener('error', event => errors.push(event.message));
  win.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
  check('Viewer iframe is 1440 × 900', win.innerWidth === 1440 && win.innerHeight === 900, [win.innerWidth, win.innerHeight]);
  check('Viewer loaded without errors', win.cadBenchmark.errors.length === 0, win.cadBenchmark.errors);
  // DOM-generated pointers have no native active pointer, so emulate capture bookkeeping only.
  const canvas = q('#canvas canvas'), captures = new Set();
  canvas.setPointerCapture = id => captures.add(id);
  canvas.releasePointerCapture = id => captures.delete(id);
  canvas.hasPointerCapture = id => captures.has(id);
}
async function open(name, bytes) {
  const transfer = new win.DataTransfer();
  transfer.items.add(new win.File([bytes], name, { type: 'application/step' }));
  const input = q('#file-input');
  input.files = transfer.files;
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
  await until(`Open ${name}`, () => q('#loading').hidden);
  await equals('#file-name', name);
  check(`Loaded ${name} with CAD parts`, /^\d+ parts?$/.test(text('#status')), text('#status'));
  await frames();
}
const children = item => [...item.querySelectorAll(':scope > .component-children > .component-item')];
const row = item => q(':scope > .component-row', item);
const visibility = item => q('.visibility-button', row(item));
function pressed(item, expected) {
  check(`${q('.component-name', row(item)).textContent}: ${expected}`, visibility(item).getAttribute('aria-pressed') === expected, visibility(item).getAttribute('aria-pressed'));
}
const expand = item => click(q('.branch-button', row(item)));
const rowCount = () => doc.querySelectorAll('.component-row').length;
const visibleRows = () => [...doc.querySelectorAll('.component-row')].filter(row => row.getClientRects().length).length;

async function cacheCase(fixtures) {
  await open('bracket.step', fixtures.bracket);
  const stats = text('#model-stats');
  check('Measure and Section are enabled', !q('#measure').disabled && !q('#section').disabled);
  await open('bracket.step', fixtures.bracket);
  check('Cached reopen preserves statistics', text('#model-stats') === stats, text('#model-stats'));
  const measures = win.performance.getEntriesByType('measure').map(entry => entry.name);
  check('Cached reopen records load but no kernel run', measures.includes('cad-load') && !measures.includes('cad-kernelMs'), measures);
  const transfer = new win.DataTransfer();
  transfer.items.add(new win.File(['invalid STEP'], 'broken.step', { type: 'text/plain' }));
  q('#file-input').files = transfer.files;
  q('#file-input').dispatchEvent(new win.Event('change', { bubbles: true }));
  await until('Invalid replacement completes', () => q('#loading').hidden);
  await equals('#status', 'No solid CAD geometry was found');
  await equals('#file-name', 'bracket.step');
  await click('#measure'); await clickModel(points.top);
  await equals('#selection-result', topArea);
  await open('bracket.step', fixtures.bracket);
}
async function treeCase(fixtures) {
  await open('nested-brackets.step', fixtures.assembly);
  await equals('#status', '4 parts');
  const root = q('#component-tree > .component-item');
  const [left, right] = children(root);
  check('Root and banks retain their names', q('.component-name', row(root)).textContent === 'Viewer fixture' && q('.component-name', row(left)).textContent === 'Left bank' && q('.component-name', row(right)).textContent === 'Right bank');
  check('Only root and collapsed banks are mounted', rowCount() === 3 && children(left).length === 0, rowCount());
  await click(visibility(left)); pressed(left, 'false'); pressed(right, 'true'); pressed(root, 'mixed');
  await expand(left);
  const [pair] = children(left);
  check('Pair starts collapsed and unmounted', q('.component-name', row(pair)).textContent === 'Bracket pair' && children(pair).length === 0);
  pressed(pair, 'false'); await expand(pair);
  const [first, second] = children(pair);
  check('Nested bracket names are retained', q('.component-name', row(first)).textContent === 'Bracket_1' && q('.component-name', row(second)).textContent === 'Bracket_2');
  pressed(first, 'false'); pressed(second, 'false');
  await click(visibility(first)); pressed(pair, 'mixed'); pressed(left, 'mixed');
  await click('#show-all'); pressed(root, 'true'); pressed(second, 'true');
  await expand(right); const [otherPair] = children(right); await expand(otherPair);
  check('All four levels mount exactly nine rows', rowCount() === 9, rowCount());
  pressed(children(otherPair)[0], 'true'); pressed(children(otherPair)[1], 'true');
  await undo(); pressed(first, 'true'); pressed(second, 'false'); pressed(left, 'mixed'); pressed(right, 'true');
  await undo(); pressed(left, 'false'); await undo(); pressed(root, 'true');
  await undo(true); pressed(left, 'false'); pressed(right, 'true');
  await click('#collapse-tree'); check('Collapse all leaves only the root visible', visibleRows() === 1, visibleRows());
  await click('#expand-tree'); check('Expand all reveals nine rows', visibleRows() === 9, visibleRows());
  pressed(first, 'false'); pressed(children(otherPair)[0], 'true');
  await click('#hide-all'); pressed(root, 'false'); pressed(right, 'false');
  await undo(); pressed(left, 'false'); pressed(right, 'true');
}
async function measureCase(fixtures) {
  await open('bracket.step', fixtures.bracket);
  await clickModel(points.top); await equals('#selection-result', 'Selected');
  check('Picked body selects one tree row', doc.querySelectorAll('.component-row.selected').length === 1);
  await key('Escape'); check('Escape clears the part selection', q('#selection-panel').hidden);
  await click('#measure'); await clickModel(points.top); await equals('#selection-result', topArea);
  await clickModel(points.ring, true); await equals('#selection-result', 'Minimum distance: 10 mm');
  await equals('#dimension-label', '10 mm'); check('Distance label is visible', !q('#dimension-label').hidden);
  await clickModel(points.circle); await equals('#selection-result', 'Diameter: 18 mm\nRadius: 9 mm');
  await equals('#dimension-label', 'Ø 18 mm');
  await click('#clear-selection'); await equals('#selection-result', 'Select a face or edge');
  check('Clear removes the dimension label', q('#dimension-label').hidden);
}
async function sectionCase(fixtures) {
  await open('bracket.step', fixtures.bracket);
  await click('#section'); check('Section picking disables measurement', q('#measure').disabled); check('Section fields wait for a planar face', q('#section-fields').hidden);
  await clickModel(points.top); await until('Planar section chosen', () => !q('#section-fields').hidden);
  check('New section offset is zero', q('#section-offset').value === '0', q('#section-offset').value);
  q('#section-offset').value = '-6'; q('#section-offset').dispatchEvent(new win.Event('input', { bubbles: true })); await frames();
  await click('#section-done'); check('Done closes editing and keeps section active', q('#section-panel').hidden && q('#section').getAttribute('aria-pressed') === 'true');
  await click('#measure'); await clickModel(points.top); await equals('#selection-result', 'Select a face or edge');
  await click('#section'); await click('#section-flip'); check('Flip retains the offset', q('#section-offset').value === '-6', q('#section-offset').value);
  await click('#section-done'); await click('#measure'); await clickModel(points.top); await equals('#selection-result', topArea);
  await click('#section'); await click('#section-pick'); await clickModel(points.ring);
  await until('Picking another face resets the offset', () => q('#section-offset').value === '0');
  await click('#section-clear'); check('Clear disables section and enables measurement', q('#section-panel').hidden && q('#section').getAttribute('aria-pressed') === 'false' && !q('#measure').disabled);
  await click('#measure'); await clickModel(points.top); await equals('#selection-result', topArea);
}
async function save() {
  const json = JSON.stringify(report, null, 2);
  $('json').textContent = json;
  const response = await fetch('/regression-results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json });
  if (!response.ok) throw new Error(await response.text());
}
const cases = [
  ['Cached open and failed replacement retain exact CAD', cacheCase],
  ['Lazy nested hierarchy, visibility, undo and redo', treeCase],
  ['Exact area, two-face distance and circular diameter', measureCase],
  ['Section offset, clipping, Flip, Pick face and Clear', sectionCase],
];
$('run').onclick = async () => {
  $('run').disabled = true; $('cases').replaceChildren();
  report = { startedAt: new Date().toISOString(), browser: navigator.userAgent, viewport: { width: 1440, height: 900 }, method: 'Visible button initiated regression in same-origin production-viewer iframe; browser DOM file, keyboard and pointer events; capture bookkeeping emulated for synthetic pointers; no external browser automation.', complete: false, cases: [] };
  try {
    report.versions = await (await fetch('/manifest')).json();
    const files = await Promise.all(['bracket.step', 'nested-brackets.step'].map(async name => {
      const response = await fetch('/fixtures/' + name); if (!response.ok) throw new Error(await response.text()); return response.arrayBuffer();
    }));
    const fixtures = { bracket: files[0], assembly: files[1] };
    for (const [name, run] of cases) {
      current = { name, status: 'RUNNING', checks: [] }; report.cases.push(current);
      const item = document.createElement('li'); item.className = 'running'; item.textContent = 'RUNNING · ' + name; $('cases').append(item);
      const started = performance.now();
      try {
        await fresh(); await run(fixtures); check('No uncaught browser errors', errors.length === 0, errors); current.status = 'PASS';
      } catch (error) { current.status = 'FAIL'; current.error = error.message; current.stack = error.stack; current.browserErrors = errors; }
      current.durationMs = performance.now() - started;
      item.className = current.status.toLowerCase(); item.textContent = `${current.status} · ${name} · ${current.checks.length} checks${current.error ? ' · ' + current.error : ''}`;
      await save();
    }
    report.complete = true;
    report.passed = report.cases.filter(item => item.status === 'PASS').length;
    $('status').textContent = `${report.passed}/4 PASS. Results saved locally; see the server output for the path.`;
  } catch (error) { report.error = error.message; $('status').textContent = 'Runner failed: ' + error.message; }
  finally { report.finishedAt = new Date().toISOString(); await save(); $('run').disabled = false; }
};
