import { WebSocketServer } from 'ws';
import express from 'express';
import { parse } from 'toml';
import { readFileSync } from 'node:fs';
import { program } from 'commander';
import encodeQR from '@paulmillr/qr';
import robotjs from 'robotjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const { keyTap, setKeyboardDelay, typeString } = robotjs;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const html = readFileSync(path.join(__dirname, 'index.html'), 'utf-8');

function getLocalIpAddress(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIpAddress();

type Config = {
  sessions: Record<string, string>;
};

const config: Config = parse(readFileSync('./config.toml', 'utf-8'));

program
  .version('1.0.0')
  .option('-p, --port <number>', 'port to run the server on', '8080')
  .option('-s, --session <string>', 'session identifier', 'default')
  .parse(process.argv);

interface Options {
  port: string;
  session: string;
}

const options = program.opts<Options>();
const port = Number(options.port);
const session = options.session;

if (!session || !config.sessions[session]) {
  console.error(`Error: Session "${session}" not found in config.`);
  process.exit(1);
}

const sessionPattern = config.sessions[session];

const app = express();
app.get('/', (_req, res) => {
  res.type('html').send(html);
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log('Scan this QR code to open the web page:');
  const webpageUrl = `http://${localIp}:${port}`;
  const qr = encodeQR(webpageUrl, 'ascii');
  console.log(qr);
  console.log(`Server running on http://${localIp}:${port}`);
  console.log(`WebSocket server running on ws://${localIp}:${port}`);
  console.log(`Active session: ${session}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');
  ws.on('error', console.error);
  ws.on('message', (data) => {
    try {
      const parsedData = JSON.parse(data.toString()) as { code: string; format: string };
      const { code, format } = parsedData;
      console.log('Received barcode:', code, 'Type:', format);
      const keystrokePattern = sessionPattern.replace('{barcode}', code);
      console.log('Keystroke pattern:', keystrokePattern);
      console.log('Barcode format:', format);
      executeKeystrokes(keystrokePattern);
    } catch (error) {
      console.error('Error processing message:', error);
      console.log('Raw message data:', data.toString());
    }
  });
});

function executeKeystrokes(pattern: string): void {
  const keystrokes = pattern.match(/(\{[^}]+\}|[^{]+)/g) || [];
  for (const keystroke of keystrokes) {
    if (keystroke.startsWith('{') && keystroke.endsWith('}')) {
      const command = keystroke.slice(1, -1);
      switch (true) {
        case command === 'enter':
          keyTap('enter');
          break;
        case command === 'tab':
          keyTap('tab');
          break;
        case command === 'esc':
          keyTap('escape');
          break;
        case command.startsWith('delay:'):
          setKeyboardDelay(Number(command.split(':')[1]));
          break;
        case ['up', 'down', 'left', 'right'].includes(command):
          keyTap(command);
          break;
        case command.startsWith('key:'):
          keyTap(command.split(':')[1]);
          break;
        default:
          break;
      }
    } else {
      typeString(keystroke);
    }
  }
}
