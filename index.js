import { WebSocketServer } from 'ws';
import express from 'express';
import { createServer } from 'http';
import { parse } from 'toml';
import { readFileSync } from 'fs';
import { program } from 'commander';
import encodeQR from '@paulmillr/qr';
import robotjs from 'robotjs';
import path from 'path';
import { fileURLToPath } from 'url';

const { keyTap, setKeyboardDelay, typeString } = robotjs

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse TOML configuration
const config = parse(readFileSync('./config.toml', 'utf-8'));

// CLI setup
program
  .version('1.0.0')
  .option('-p, --port <number>', 'port to run the server on', 8080)
  .option('-s, --session <string>', 'session identifier', "default")
  .parse(process.argv);

const options = program.opts();

if (!options.session || !config.sessions[options.session]) {
  console.error(`Error: Session "${options.session}" not found in config.`);
  process.exit(1);
}

const sessionPattern = config.sessions[options.session];

// Express app setup
const app = express();
const server = createServer(app);

// Serve static files (including index.html)
app.use(express.static(path.join(__dirname, '.')));

// WebSocket server setup
const wss = new WebSocketServer({ server });

// Generate QR code with connection info
const connectionInfo = JSON.stringify({
  url: `ws://localhost:${options.port}`,
  session: options.session
});
const qr = encodeQR(connectionInfo, 'ascii');
console.log('Scan this QR code to connect:');
console.log(qr);

wss.on('connection', function connection(ws) {
  console.log('Client connected');

  ws.on('error', console.error);

  ws.on('message', function message(data) {
    const barcode = data.toString();
    console.log('Received barcode:', barcode);

    const keystrokePattern = sessionPattern.replace('{barcode}', barcode);
    executeKeystrokes(keystrokePattern);
  });
});

function executeKeystrokes(pattern) {
  const keystrokes = pattern.match(/(\{[^}]+\}|[^{]+)/g);

  for (const keystroke of keystrokes) {
    if (keystroke.startsWith('{') && keystroke.endsWith('}')) {
      const command = keystroke.slice(1, -1);
      if (command === 'enter') {
        keyTap('enter');
      } else if (command === 'tab') {
        keyTap('tab');
      } else if (command === 'esc') {
        keyTap('escape');
      } else if (command.startsWith('delay:')) {
        const delay = parseInt(command.split(':')[1]);
        setKeyboardDelay(delay);
      } else if (['up', 'down', 'left', 'right'].includes(command)) {
        keyTap(command);
      } else if (command.startsWith('key:')) {
        const key = command.split(':')[1];
        keyTap(key);
      }
    } else {
      typeString(keystroke);
    }
  }
}

// Start the server
server.listen(options.port, () => {
  console.log(`Server running on http://localhost:${options.port}`);
  console.log(`WebSocket server running on ws://localhost:${options.port}`);
  console.log(`Active session: ${options.session}`);
});
