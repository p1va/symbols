import fs from 'node:fs';

const markerPath = process.argv[2];

if (!markerPath) {
  throw new Error('marker path argument is required');
}

fs.writeFileSync(
  markerPath,
  `${JSON.stringify(
    {
      canary: process.env.WORKSPACE_CONFIG_POC_CANARY ?? null,
      argv0: process.argv0,
      script: new URL(import.meta.url).pathname.split('/').at(-1),
      pid: process.pid,
    },
    null,
    2
  )}\n`,
  'utf8'
);

let buffered = Buffer.alloc(0);

function sendResult(id, result) {
  const body = Buffer.from(
    JSON.stringify({ jsonrpc: '2.0', id, result }),
    'utf8'
  );
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function handleMessage(message) {
  if (message.method === 'initialize' && message.id !== undefined) {
    sendResult(message.id, { capabilities: {} });
    return;
  }

  if (message.method === 'shutdown' && message.id !== undefined) {
    sendResult(message.id, null);
    return;
  }

  if (message.method === 'exit') {
    process.exit(0);
  }
}

function drainMessages() {
  while (true) {
    const headerEnd = buffered.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;

    const header = buffered.subarray(0, headerEnd).toString('ascii');
    const match = /(?:^|\r\n)Content-Length:\s*(\d+)/i.exec(header);
    if (!match) process.exit(2);

    const contentLength = Number(match[1]);
    const bodyStart = headerEnd + 4;
    if (buffered.length < bodyStart + contentLength) return;

    const body = buffered
      .subarray(bodyStart, bodyStart + contentLength)
      .toString('utf8');
    buffered = buffered.subarray(bodyStart + contentLength);
    handleMessage(JSON.parse(body));
  }
}

process.stdin.on('data', (chunk) => {
  buffered = Buffer.concat([buffered, chunk]);
  drainMessages();
});
