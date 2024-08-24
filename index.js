import { Server } from 'ws';
import { parse } from 'toml';
import { readFileSync } from 'fs';
import { program } from 'commander';
import QRCode from '@paulmillr/qr';
import { keyTap, setKeyboardDelay, typeString } from 'robotjs';

// Parse TOML configuration
const config = parse(readFileSync('./config.toml', 'utf-8'));

// CLI setup
program
  .version('1.0.0')
  .option('-p, --port <number>', 'port to run the server on', 8080)
  .option('-s, --session <string>', 'session identifier')
  .parse(process.argv);

const options = program.opts();

if (!options.session || !config.sessions[options.session]) {
  console.error(`Error: Session "${options.session}" not found in config.`);
  process.exit(1);
}

const sessionPattern = config.sessions[options.session];

// WebSocket server setup
const wss = new Server({ port: options.port });

// ... (QR code generation code here)

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    const barcode = message.toString();
    console.log('Received barcode:', barcode);

    const keystrokePattern = sessionPattern.replace('{barcode}', barcode);
    executeKeystrokes(keystrokePattern);
  });
});

console.log(`Server running on ws://localhost:${options.port}`);
console.log(`Active session: ${options.session}`);

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
