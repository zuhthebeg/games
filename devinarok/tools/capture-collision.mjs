import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const outputDir = '/home/ubuntu/devinarok-shots/collide';
await mkdir(outputDir, { recursive: true });
const browserInfo = await fetch('http://127.0.0.1:9225/json/version').then((response) => response.json());
const browser = new WebSocket(browserInfo.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  browser.addEventListener('open', resolve, { once: true });
  browser.addEventListener('error', reject, { once: true });
});
let browserId = 0;
const browserPending = new Map();
browser.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  const request = browserPending.get(message.id);
  if (!request) return;
  browserPending.delete(message.id);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
});
function browserCommand(method, params = {}) {
  const id = ++browserId;
  return new Promise((resolve, reject) => {
    browserPending.set(id, { resolve, reject });
    browser.send(JSON.stringify({ id, method, params }));
  });
}

class Page {
  constructor(webSocketDebuggerUrl) {
    this.socket = new WebSocket(webSocketDebuggerUrl);
    this.id = 0;
    this.pending = new Map();
    this.exceptions = [];
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === 'Runtime.exceptionThrown') this.exceptions.push(message.params.exceptionDetails.text);
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
    });
  }
  async ready() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async wait(expression, timeout = 30000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      if (await this.evaluate(expression)) return;
      await delay(100);
    }
    throw new Error(`Timed out: ${expression}`);
  }
  async capture(name) {
    await this.evaluate('window.__devinarok.render()');
    const screenshot = await this.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
    });
    const path = `${outputDir}/${name}.png`;
    const data = Buffer.from(screenshot.data, 'base64');
    if (data.readUInt32BE(16) !== 390 || data.readUInt32BE(20) !== 844) {
      const viewport = await this.evaluate('({width:innerWidth,height:innerHeight,scale:devicePixelRatio})');
      throw new Error(`${name} has PNG dimensions ${data.readUInt32BE(16)}x${data.readUInt32BE(20)}; viewport ${JSON.stringify(viewport)}`);
    }
    await writeFile(path, data);
    return path;
  }
}

const contexts = [];
const captures = [];
let sharedPage = null;
async function openPage(overlay) {
  if (overlay && sharedPage) {
    await sharedPage.send('Page.navigate', {
      url: 'http://127.0.0.1:8002/devinarok/?dev=1&collide=1',
    });
    await sharedPage.wait('document.readyState === "complete"');
    await sharedPage.wait('Boolean(window.__devinarok?.character?.name)');
    await sharedPage.evaluate('window.__devinarok.enterHub()');
    await sharedPage.wait('window.__devinarok?.world?.mode === "hub" && Boolean(window.__devinarok.renderer)');
    return sharedPage;
  }
  const { browserContextId } = await browserCommand('Target.createBrowserContext', { disposeOnDetach: true });
  contexts.push(browserContextId);
  const { targetId } = await browserCommand('Target.createTarget', {
    url: 'about:blank', browserContextId,
  });
  const targets = await fetch('http://127.0.0.1:9225/json/list').then((response) => response.json());
  const page = new Page(targets.find((target) => target.id === targetId).webSocketDebuggerUrl);
  await page.ready();
  await page.send('Page.navigate', {
    url: `http://127.0.0.1:8002/devinarok/?dev=1${overlay ? '&collide=1' : ''}`,
  });
  await page.wait('document.readyState === "complete"');
  await page.wait('Boolean(document.querySelector("#create-form input[name=name]"))');
  await page.evaluate(`(() => {
    const field = document.querySelector('#create-form input[name="name"]');
    field.value = '충돌확인';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.form.requestSubmit();
  })()`);
  await page.wait('Boolean(window.__devinarok?.character?.name)');
  await page.evaluate('window.__devinarok.enterHub()');
  await page.wait('window.__devinarok?.world?.mode === "hub" && Boolean(window.__devinarok.renderer)');
  if (!overlay) sharedPage = page;
  return page;
}

const sceneNames = [
  ['hub', null],
  ['c1', 'C1'],
  ['c2', 'C2'],
  ['c3', 'C3'],
  ['cb-room-1', 'CB'],
];
try {
  const variants = process.argv.includes('--overlay-only') ? [true] : [false, true];
  for (const overlay of variants) {
    const page = await openPage(overlay);
    for (const [scene, stageId] of sceneNames) {
      if (stageId) {
        await page.evaluate(`window.__devinarok.startStage(${JSON.stringify(stageId)})`);
        await page.wait('window.__devinarok?.world?.mode === "stage" && Boolean(window.__devinarok.renderer)');
        await page.wait(`window.__devinarok.world.arena.id === ${JSON.stringify(stageId)}`);
        if (stageId === 'CB') {
          await page.wait('!document.querySelector("#boss-intro") || document.querySelector("#boss-intro").hidden');
        }
        await page.evaluate('window.__devinarok.loop?.pause()');
      }
      const name = `${scene}${overlay ? '-overlay' : ''}`;
      captures.push(await page.capture(name));
      if (stageId) {
        await page.evaluate('window.__devinarok.enterHub()');
        await page.wait('window.__devinarok?.world?.mode === "hub" && Boolean(window.__devinarok.renderer)');
      }
    }
    console.log(JSON.stringify({ overlay, exceptions: page.exceptions }));
  }
  for (const contextId of contexts.splice(0)) await browserCommand('Target.disposeBrowserContext', { browserContextId: contextId });
} finally {
  browser.close();
}
console.log(JSON.stringify({ captures }, null, 2));
