import React, { useRef, useState, useEffect } from "react";
import QrCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import "./styles.css";

type ChunkedData = {
  part: number;
  length: number;
  data: string;
};

type ServerOfferMessage = {
  type: "offer";
  sdp: string;
  candidates: RTCIceCandidateInit[];
};

type ClientAnswerMessage = {
  type: "answer";
  sdp: string;
  candidates: RTCIceCandidateInit[];
};

export default function App() {
  const [log, setLog] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false); // camera scanning mode
  const [qrChunks, setQrChunks] = useState<{ [key: number]: string }>({});
  const [totalChunks, setTotalChunks] = useState(-1);
  const [signalingOfferProcessed, setSignalingOfferProcessed] = useState(false);
  const [offerJson, setOfferJson] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // WebRTC refs
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);

  // Debug log utility
  function debugLog(message: string) {
    setLog((prev) => [...prev, `${new Date().toISOString()}: ${message}`]);
  }

  // --- QR Code Scanning ---
  // For demo: Simulate scanning by uploading an image or pasting QR data
  // In production: Use getUserMedia and a QR code library to scan from camera

  // For now, allow manual input for QR chunk (simulate scanning)
  const [manualQr, setManualQr] = useState("");
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  const handleManualQrInput = () => {
    if (manualQr.trim()) {
      debugLog("Manual QR input started.");
      debugLog(`Manual QR input: ${manualQr}`);
      handleQrCode(manualQr.trim());
      setManualQr("");
      debugLog("Manual QR input finished.");
    }
  };

  // Camera scan handlers
  const startCameraScan = async () => {
    debugLog("Camera scan started.");
    setScanning(true);
    setTimeout(async () => {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode("qr-reader");
      }
      try {
        await html5QrCodeRef.current.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            debugLog(`Camera QR scan: ${decodedText}`);
            handleQrCode(decodedText);
            stopCameraScan();
          },
          (errorMessage) => {
            // Suppress "NotFoundException" (no QR detected in frame)
            if (
              typeof errorMessage === "string" &&
              errorMessage.includes("NotFoundException")
            ) {
              // Do not log this common error
              return;
            }
            debugLog(`Camera scan error: ${errorMessage}`);
          }
        );
      } catch (err) {
        debugLog("Camera scan error: " + err);
        setScanning(false);
      }
    }, 0);
  };

  const stopCameraScan = async () => {
    debugLog("Camera scan stopped.");
    setScanning(false);
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        await html5QrCodeRef.current.clear();
      } catch (e) {
        // ignore
      }
    }
  };

  function handleQrCode(data: string) {
    // Try to parse as a signaling chunk
    try {
      const chunk = JSON.parse(data) as ChunkedData;
      if (
        typeof chunk.part === "number" &&
        typeof chunk.length === "number" &&
        typeof chunk.data === "string"
      ) {
        debugLog(`Received QR chunk: part ${chunk.part}/${chunk.length}`);
        handleSignalingChunk(chunk);
        return;
      } else {
        debugLog("QR code JSON does not match expected chunk structure.");
      }
    } catch (e) {
      debugLog("Scanned QR is not valid JSON or not a signaling chunk.");
    }
    // If not a signaling chunk, ignore (for now)
  }

  // Helper: base64 to UTF-8 string (browser-safe)
  function base64ToUtf8(b64: string): string {
    const binStr = atob(b64);
    const bytes = Uint8Array.from(binStr, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function handleSignalingChunk(chunk: ChunkedData) {
    if (signalingOfferProcessed) {
      debugLog("Signaling already processed, ignoring further QR chunks.");
      return;
    }
    if (chunk.part < 1 || chunk.part > chunk.length) {
      debugLog(`Chunk part ${chunk.part} out of range (1-${chunk.length}), ignoring.`);
      return;
    }
    setTotalChunks((prev) => (prev === -1 ? chunk.length : prev));
    setQrChunks((prev) => {
      if (prev[chunk.part]) {
        debugLog(`Duplicate chunk received for part ${chunk.part}, ignoring.`);
        return prev;
      }
      const updated = { ...prev, [chunk.part]: base64ToUtf8(chunk.data) };
      const receivedChunks = Object.keys(updated).length;
      debugLog(`Collected ${receivedChunks}/${chunk.length} QR chunks.`);
      if (receivedChunks === chunk.length) {
        debugLog("All QR chunks received, assembling offer...");
        let offerJson = "";
        for (let i = 1; i <= chunk.length; i++) {
          if (!updated[i]) {
            debugLog(`Missing chunk ${i}, aborting.`);
            resetWebRTCState();
            return prev;
          }
          offerJson += updated[i];
        }
        setOfferJson(offerJson);
        processOffer(offerJson);
      }
      return updated;
    });
  }

  async function processOffer(offerJson: string) {
    setSignalingOfferProcessed(true);
    try {
      const serverOffer = JSON.parse(offerJson) as ServerOfferMessage;
      if (serverOffer.type !== "offer" || !serverOffer.sdp) {
        debugLog("Invalid offer structure.");
        resetWebRTCState();
        return;
      }
      debugLog("Parsed server offer, creating RTCPeerConnection...");
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          debugLog(`Local ICE candidate: ${event.candidate.candidate}`);
        }
      };
      pc.oniceconnectionstatechange = () => {
        debugLog(`ICE state: ${pc.iceConnectionState}`);
        if (
          ["failed", "disconnected", "closed"].includes(pc.iceConnectionState)
        ) {
          debugLog("ICE connection failed/disconnected/closed, resetting.");
          resetWebRTCState();
        }
      };
      pc.ondatachannel = (event) => {
        debugLog("Received data channel from server.");
        dcRef.current = event.channel;
        setupDataChannelEvents();
      };

      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: "offer", sdp: serverOffer.sdp })
      );
      for (const candidate of serverOffer.candidates) {
        if (candidate.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Wait for ICE gathering to complete
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === "complete") resolve();
        };
      });

      // Wait for data channel to be open
      await new Promise<void>((resolve, reject) => {
        if (dcRef.current && dcRef.current.readyState === "open") return resolve();
        const timeout = setTimeout(
          () => reject(new Error("DataChannel not open in time")),
          5000
        );
        if (dcRef.current) {
          dcRef.current.onopen = () => {
            clearTimeout(timeout);
            resolve();
          };
        }
      });

      // Send answer and local ICE candidates to server via DataChannel
      if (dcRef.current && dcRef.current.readyState === "open") {
        const localCandidates: RTCIceCandidateInit[] = [];
        const answerMsg: ClientAnswerMessage = {
          type: "answer",
          sdp: pc.localDescription!.sdp!,
          candidates: localCandidates,
        };
        dcRef.current.send(JSON.stringify(answerMsg));
        debugLog("Sent answer to server via DataChannel.");
      }
    } catch (e) {
      debugLog(`Error processing offer: ${e}`);
      resetWebRTCState();
    }
  }

  function setupDataChannelEvents() {
    if (!dcRef.current) return;
    dcRef.current.onopen = () => debugLog("DataChannel opened.");
    dcRef.current.onclose = () => debugLog("DataChannel closed.");
    dcRef.current.onerror = (err) => debugLog(`DataChannel error: ${err}`);
    dcRef.current.onmessage = (event) => {
      debugLog(`Message from server: ${event.data}`);
    };
  }

  function resetWebRTCState() {
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setQrChunks({});
    setTotalChunks(-1);
    setSignalingOfferProcessed(false);
    setOfferJson(null);
    debugLog("WebRTC state reset.");
  }

  // --- UI ---
  return (
    <div className="container mx-auto p-4 max-w-3xl">
      <h1 className="text-2xl font-bold text-center mb-4 text-[#4ec9b0] tracking-tight">
        barbarcode — Mobile Scanner (React)
      </h1>
      <div className="mb-4 flex flex-col gap-2">
        {!scanning && (
          <button
            className="bg-[#27c93f] hover:bg-[#13a10e] text-[#1e1e1e] font-semibold py-2 px-4 rounded mb-2"
            onClick={startCameraScan}
          >
            Start Camera Scan
          </button>
        )}
        {scanning && (
          <div className="mb-2">
            <div id="qr-reader" style={{ width: 300, margin: "0 auto" }} />
            <button
              className="bg-[#c92c2c] hover:bg-[#a10e0e] text-[#fff] font-semibold py-2 px-4 rounded mt-2"
              onClick={stopCameraScan}
            >
              Stop Scanning
            </button>
          </div>
        )}
        {!scanning && (
          <div>
            <label className="block mb-2 font-semibold">Paste QR chunk data (simulate scan):</label>
            <textarea
              className="w-full p-2 rounded border bg-[#23272e] text-[#d4d4d4] mb-2"
              rows={2}
              value={manualQr}
              onChange={(e) => setManualQr(e.target.value)}
            />
            <button
              className="bg-[#27c93f] hover:bg-[#13a10e] text-[#1e1e1e] font-semibold py-2 px-4 rounded"
              onClick={handleManualQrInput}
            >
              Submit QR Chunk
            </button>
          </div>
        )}
      </div>
      <div className="bg-[#18181b] rounded-lg p-4 border border-[#333] mb-4">
        <h3 className="font-semibold mb-2 text-[#4ec9b0]">Debug Log:</h3>
        <div
          className="text-xs whitespace-pre-wrap"
          style={{
            maxHeight: 200,
            overflowY: "auto",
            wordBreak: "break-all",
            whiteSpace: "pre-wrap",
          }}
        >
          {log.map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="font-semibold mb-2 text-[#4ec9b0]">Collected QR Chunks:</h3>
        <pre className="text-xs whitespace-pre-wrap">
          {Object.keys(qrChunks)
            .sort((a, b) => Number(a) - Number(b))
            .map((k) => `Part ${k}: ${qrChunks[Number(k)].slice(0, 30)}...`)
            .join("\n")}
        </pre>
      </div>
      <div className="mt-4">
        <button
          className="bg-[#23272e] hover:bg-[#333] text-[#d4d4d4] font-semibold py-2 px-4 rounded"
          onClick={resetWebRTCState}
        >
          Reset WebRTC State
        </button>
      </div>
    </div>
  );
}
