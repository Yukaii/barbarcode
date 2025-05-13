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
  candidates: { candidate: string; mid: string }[];
};

type ClientAnswerMessage = {
  type: "answer";
  sdp: string;
  candidates: { candidate: string; mid: string }[]; // Corrected to match server expectation and actual usage
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
            // Camera will be stopped after all chunks are received
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
      return updated;
    });
  }

  // Effect: when all QR chunks are collected, stop camera and process offer
  useEffect(() => {
    if (
      totalChunks > 0 &&
      Object.keys(qrChunks).length === totalChunks &&
      !signalingOfferProcessed
    ) {
      debugLog("All QR chunks received, assembling offer...");
      (async () => {
        await stopCameraScan();
        let offerJson = "";
        for (let i = 1; i <= totalChunks; i++) {
          if (!qrChunks[i]) {
            debugLog(`Missing chunk ${i}, aborting.`);
            resetWebRTCState();
            return;
          }
          offerJson += qrChunks[i];
        }
        setOfferJson(offerJson);
        processOffer(offerJson);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrChunks, totalChunks]);

  async function processOffer(offerJson: string) {
    setSignalingOfferProcessed(true);
    try {
      const serverOffer = JSON.parse(offerJson) as ServerOfferMessage & { iceServers?: string[] };
      if (serverOffer.type !== "offer" || !serverOffer.sdp) {
        debugLog("Invalid offer structure.");
        resetWebRTCState();
        return;
      }
      let iceServers: RTCIceServer[] = [];
      if (serverOffer.iceServers && Array.isArray(serverOffer.iceServers) && serverOffer.iceServers.length > 0) {
        iceServers = serverOffer.iceServers.map(url => ({ urls: url }));
        debugLog("Using ICE servers from offer: " + JSON.stringify(iceServers));
      } else {
        debugLog("Using only host ICE candidates (no STUN/TURN).");
      }
      debugLog("Parsed server offer, creating RTCPeerConnection...");
      const pc = new RTCPeerConnection({
        iceServers,
      });
      pcRef.current = pc;

      // Collect local ICE candidates
      const localCandidates: { candidate: string; mid: string }[] = [];
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          debugLog(`Local ICE candidate: ${event.candidate.candidate}`);
          if (event.candidate.candidate && event.candidate.sdpMid) {
            localCandidates.push({
              candidate: event.candidate.candidate,
              mid: event.candidate.sdpMid,
            });
          }
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
          // Map 'mid' to 'sdpMid' for browser compatibility
          const rtcCandidate = {
            candidate: candidate.candidate,
            sdpMid: candidate.mid ?? null,
          };
          await pc.addIceCandidate(new RTCIceCandidate(rtcCandidate));
        }
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Wait for ICE gathering to complete
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") {
          debugLog("Local ICE gathering complete.");
          return resolve();
        }
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === "complete") {
            debugLog("Local ICE gathering complete (event).");
            resolve();
          }
        };
      });

      // Wait for dcRef.current to be populated by pc.ondatachannel
      debugLog("Waiting for DataChannel object to be available from server...");
      await new Promise<void>((resolve, reject) => {
        const checkInterval = 100; // ms
        let elapsedTime = 0;
        const maxWaitTime = 7000; // ms, 7 seconds

        const intervalId = setInterval(() => {
          if (dcRef.current) {
            clearInterval(intervalId);
            debugLog("DataChannel object (dcRef.current) is now available.");
            resolve();
          } else {
            elapsedTime += checkInterval;
            if (elapsedTime >= maxWaitTime) {
              clearInterval(intervalId);
              debugLog(`Timeout: dcRef.current not set by ondatachannel within ${maxWaitTime / 1000}s.`);
              reject(new Error("DataChannel object not received from server in time"));
            }
          }
        }, checkInterval);
      });

      // Send answer and local ICE candidates to server via DataChannel
      // dcRef.current is now available, but its readyState might not be 'open' yet.
      // The browser's WebRTC stack should queue the message if the channel is opening.
      if (dcRef.current) {
        const answerMsg: ClientAnswerMessage = {
          type: "answer",
          sdp: pc.localDescription!.sdp!,
          candidates: localCandidates, // Already in { candidate: string; mid: string }[] format
        };
        dcRef.current.send(JSON.stringify(answerMsg));
        debugLog("Attempted to send answer to server via DataChannel.");
      } else {
         // This path should ideally not be taken if the above promise resolved.
         debugLog("Error: dcRef.current is null after waiting. Cannot send answer.");
         resetWebRTCState();
         return; // Abort
      }

      // Now, wait for the data channel to actually confirm it's open for application messages
      debugLog("Waiting for DataChannel.onopen event (confirmation after sending answer)...");
      await new Promise<void>((resolve, reject) => {
        if (!dcRef.current) { // Should not happen
            reject(new Error("dcRef.current is null before onopen confirmation wait"));
            return;
        }
        if (dcRef.current.readyState === "open") {
           debugLog("DataChannel was already open (after sending answer).");
           return resolve();
        }
        const onOpenTimeout = setTimeout(() => {
            debugLog("Timeout waiting for DataChannel.onopen after sending answer.");
            reject(new Error("DataChannel did not open in time (after sending answer)"));
          }, 5000); // 5 seconds for onopen

        const originalOnOpen = dcRef.current.onopen;
        dcRef.current.onopen = function(this: RTCDataChannel, ev: Event) {
          if (originalOnOpen) {
            originalOnOpen.call(this, ev); 
          }
          clearTimeout(onOpenTimeout);
          debugLog("DataChannel.onopen event fired (confirmation wait)!");
          resolve();
        };

        const originalOnError = dcRef.current.onerror;
        dcRef.current.onerror = function(this: RTCDataChannel, ev: Event) {
            if (originalOnError) {
                originalOnError.call(this, ev); 
            }
            clearTimeout(onOpenTimeout);
            debugLog(`DataChannel error during onopen confirmation wait: type=${ev.type}`);
            reject(new Error(`DataChannel error during onopen confirmation wait. Type: ${ev.type}`));
        };
      });
      debugLog("DataChannel is confirmed open and ready for application messages.");

    } catch (e) {
      debugLog(`Error processing offer: ${e}`);
      resetWebRTCState();
    }
  }

  function setupDataChannelEvents() {
    if (!dcRef.current) return;
    dcRef.current.onopen = function(this: RTCDataChannel, ev: Event) {
      debugLog("DataChannel opened.");
    };
    dcRef.current.onclose = function(this: RTCDataChannel, ev: Event) { 
      debugLog("DataChannel closed.");
    };
    dcRef.current.onerror = function(this: RTCDataChannel, ev: Event) {
      debugLog(`DataChannel error: type=${ev.type}`);
    };
    dcRef.current.onmessage = function(this: RTCDataChannel, ev: MessageEvent) { 
      debugLog(`Message from server: ${ev.data}`);
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
