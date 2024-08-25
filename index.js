import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { parse } from 'toml';
import { readFileSync } from 'fs';
import { program } from 'commander';
import encodeQR from '@paulmillr/qr';
import robotjs from 'robotjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';
import SimplePeer from 'simple-peer';
import wrtc from '@koush/wrtc';
import zlib from 'zlib'

const { keyTap, setKeyboardDelay, typeString } = robotjs;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getLocalIpAddress() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIpAddress();

const config = parse(readFileSync('./config.toml', 'utf-8'));

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

const app = express();
const server = createServer(app);

app.use(express.static(path.join(__dirname, '.')));

let offer = null;

console.log('Initializing SimplePeer...');
const peer = new SimplePeer({
  initiator: true,
  trickle: false,
  wrtc: wrtc
});

peer.on('signal', (data) => {
  offer = data;
  console.log('WebRTC offer generated. Access the QR code at /qr');
  console.log('Offer details:', JSON.stringify(data, null, 2));
});

peer.on('connect', () => {
  console.log('WebRTC connection established');
});

peer.on('data', (data) => {
  console.log('Received data from peer:', data.toString());
  try {
    const { code, format } = JSON.parse(data.toString());
    console.log('Received barcode:', code, 'Type:', format);

    const keystrokePattern = sessionPattern.replace('{barcode}', code);
    console.log('Keystroke pattern:', keystrokePattern);
    console.log('Barcode format:', format);

    executeKeystrokes(keystrokePattern);
  } catch (error) {
    console.error('Error processing received data:', error);
  }
});

peer.on('error', (err) => {
  console.error('SimplePeer error:', err);
});

peer.on('close', () => {
  console.log('SimplePeer connection closed');
});

function executeKeystrokes(pattern) {
  console.log('Executing keystroke pattern:', pattern);
  const keystrokes = pattern.match(/(\{[^}]+\}|[^{]+)/g);

  for (const keystroke of keystrokes) {
    if (keystroke.startsWith('{') && keystroke.endsWith('}')) {
      const command = keystroke.slice(1, -1);
      console.log('Executing command:', command);
      if (command === 'enter') {
        keyTap('enter');
      } else if (command === 'tab') {
        keyTap('tab');
      } else if (command === 'esc') {
        keyTap('escape');
      } else if (command.startsWith('delay:')) {
        const delay = parseInt(command.split(':')[1]);
        console.log('Setting keyboard delay:', delay);
        setKeyboardDelay(delay);
      } else if (['up', 'down', 'left', 'right'].includes(command)) {
        keyTap(command);
      } else if (command.startsWith('key:')) {
        const key = command.split(':')[1];
        keyTap(key);
      }
    } else {
      console.log('Typing string:', keystroke);
      typeString(keystroke);
    }
  }
  console.log('Keystroke execution completed');
}

function compressData(data) {
  console.log('Compressing data, original length:', data.length);
  const buffer = Buffer.from(data, 'utf-8');
  const compressed = zlib.deflateSync(buffer, { level: 9 }); // Maximum compression
  console.log('Compressed data length:', compressed.length);
  return compressed;
}

function decompressData(data) {
  console.log('Decompressing data, compressed length:', data.length);
  const decompressed = zlib.inflateSync(data).toString('utf-8');
  console.log('Decompressed data length:', decompressed.length);
  return decompressed;
}

app.get('/qr', (req, res) => {
  console.log('QR code request received');
  if (!offer) {
    console.log('WebRTC offer not yet generated');
    return res.status(503).send('WebRTC offer not yet generated. Please try again in a few seconds.');
  }

  const qrData = JSON.stringify(offer);
  console.log('QR data (offer) length:', qrData.length);

  const compressed = compressData(qrData)
  const compressedString = compressed.toString('base64url');

  console.log('Compressed string length:', compressedString.length);
  console.log(`Compression rate: ${(compressedString.length / qrData.length * 100).toFixed(2)}%`);

  const decompressed = decompressData(Buffer.from(compressedString, 'base64url'));
  console.log('Decompressed data matches original:', decompressed === qrData);

  const qrSvg = encodeQR(compressedString, 'svg');

  console.log('QR code generated, sending response');
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(qrSvg);
});

server.listen(options.port, '0.0.0.0', () => {
  console.log(`Server running on http://${localIp}:${options.port}`);
  console.log(`Access the QR code at http://${localIp}:${options.port}/qr`);
  console.log(`Active session: ${options.session}`);
});
