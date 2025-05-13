#!/usr/bin/env node

/* eslint-disable */
import express from 'express';
import { parse } from 'toml';
import { readFileSync, existsSync } from 'node:fs';
import { program } from 'commander';
import qrcode from 'qrcode';
// The main import 'nodeDataChannel' is used for initLogger
import nodeDataChannel, { PeerConnection, DataChannel, DescriptionType, RtcConfig } from 'node-datachannel';
import robotjs from 'robotjs';
import path from 'node:path';
import { networkInterfaces } from 'node:os';

const { keyTap, setKeyboardDelay, typeString } = robotjs;

nodeDataChannel.initLogger('Debug');

interface SignalingMessageToServer {
  type: 'answer';
  sdp: string;
  candidates?: { candidate: string; mid: string }[];
}

interface SignalingMessageToClient {
  type: 'offer';
  sdp: string;
  candidates: { candidate: string; mid: string }[];
}

interface ChunkedData {
  part: number;
  length: number;
  data: string;
}

const MAX_QR_CHUNK_SIZE = 200;
let pc: PeerConnection | null = null;
let dc: DataChannel | null = null;
const gatheredLocalCandidates: { candidate: string; mid: string }[] = [];
let localSdpOffer: string | null = null;
let iceGatheringSignaledComplete = false;

async function displayQrCodeChunk(chunk: ChunkedData) {
  try {
    const qrString = await qrcode.toString(JSON.stringify(chunk), { type: 'terminal', small: true });
    console.log(`\nScan QR Code (Part ${chunk.part}/${chunk.length}):`);
    console.log(qrString);
  } catch (err) {
    console.error('Error generating QR code:', err);
  }
}

async function generateAndDisplayQrCodes() {
  if (!localSdpOffer || !iceGatheringSignaledComplete) {
    console.log('Local SDP offer or ICE gathering not yet complete. Waiting...');
    return;
  }
  const offerToClient: SignalingMessageToClient = {
    type: 'offer',
    sdp: localSdpOffer,
    candidates: gatheredLocalCandidates,
  };
  const fullOfferPayload = JSON.stringify(offerToClient);
  const totalLength = Math.ceil(fullOfferPayload.length / MAX_QR_CHUNK_SIZE);
  console.log(`\nPreparing WebRTC offer for QR display (${totalLength} parts)...`);
  for (let i = 0; i < totalLength; i++) {
    const chunkDataStr = fullOfferPayload.substring(i * MAX_QR_CHUNK_SIZE, (i + 1) * MAX_QR_CHUNK_SIZE);
    const chunk: ChunkedData = {
      part: i + 1,
      length: totalLength,
      data: Buffer.from(chunkDataStr).toString('base64'),
    };
    await displayQrCodeChunk(chunk);
    if (i < totalLength - 1) await new Promise(resolve => setTimeout(resolve, 700));
  }
  console.log('\nAll QR code parts displayed. Waiting for client answer via DataChannel...');
}

async function startWebRTC() {
  console.log('Initializing WebRTC PeerConnection...');
  const rtcConfig: RtcConfig = { iceServers: ['stun:stun.l.google.com:19302'] };
  try {
    pc = new PeerConnection('barbarcode-server-peer', rtcConfig);
  } catch (error) {
    console.error("Failed to create PeerConnection:", error);
    return;
  }

  pc.onStateChange((state: string) => {
    console.log(`PeerConnection state: ${state}`);
    if (state === 'disconnected' || state === 'failed' || state === 'closed') {
      dc?.close(); pc?.close(); dc = null; pc = null;
      gatheredLocalCandidates.length = 0; localSdpOffer = null; iceGatheringSignaledComplete = false;
    }
  });

  pc.onLocalDescription((sdp: string, type: DescriptionType) => {
    console.log(`Local description ready (type: ${type})`);
    // Cast `type` to string for comparison, assuming it's a string value at runtime.
    if ((type as string) === "Offer") {
        localSdpOffer = sdp;
        if (iceGatheringSignaledComplete) generateAndDisplayQrCodes();
    } else {
        console.warn(`Received local description of type ${type}, expected "Offer".`);
    }
  });

  pc.onLocalCandidate((candidate: string | null, mid: string | null) => {
    if (candidate && mid) {
      gatheredLocalCandidates.push({ candidate, mid });
    } else {
      console.log('All local ICE candidates gathered.');
      iceGatheringSignaledComplete = true;
      if (localSdpOffer) generateAndDisplayQrCodes();
    }
  });

  try {
    dc = pc.createDataChannel('barbarcode-channel', { unordered: false });
    console.log(`DataChannel "${dc.getLabel()}" created.`);
    setupDataChannelEventHandlers();
  } catch (error) {
    console.error("Failed to create DataChannel:", error);
    pc?.close(); pc = null; return;
  }
}

function setupDataChannelEventHandlers() {
    if (!dc) return;
    const currentDcLabel = dc.getLabel();

    dc.onOpen(() => {
        console.log(`DataChannel "${currentDcLabel}" opened!`);
        dc?.sendMessage('Hello from server! Ready for barcodes.');
    });
    dc.onClosed(() => console.log(`DataChannel "${currentDcLabel}" closed.`));
    dc.onError((err: string) => console.error(`DataChannel "${currentDcLabel}" error:`, err));

    dc.onMessage((msg: string | ArrayBuffer | Buffer) => {
        let messageStr: string;
        if (typeof msg === 'string') {
            messageStr = msg;
        } else if (Buffer.isBuffer(msg)) {
            messageStr = msg.toString();
        } else if (msg instanceof ArrayBuffer) {
            messageStr = new TextDecoder().decode(msg);
        } else {
            console.error("Received message of unknown type:", msg);
            return;
        }

        console.log(`Message from client on "${currentDcLabel}":`, messageStr);
        try {
            const clientMessage = JSON.parse(messageStr) as SignalingMessageToServer;
            if (clientMessage.type === 'answer' && clientMessage.sdp && pc) {
                console.log('Received answer SDP from client.');
                // Use string literal and cast to DescriptionType for the function argument.
                pc.setRemoteDescription(clientMessage.sdp, "Answer" as DescriptionType);
                if (clientMessage.candidates) {
                    clientMessage.candidates.forEach(c => {
                        if (c.candidate && c.mid) pc?.addRemoteCandidate(c.candidate, c.mid);
                    });
                }
            } else {
                const parsedData = JSON.parse(messageStr) as { code: string; format: string };
                console.log('Received barcode:', parsedData.code, 'Type:', parsedData.format);
                const keystrokePattern = sessionPattern.replace('{barcode}', parsedData.code);
                executeKeystrokes(keystrokePattern);
            }
        } catch (error) {
            console.error('Error processing WebRTC message:', error);
        }
    });
}

function getLocalIpAddress() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const localIp = getLocalIpAddress();

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
const session = options.session;

if (!session || !config.sessions[session]) {
  console.error(`Error: Session "${session}" not found in config.`);
  process.exit(1);
}
const sessionPattern = config.sessions[session];

function executeKeystrokes(pattern: string): void {
  const keystrokes = pattern.match(/(\{[^}]+\}|[^{]+)/g) || [];
  for (const keystroke of keystrokes) {
    if (keystroke.startsWith('{') && keystroke.endsWith('}')) {
      const command = keystroke.slice(1, -1);
      switch (true) {
        case command === 'enter': keyTap('enter'); break;
        case command === 'tab': keyTap('tab'); break;
        case command === 'esc': keyTap('escape'); break;
        case command.startsWith('delay:'): setKeyboardDelay(Number(command.split(':')[1])); break;
        case ['up', 'down', 'left', 'right'].includes(command): keyTap(command); break;
        case command.startsWith('key:'): keyTap(command.split(':')[1]); break;
      }
    } else {
      typeString(keystroke);
    }
  }
}

async function main() {
  console.log('Barbarcode Server (WebRTC Mode)');
  console.log(`Local IP: ${localIp}`);
  console.log(`Active session: ${session}`);
  console.log('Starting WebRTC signaling...');
  await startWebRTC();
  console.log("Server running. Press Ctrl+C to exit.");
}

main().catch(error => {
  console.error("Unhandled error in main:", error);
  process.exit(1);
});
