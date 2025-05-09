#!/usr/bin/env node

/* eslint-disable */
// @ts-nocheck
const { WebSocketServer } = require('ws');
const express = require('express');
const { parse } = require('toml');
const { readFileSync, existsSync } = require('node:fs');
const { program } = require('commander');
const { encodeQR } = require('qr');
const robotjs = require('robotjs');
const path = require('node:path');
/* CJS fallback for __filename and __dirname */
const { networkInterfaces } = require('node:os');
const ngrok = require('ngrok');

const { keyTap, setKeyboardDelay, typeString } = robotjs;


function getLocalIpAddress() {
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


// When running from dist/server.js, __dirname will be the dist folder.
program
  .version('1.0.0')
  .option('-p, --port <number>', 'port to run the server on', '8080')
  .option('-s, --session <string>', 'session identifier', 'default')
  .option('-c, --config <path>', 'path to config.toml', path.join(process.cwd(), 'config.toml'))
  .parse(process.argv);

const options = program.opts();
const configPath = options.config;
if (!existsSync(configPath)) {
  console.error(`Error: Config file not found at "${configPath}"`);
  process.exit(1);
}
const config = parse(readFileSync(configPath, 'utf-8'));
const port = Number(options.port);
const session = options.session;

if (!session || !config.sessions[session]) {
  console.error(`Error: Session "${session}" not found in config.`);
  process.exit(1);
}

const sessionPattern = config.sessions[session];

const app = express();

// Serve static files from the 'public' directory inside 'dist'
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html from 'dist'
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(port, '0.0.0.0', async () => {
  console.log('Scan this QR code to open the web page:');
  const publicUrl = await ngrok.connect({ proto: 'http', addr: port });
  const websocketUrl = publicUrl.replace(/^https?:/, 'ws:');
  const qr = encodeQR(publicUrl, 'ascii');
  console.log(qr);
  console.log(`Server running on ${publicUrl}`);
  console.log(`WebSocket server running on ${websocketUrl}`);
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
