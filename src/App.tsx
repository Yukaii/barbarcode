import React, { useRef, useState, useEffect } from "react";
import QrCode from "qrcode";
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
  const [scanning, setScanning] = useState(false);
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
  const handleManualQrInput = () => {
    if (manualQr.trim()) {
      debugLog(`Manual QR input: ${manualQr}`);
      handleQrCode(manualQr.trim());
      setManualQr("");
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
      }
    } catch (e) {
      // Not a signaling chunk, ignore for now
    }
    // If not a signaling chunk, ignore (for now)
  }

  function handleSignalingChunk(chunk: ChunkedData) {
    if (signalingOfferProcessed) {
      debugLog("Signaling already processed, ignoring further QR chunks.");
      return;
    }
    setTotalChunks((prev) => (prev === -1 ? chunk.length : prev));
    setQrChunks((prev) => {
      const updated = { ...prev, [chunk.part]: atob(chunk.data) };
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
      <div className="mb-4">
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
      <div className="bg-[#18181b] rounded-lg p-4 border border-[#333] mb-4">
        <h3 className="font-semibold mb-2 text-[#4ec9b0]">Debug Log:</h3>
        <pre className="text-xs whitespace-pre-wrap">{log.join("\n")}</pre>
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
