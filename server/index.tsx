#!/usr/bin/env node

import React, { StrictMode, useState, useEffect } from "react";
import { render } from "ink";
import { program } from "commander";
import { parse } from "toml";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getLocalIpAddress } from "./helpers";
import { startWebRTCServer } from "./webrtc";
import { App as UIApp } from "./ui";

// CLI/config setup
program
  .version("1.0.0")
  .option("-s, --session <string>", "session identifier", "default")
  .option(
    "-c, --config <path>",
    "path to config.toml",
    path.join(process.cwd(), "config.toml")
  )
  .parse(process.argv);

const options = program.opts();
const configPath = options.config;
if (!existsSync(configPath)) {
  console.error(`Error: Config file not found at "${configPath}"`);
  process.exit(1);
}
const configToml = parse(readFileSync(configPath, "utf-8"));
const sessionName = options.session;

if (!sessionName || !configToml.sessions[sessionName]) {
  console.error(`Error: Session "${sessionName}" not found in config.`);
  process.exit(1);
}
const sessionPattern = configToml.sessions[sessionName];

// Ink UI wrapper
const ServerApp: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [qrCodeString, setQrCodeString] = useState<string>("Waiting for QR code...");
  const [currentQrPart, setCurrentQrPart] = useState(0);
  const [totalQrParts, setTotalQrParts] = useState(0);

  const addLog = (message: string) => {
    setLogs((prevLogs) => [
      ...prevLogs.slice(-20),
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  useEffect(() => {
    addLog("Barbarcode Server (WebRTC Mode with Ink UI)");
    addLog(`Local IP: ${getLocalIpAddress()}`);
    addLog(`Active session: ${sessionName}`);
    addLog("Starting WebRTC signaling...");

    let cleanup: (() => void) | undefined;

    startWebRTCServer({
      sessionPattern,
      onLog: addLog,
      onQr: (qr, part, total) => {
        setQrCodeString(qr);
        setCurrentQrPart(part);
        setTotalQrParts(total);
      },
      onQrReset: () => {
        setQrCodeString("DataChannel Connected! Ready for barcodes.");
        setCurrentQrPart(0);
        setTotalQrParts(0);
      },
    }).then((c) => {
      cleanup = c;
    });

    return () => {
      addLog("Shutting down server...");
      if (cleanup) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <UIApp
      qrCodeString={qrCodeString}
      currentQrPart={currentQrPart}
      totalQrParts={totalQrParts}
      logs={logs}
    />
  );
};

// Render Ink UI
render(
  <StrictMode>
    <ServerApp />
  </StrictMode>
);
