import express from 'express';
import { createServer } from 'http';
import encodeQR from '@paulmillr/qr';
import path from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';

import { loadConfig } from './config.js';
import { initializeWebRTC } from './webrtc.js';
import { executeKeystrokes } from './keystrokes.js';
import { compressData, decompressData } from './compression.js';

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
const { config, options } = loadConfig();
const sessionPattern = config.sessions[options.session];

const app = express();
const server = createServer(app);

app.use(express.static(path.join(__dirname, '.')));

let offer = null;

const peer = initializeWebRTC((data) => {
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

peer.on('signal', (data) => {
  offer = data;
});

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
