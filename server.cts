#!/usr/bin/env node

/* eslint-disable */
import React, { useState, useEffect, StrictMode } from 'react';
import { render, Box, Text, Newline } from 'ink';
import { parse } from 'toml';
import { readFileSync, existsSync } from 'node:fs';
import { program } from 'commander';
import qrcode from 'qrcode'; // Using 'qrcode' for terminal QR generation
import nodeDataChannel, { PeerConnection, DataChannel, DescriptionType, RtcConfig } from 'node-datachannel';
import robotjs from 'robotjs';
import path from 'node:path';
import { networkInterfaces } from 'node:os';

const { keyTap, setKeyboardDelay, typeString } = robotjs;

nodeDataChannel.initLogger('Info'); // Set to Info or Warning for less verbose Ink output

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
  data: string; // Base64 encoded string of the chunk
}

const MAX_QR_CHUNK_SIZE = 200; // Adjusted for typical QR capacity with JSON overhead

// --- Command Line Args & Config ---
program
  .version('1.0.0')
  .option('-s, --session <string>', 'session identifier', 'default')
  .option('-c, --config <path>', 'path to config.toml', path.join(process.cwd(), 'config.toml'))
  .parse(process.argv);

const options = program.opts();
const configPath = options.config;
if (!existsSync(configPath)) {
  console.error(`Error: Config file not found at "${configPath}"`);
  process.exit(1);
}
const configToml = parse(readFileSync(configPath, 'utf-8'));
const sessionName = options.session;

if (!sessionName || !configToml.sessions[sessionName]) {
  console.error(`Error: Session "${sessionName}" not found in config.`);
  process.exit(1);
}
const sessionPattern = configToml.sessions[sessionName];

// --- Ink UI App ---
const App = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [qrCodeString, setQrCodeString] = useState<string>("Waiting for QR code...");
  const [currentQrPart, setCurrentQrPart] = useState(0);
  const [totalQrParts, setTotalQrParts] = useState(0);

  const addLog = (message: string) => {
    setLogs(prevLogs => [...prevLogs.slice(-20), `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    addLog('Barbarcode Server (WebRTC Mode with Ink UI)');
    addLog(`Local IP: ${getLocalIpAddress()}`);
    addLog(`Active session: ${sessionName}`);
    addLog('Starting WebRTC signaling...');

    let pc: PeerConnection | null = null;
    let dc: DataChannel | null = null;
    const gatheredLocalCandidates: { candidate: string; mid: string }[] = [];
    let localSdpOffer: string | null = null;
    let iceGatheringSignaledComplete = false;

    const displayQrCodeChunk = async (chunk: ChunkedData) => {
      try {
        const qrString = await qrcode.toString(JSON.stringify(chunk), { type: 'terminal', small: true });
        setQrCodeString(qrString);
        setCurrentQrPart(chunk.part);
        setTotalQrParts(chunk.length);
        addLog(`Displaying QR Code (Part ${chunk.part}/${chunk.length})`);
      } catch (err) {
        addLog(`Error generating QR code: ${err}`);
      }
    };

    const generateAndDisplayQrCodes = async () => {
      if (!localSdpOffer || !iceGatheringSignaledComplete) {
        addLog('Local SDP offer or ICE gathering not yet complete. Waiting...');
        return;
      }

      const offerToClient: SignalingMessageToClient = {
        type: 'offer',
        sdp: localSdpOffer,
        candidates: gatheredLocalCandidates,
      };

      const fullOfferPayload = JSON.stringify(offerToClient);
      const totalLength = Math.ceil(fullOfferPayload.length / MAX_QR_CHUNK_SIZE);
      addLog(`Preparing WebRTC offer for QR display (${totalLength} parts)...`);
      setTotalQrParts(totalLength);

      for (let i = 0; i < totalLength; i++) {
        const chunkDataStr = fullOfferPayload.substring(i * MAX_QR_CHUNK_SIZE, (i + 1) * MAX_QR_CHUNK_SIZE);
        const chunk: ChunkedData = {
          part: i + 1,
          length: totalLength,
          data: Buffer.from(chunkDataStr).toString('base64'),
        };
        await displayQrCodeChunk(chunk);
        if (i < totalLength - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Allow time for scanning
        }
      }
      addLog('All QR code parts displayed. Waiting for client answer via DataChannel...');
    };

    const startWebRTC = async () => {
      addLog('Initializing WebRTC PeerConnection...');
      const rtcConfig: RtcConfig = { iceServers: ['stun:stun.l.google.com:19302'] };
      try {
        pc = new PeerConnection('barbarcode-server-peer', rtcConfig);
      } catch (error) {
        addLog(`Failed to create PeerConnection: ${error}`);
        return;
      }

      pc.onStateChange((state: string) => {
        addLog(`PeerConnection state: ${state}`);
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          addLog('PeerConnection disconnected, failed or closed. Resetting.');
          dc?.close(); pc?.close(); dc = null; pc = null;
          gatheredLocalCandidates.length = 0; localSdpOffer = null; iceGatheringSignaledComplete = false;
          setQrCodeString("Connection closed. Restart server to try again.");
          setCurrentQrPart(0);
          // Potentially trigger a restart or exit
        }
      });

      pc.onLocalDescription((sdp: string, type: DescriptionType) => {
        addLog(`Local description ready (type: ${type as string})`);
        if ((type as string) === "Offer") {
          localSdpOffer = sdp;
          if (iceGatheringSignaledComplete) generateAndDisplayQrCodes();
        } else {
          addLog(`Received local description of type ${type as string}, expected "Offer".`);
        }
      });

      pc.onLocalCandidate((candidate: string | null, mid: string | null) => {
        if (candidate && mid) {
          addLog(`Local ICE candidate: ${candidate.substring(0, 30)}... (mid: ${mid})`);
          gatheredLocalCandidates.push({ candidate, mid });
        } else {
          addLog('All local ICE candidates gathered.');
          iceGatheringSignaledComplete = true;
          if (localSdpOffer) generateAndDisplayQrCodes();
        }
      });

      try {
        dc = pc.createDataChannel('barbarcode-channel', { unordered: false });
        addLog(`DataChannel "${dc.getLabel()}" created by server.`);
        setupDataChannelEventHandlers(dc);
      } catch (error) {
        addLog(`Failed to create DataChannel: ${error}`);
        pc?.close(); pc = null;
      }
    };

    const setupDataChannelEventHandlers = (currentDc: DataChannel) => {
      const currentDcLabel = currentDc.getLabel();
      currentDc.onOpen(() => {
        addLog(`DataChannel "${currentDcLabel}" opened!`);
        setQrCodeString("DataChannel Connected! Ready for barcodes.");
        setCurrentQrPart(0); setTotalQrParts(0);
        currentDc.sendMessage('Hello from server! DataChannel is open.');
      });
      currentDc.onClosed(() => addLog(`DataChannel "${currentDcLabel}" closed.`));
      currentDc.onError((err: string) => addLog(`DataChannel "${currentDcLabel}" error: ${err}`));
      currentDc.onMessage((msg: string | Buffer) => {
        const messageStr = Buffer.isBuffer(msg) ? msg.toString() : msg;
        addLog(`Message from client on "${currentDcLabel}": ${messageStr.substring(0,100)}...`);
        try {
          const clientMessage = JSON.parse(messageStr) as SignalingMessageToServer;
          if (clientMessage.type === 'answer' && clientMessage.sdp && pc) {
            addLog('Received answer SDP from client.');
            pc.setRemoteDescription(clientMessage.sdp, "Answer" as DescriptionType);
            if (clientMessage.candidates) {
              addLog(`Received ${clientMessage.candidates.length} remote ICE candidates with answer.`);
              clientMessage.candidates.forEach(c => {
                if (c.candidate && c.mid) pc?.addRemoteCandidate(c.candidate, c.mid);
              });
            }
          } else { // Assuming barcode data if not an answer
            const parsedData = JSON.parse(messageStr) as { code: string; format: string };
            addLog(`Received barcode via WebRTC: ${parsedData.code}, Type: ${parsedData.format}`);
            const keystrokePattern = sessionPattern.replace('{barcode}', parsedData.code);
            executeKeystrokes(keystrokePattern);
          }
        } catch (error) {
          addLog(`Error processing WebRTC message: ${error}`);
        }
      });
    };

    startWebRTC();

    // Cleanup on unmount (though for CLI, it's usually Ctrl+C)
    return () => {
      addLog("Shutting down server...");
      dc?.close();
      pc?.close();
    };
  }, []); // Run once on mount

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
      <Box flexDirection="row">
        <Box width="50%" borderStyle="single" borderColor="green" padding={1} marginRight={1}>
          <Text bold>QR Code Display {currentQrPart > 0 ? `(Part ${currentQrPart}/${totalQrParts})` : ''}</Text>
          <Newline />
          <Text>{qrCodeString}</Text>
        </Box>
        <Box width="50%" borderStyle="single" borderColor="blue" padding={1}>
          <Text bold>Server Logs</Text>
          <Newline />
          {logs.map((log, index) => (
            <Text key={index}>{log}</Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

// --- Helper Functions ---
function getLocalIpAddress() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

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
        // Add more commands as needed
      }
    } else {
      typeString(keystroke);
    }
  }
}

// --- Render Ink App ---
render(
  <StrictMode>
    <App />
  </StrictMode>
);
