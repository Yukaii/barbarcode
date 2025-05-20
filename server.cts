#!/usr/bin/env node

/* eslint-disable */
import express from 'express';
import { parse } from 'toml';
import { readFileSync, existsSync } from 'node:fs';
import { program } from 'commander';
import { encodeQR } from 'qr';
import robotjs from 'robotjs';
import path from 'node:path';
/* CJS fallback for __filename and __dirname */
import ngrok from 'ngrok';
import { WebRTCServer, getLocalIpAddress } from './webrtc-utils.cjs';

const { keyTap, setKeyboardDelay, typeString } = robotjs;

const localIp = getLocalIpAddress();


// When running from dist/server.js, __dirname will be the dist folder.
program
  .version('1.0.0')
  .option('-p, --port <number>', 'port to run the server on', '8080')
  .option('-s, --session <string>', 'session identifier', 'default')
  .option('-c, --config <path>', 'path to config.toml', path.join(process.cwd(), 'config.toml'))
  .option('--rtc', 'use WebRTC mode (default)', true)
  .option('--ws', 'use WebSocket mode (legacy)')
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
const useWebRTC = options.ws ? false : options.rtc;

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
  if (useWebRTC) {
    // WebRTC Mode
    console.log('Starting WebRTC server in ICE-lite mode...');
    
    // Initialize WebRTC server
    const webRTCPort = port + 1; // Use port+1 for WebRTC
    const webRTCServer = new WebRTCServer(webRTCPort, handleDataMessage);
    
    // Get the SDP answer to include in the QR code
    const answerSdp = webRTCServer.getAnswerSdp();
    const credentials = webRTCServer.getIceCredentials();
    
    console.log(`WebRTC server configured:`);
    console.log(`- ICE lite mode: yes`);
    console.log(`- Port: ${webRTCPort}`);
    console.log(`- ICE ufrag: ${credentials.ufrag}`);
    console.log(`- Host: ${localIp}`);
    
    // Generate QR code with the SDP answer
    console.log('Scan this QR code with your mobile device:');
    const qr = encodeQR(answerSdp, 'ascii');
    console.log(qr);
    
    // Also expose web page via ngrok for remote access
    const publicUrl = await ngrok.connect({ proto: 'http', addr: port });
    console.log(`Web server running on ${publicUrl}`);
    console.log(`Active session: ${session}`);
  } else {
    // Legacy WebSocket Mode
    console.log('Starting in legacy WebSocket mode...');
    console.log('Scan this QR code to open the web page:');
    const publicUrl = await ngrok.connect({ proto: 'http', addr: port });
    const websocketUrl = publicUrl.replace(/^https?:/, 'ws:');
    const qr = encodeQR(publicUrl, 'ascii');
    console.log(qr);
    console.log(`Server running on ${publicUrl}`);
    console.log(`WebSocket server running on ${websocketUrl}`);
    console.log(`Active session: ${session}`);
    
    // Set up WebSocket server only in WebSocket mode
    const { WebSocketServer } = await import('ws');
    const wss = new WebSocketServer({ server });
    
    wss.on('connection', (ws) => {
      console.log('Client connected via WebSocket');
      ws.on('error', console.error);
      ws.on('message', (data) => {
        try {
          const parsedData = JSON.parse(data.toString()) as { code: string; format: string };
          handleDataMessage(parsedData);
        } catch (error) {
          console.error('Error processing message:', error);
          console.log('Raw message data:', data.toString());
        }
      });
    });
  }
});

// Handler for data messages (works for both WebRTC and WebSocket)
function handleDataMessage(data: { code: string; format: string }) {
  try {
    const { code, format } = data;
    console.log('Received barcode:', code, 'Type:', format);
    const keystrokePattern = sessionPattern.replace('{barcode}', code);
    console.log('Keystroke pattern:', keystrokePattern);
    console.log('Barcode format:', format);
    executeKeystrokes(keystrokePattern);
  } catch (error) {
    console.error('Error processing message:', error);
  }
}

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
