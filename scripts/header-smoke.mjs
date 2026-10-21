import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].find(existsSync);
if (!chrome) throw new Error('Chrome or Edge is required for this UI smoke check.');

const profile = await mkdtemp(path.join(os.tmpdir(), 'nexus-header-smoke-'));
const browser = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore', windowsHide: true });
let socket;

const waitFor = async (read, timeout = 15000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await read().catch(() => null);
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for browser state.');
};

try {
  const port = await waitFor(async () => {
    const text = await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8');
    return Number(text.split('\n')[0]) || null;
  });
  const tab = await waitFor(async () => {
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return tabs.find(item => item.type === 'page');
  });
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const pending = new Map();
  let id = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    pending.set(next, { resolve, reject });
    socket.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const click = async selector => {
    const rect = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    assert(rect, `Missing control: ${selector}`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  };

  await send('Page.navigate', { url: 'http://localhost:3000/about.html' });
  await waitFor(() => evaluate("document.querySelector('#notificationBtn') && document.readyState === 'complete'"));
  await waitFor(() => evaluate("!!document.querySelector('.theme-switch button[data-theme=\"dark\"] svg')"));
  await click('.theme-switch button[data-theme="light"]');
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'light');
  await waitFor(() => evaluate("getComputedStyle(document.querySelector('.theme-switch button[data-theme=\"dark\"]')).color === 'rgb(17, 19, 21)'"));
  await click('.theme-switch button[data-theme="dark"]');
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark');
  await waitFor(() => evaluate("getComputedStyle(document.querySelector('.theme-switch')).backgroundColor === 'rgb(19, 27, 46)'"));
  await waitFor(() => evaluate("getComputedStyle(document.querySelector('.theme-switch button[aria-pressed=\"true\"]')).backgroundColor === 'rgb(91, 143, 242)'"));
  assert.equal(await evaluate("getComputedStyle(document.querySelector('a.icon-link svg')).color"), 'rgb(231, 236, 251)');
  await click('.theme-switch button[data-theme="eye"]');
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'eye');
  await waitFor(() => evaluate("getComputedStyle(document.querySelector('.theme-switch')).backgroundColor === 'rgb(251, 243, 228)'"));
  await waitFor(() => evaluate("getComputedStyle(document.querySelector('.theme-switch button[data-theme=\"dark\"]')).color === 'rgb(60, 46, 30)'"));
  await waitFor(() => evaluate("getComputedStyle(document.querySelector('.theme-switch button[aria-pressed=\"true\"]')).backgroundColor === 'rgb(74, 52, 24)'"));
  assert.equal(await evaluate("getComputedStyle(document.querySelector('a.icon-link svg')).color"), 'rgb(60, 46, 30)');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#notificationBtn svg')).color"), 'rgb(60, 46, 30)');
  await click('#notificationBtn');
  assert.equal(await evaluate('document.querySelector("#notificationPanel").hidden'), false);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#notificationPanel')).color"), 'rgb(60, 46, 30)');
  await click('#closeNotifications');
  assert.equal(await evaluate('document.querySelector("#notificationPanel").hidden'), true);
  assert.equal(await evaluate("document.querySelector('a.icon-link')?.getAttribute('href')"), 'messages.html');
  await click('a.icon-link');
  await waitFor(() => evaluate("location.pathname.endsWith('/login.html') && new URLSearchParams(location.search).get('next') === 'messages.html'"));
  console.log('Header theme, notification, and messages controls passed in a browser.');
} finally {
  socket?.close();
  browser.kill();
  if (path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep)) {
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
