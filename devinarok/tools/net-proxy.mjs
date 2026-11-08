import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import net from 'node:net';

const options = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument.startsWith('--')) continue;
  const [key, ...parts] = argument.slice(2).split('=');
  const value = parts.length
    ? parts.join('=')
    : process.argv[index + 1] && !process.argv[index + 1].startsWith('--')
      ? process.argv[++index]
      : true;
  options.set(key, value);
}
const port = Number(options.get('port') ?? 8788);
const upstreamHost = options.get('upstream-host') ?? '127.0.0.1';
const upstreamPort = Number(options.get('upstream-port') ?? 8787);
const profile = String(options.get('profile') ?? 'impaired');
const profiles = {
  none: { delayMs: 0, jitterMs: 0, stallMs: 0, stallEveryMs: 0 },
  impaired: { delayMs: 75, jitterMs: 25, stallMs: 300, stallEveryMs: 2000 },
  'kr-far': { delayMs: 70, jitterMs: 20, stallMs: 0, stallEveryMs: 0 },
  'kr-near': { delayMs: 20, jitterMs: 8, stallMs: 0, stallEveryMs: 0 },
};
const impairment = profiles[profile];
if (!impairment) throw new TypeError(`Unknown network profile: ${profile}`);
const startMs = Date.now();
const WEB_SOCKET_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

function acceptKey(key) {
  return createHash('sha1').update(key + WEB_SOCKET_MAGIC).digest('base64');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deliveryAtMs(arrivalAt) {
  if (profile === 'none') return arrivalAt;
  const jitter = Math.random() * impairment.jitterMs * 2 - impairment.jitterMs;
  const deliveryAt = arrivalAt + impairment.delayMs + jitter;
  if (!impairment.stallEveryMs) return deliveryAt;
  const phase = ((deliveryAt - startMs) % impairment.stallEveryMs + impairment.stallEveryMs) % impairment.stallEveryMs;
  return deliveryAt + (phase < impairment.stallMs ? impairment.stallMs - phase : 0);
}

function createDelayedSender(source, destination) {
  const queue = [];
  let draining = false;
  let ended = false;
  let lastDeliveryAt = 0;

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (queue.length && !destination.destroyed) {
        const delivery = queue.shift();
        await wait(Math.max(0, delivery.at - Date.now()));
        if (destination.destroyed) break;
        if (!destination.write(delivery.chunk)) await once(destination, 'drain');
        if (queue.length < 16 && !source.destroyed) source.resume();
      }
    } catch {
      source.destroy();
      destination.destroy();
    } finally {
      draining = false;
      if (queue.length && !destination.destroyed) void drain();
      else if (ended && !destination.destroyed) destination.end();
    }
  }

  return {
    push(chunk) {
      if (destination.destroyed) return;
      const at = Math.max(deliveryAtMs(Date.now()), lastDeliveryAt);
      lastDeliveryAt = at;
      queue.push({ chunk: Buffer.from(chunk), at });
      if (queue.length > 64) source.pause();
      void drain();
    },
    end() {
      ended = true;
      if (!queue.length && !destination.destroyed) destination.end();
    },
  };
}

const server = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, profile, upstream: `${upstreamHost}:${upstreamPort}` }));
    return;
  }
  response.writeHead(426, { 'content-type': 'text/plain' });
  response.end('WebSocket upgrade required');
});

server.on('upgrade', (request, client, clientHead) => {
  const path = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname;
  const clientKey = request.headers['sec-websocket-key'];
  if (!CODE.test(path.split('/').at(-1) ?? '') || typeof clientKey !== 'string') {
    client.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    return;
  }

  client.pause();
  const upstream = net.connect(upstreamPort, upstreamHost);
  const upstreamKey = randomBytes(16).toString('base64');
  let responseBuffer = Buffer.alloc(0);
  let upgraded = false;
  let toClient;
  let toUpstream;
  let closed = false;

  function closeBoth() {
    if (closed) return;
    closed = true;
    client.destroy();
    upstream.destroy();
  }

  client.on('error', closeBoth);
  upstream.on('error', closeBoth);
  client.on('close', () => upstream.destroy());
  upstream.on('close', () => client.destroy());

  upstream.once('connect', () => {
    const target = `${request.url ?? path}`;
    upstream.write([
      `GET ${target} HTTP/1.1`,
      `Host: ${upstreamHost}:${upstreamPort}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${upstreamKey}`,
      'Sec-WebSocket-Version: 13',
      '\r\n',
    ].join('\r\n'));
  });

  upstream.on('data', (chunk) => {
    if (!upgraded) {
      responseBuffer = Buffer.concat([responseBuffer, chunk]);
      const headerEnd = responseBuffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = responseBuffer.subarray(0, headerEnd).toString('latin1');
      if (!/^HTTP\/1\.[01] 101\b/.test(header)) {
        closeBoth();
        return;
      }
      upgraded = true;
      toClient = createDelayedSender(upstream, client);
      toUpstream = createDelayedSender(client, upstream);
      client.write([
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey(clientKey)}`,
        '\r\n',
      ].join('\r\n'));
      const leftover = responseBuffer.subarray(headerEnd + 4);
      if (leftover.length) toClient.push(leftover);
      responseBuffer = Buffer.alloc(0);
      if (clientHead?.length) toUpstream.push(clientHead);
      client.on('data', (data) => toUpstream.push(data));
      client.on('end', () => toUpstream.end());
      client.resume();
      return;
    }
    toClient.push(chunk);
  });
});

server.listen(port, '127.0.0.1', () => {
  const delay = profile === 'none'
    ? 'unimpaired'
    : `${impairment.delayMs}±${impairment.jitterMs}ms each way${impairment.stallMs ? `, ${impairment.stallMs}ms stall/${impairment.stallEveryMs / 1000}s` : ''}`;
  console.log(`Devinarok WS proxy listening on ws://127.0.0.1:${port} → ${upstreamHost}:${upstreamPort} (${profile}: ${delay})`);
});
