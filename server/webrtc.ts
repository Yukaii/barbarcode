// server/webrtc.ts
import nodeDataChannel, {
  PeerConnection,
  DataChannel,
  DescriptionType,
  RtcConfig,
} from "node-datachannel";
import qrcode from "qrcode";
import { encodeQR } from 'qr'
import { executeKeystrokes } from "./helpers";

// Set a higher log level to reduce direct console output from the library
nodeDataChannel.initLogger("Error"); 

export interface SignalingMessageToServer {
  type: "answer";
  sdp: string;
  candidates?: { candidate: string; mid: string }[];
}

export interface SignalingMessageToClient {
  type: "offer";
  sdp: string;
  candidates: { candidate: string; mid: string }[];
}

export interface ChunkedData {
  part: number;
  length: number;
  data: string;
}

const MAX_QR_CHUNK_SIZE = 80;

interface WebRTCServerOptions {
  sessionPattern: string;
  onLog: (msg: string) => void;
  onQr: (qr: string, part: number, total: number) => void;
  onQrReset: () => void;
}

export async function startWebRTCServer({
  sessionPattern,
  onLog,
  onQr,
  onQrReset,
}: WebRTCServerOptions) {
  let pc: PeerConnection | null = null;
  let dc: DataChannel | null = null;
  const gatheredLocalCandidates: { candidate: string; mid: string }[] = [];
  let localSdpOffer: string | null = null;
  let iceGatheringComplete = false;
  let hasLocalOffer = false;
  let isConnectionEstablished = false;
  let qrLoopController: { stop: boolean } = { stop: false };

  const displayQrCodeChunk = async (chunk: ChunkedData) => {
    onLog(`[DEBUG] Entering displayQrCodeChunk for part ${chunk.part}/${chunk.length}`);
    try {
      const qrString = await qrcode.toString(JSON.stringify(chunk), {
        type: "terminal",
        small: true,
      });
      // PNG image saving disabled by user request
      onLog(`[DEBUG] QR code string generated, length: ${qrString.length}`);
      onQr(qrString, chunk.part, chunk.length);
      onLog(`Displaying QR Code (Part ${chunk.part}/${chunk.length})`);
    } catch (err) {
      onLog(`Error generating QR code: ${err}`);
    }
    onLog(`[DEBUG] Exiting displayQrCodeChunk for part ${chunk.part}/${chunk.length}`);
  };

  const generateAndDisplayQrCodes = async () => {
    if (!localSdpOffer || !iceGatheringComplete) {
      onLog(`[DEBUG] Not ready. SDP: ${!!localSdpOffer}, ICE complete: ${iceGatheringComplete}`);
      return;
    }

    const offerToClient: SignalingMessageToClient = {
      type: "offer",
      sdp: localSdpOffer,
      candidates: gatheredLocalCandidates,
    };

    const fullOfferPayload = JSON.stringify(offerToClient);
    const totalLength = Math.ceil(fullOfferPayload.length / MAX_QR_CHUNK_SIZE);
    onLog(`[DEBUG] ===========================================`);
    onLog(`[DEBUG] Generating QR codes with:`);
    onLog(`[DEBUG] - ICE candidates: ${gatheredLocalCandidates.length}`);
    onLog(`[DEBUG] - SDP offer length: ${localSdpOffer.length}`);
    onLog(`[DEBUG] - Total QR parts: ${totalLength}`);
    onLog(`[DEBUG] ===========================================`);

    for (let i = 0; i < totalLength; i++) {
      const chunkDataStr = fullOfferPayload.substring(
        i * MAX_QR_CHUNK_SIZE,
        (i + 1) * MAX_QR_CHUNK_SIZE
      );
      const chunk: ChunkedData = {
        part: i + 1,
        length: totalLength,
        data: Buffer.from(chunkDataStr).toString("base64"),
      };
      await displayQrCodeChunk(chunk);
      if (i < totalLength - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    onLog("All QR code parts displayed. Waiting for client answer via DataChannel...");
    // If connection not yet established, loop QR display
    if (!isConnectionEstablished && !qrLoopController.stop) {
      onLog("[DEBUG] Looping QR code display...");
      setTimeout(() => generateAndDisplayQrCodes(), 500); // Loop after a short delay
    } else {
      onLog("[DEBUG] QR code display loop stopped.");
    }
  };

  const setupDataChannelEventHandlers = (currentDc: DataChannel) => {
    const currentDcLabel = currentDc.getLabel();
    currentDc.onOpen(() => {
      onLog(`DataChannel "${currentDcLabel}" opened!`);
      isConnectionEstablished = true;
      qrLoopController.stop = true; // Stop the QR loop
      onQrReset();
      currentDc.sendMessage("Hello from server! DataChannel is open.");
    });
    currentDc.onClosed(() => onLog(`DataChannel "${currentDcLabel}" closed.`));
    currentDc.onError((err: string) =>
      onLog(`DataChannel "${currentDcLabel}" error: ${err}`)
    );
    currentDc.onMessage((msg: string | ArrayBuffer | Buffer<ArrayBufferLike>) => {
      let messageStr: string;
      if (typeof msg === "string") {
        messageStr = msg;
      } else if (msg instanceof Buffer) {
        messageStr = msg.toString();
      } else if (msg instanceof ArrayBuffer) {
        messageStr = Buffer.from(msg).toString();
      } else {
        onLog("Received unknown message type on DataChannel.");
        return;
      }
      onLog(
        `Message from client on "${currentDcLabel}": ${messageStr.substring(
          0,
          100
        )}...`
      );
      try {
        const clientMessage = JSON.parse(messageStr) as SignalingMessageToServer;
        if (clientMessage.type === "answer" && clientMessage.sdp && pc) {
          onLog("Received answer SDP from client.");
          pc.setRemoteDescription(clientMessage.sdp, "Answer" as DescriptionType);
          if (clientMessage.candidates) {
            onLog(
              `Received ${clientMessage.candidates.length} remote ICE candidates with answer.`
            );
            clientMessage.candidates.forEach((c) => {
              if (c.candidate && c.mid) pc?.addRemoteCandidate(c.candidate, c.mid);
            });
          }
        } else {
          // Assuming barcode data if not an answer
          const parsedData = JSON.parse(messageStr) as {
            code: string;
            format: string;
          };
          onLog(
            `Received barcode via WebRTC: ${parsedData.code}, Type: ${parsedData.format}`
          );
          const keystrokePattern = sessionPattern.replace(
            "{barcode}",
            parsedData.code
          );
          executeKeystrokes(keystrokePattern);
        }
      } catch (error) {
        onLog(`Error processing WebRTC message: ${error}`);
      }
    });
  };

  onLog("Initializing WebRTC PeerConnection...");
  const rtcConfig: RtcConfig = { iceServers: ["stun:stun.l.google.com:19302"] };
    try {
      pc = new PeerConnection("barbarcode-server-peer", rtcConfig);
      onLog("[DEBUG] PeerConnection created successfully");

      // Log ice state changes
      pc.onIceStateChange((state: string) => {
        onLog(`[DEBUG] ICE state changed to: ${state}`);
      });

      // Log gathering state changes and trigger QR code generation
      pc.onGatheringStateChange((state: string) => {
        onLog(`[DEBUG] Gathering state changed to: ${state}`);
        if (state === "complete") {
          iceGatheringComplete = true;
          onLog(`[DEBUG] ICE gathering completed, hasLocalOffer=${hasLocalOffer}`);
          if (hasLocalOffer) generateAndDisplayQrCodes();
        }
      });

    } catch (error) {
      onLog(`Failed to create PeerConnection: ${error}`);
      return;
    }

  pc.onStateChange((state: string) => {
    onLog(`PeerConnection state: ${state}`);
    if (
      state === "disconnected" ||
      state === "failed" ||
      state === "closed"
    ) {
      onLog("PeerConnection disconnected, failed or closed. Resetting.");
      dc?.close();
      pc?.close();
      dc = null;
      pc = null;
      gatheredLocalCandidates.length = 0;
      localSdpOffer = null;
      iceGatheringComplete = false;
      hasLocalOffer = false;
      isConnectionEstablished = false;
      qrLoopController.stop = false; // Reset for next attempt
      onQr("Connection closed. Restart server to try again.", 0, 0);
    }
  });

  pc.onLocalDescription((sdp: string, type: DescriptionType) => {
    onLog(`[DEBUG] Local description ready (type: ${type as string})`);
    if ((type as string).toLowerCase() === "offer") {
      onLog(`[DEBUG] Got local SDP offer, length: ${sdp.length}`);
      localSdpOffer = sdp;
      hasLocalOffer = true;
      onLog(`[DEBUG] iceGatheringComplete=${iceGatheringComplete}`);
      if (iceGatheringComplete) generateAndDisplayQrCodes();
    } else {
      onLog(
        `Received local description of type ${type as string}, expected "Offer".`
      );
    }
  });

  pc.onLocalCandidate((candidate: string | null, mid: string | null) => {
    if (candidate && mid) {
      onLog(
        `[DEBUG] Got local ICE candidate: ${candidate.substring(0, 30)}... (mid: ${mid})`
      );
      gatheredLocalCandidates.push({ candidate, mid });
      onLog(`[DEBUG] Total ICE candidates gathered so far: ${gatheredLocalCandidates.length}`);
    } else {
      onLog("[DEBUG] ICE gathering completed (null candidate received)");
      onLog(`[DEBUG] Final ICE candidate count: ${gatheredLocalCandidates.length}`);
      iceGatheringComplete = true;
      onLog(`[DEBUG] SDP offer ready: ${!!localSdpOffer}, hasLocalOffer: ${hasLocalOffer}`);
      if (hasLocalOffer) generateAndDisplayQrCodes();
    }
  });

  try {
    dc = pc.createDataChannel("barbarcode-channel", { unordered: false });
    onLog(`DataChannel "${dc.getLabel()}" created by server.`);
    setupDataChannelEventHandlers(dc);

    // Create local description to start signaling
    onLog("[DEBUG] Starting signaling process...");
    pc.setLocalDescription(); // Should trigger offer generation and onLocalDescription callback
    onLog("[DEBUG] Called setLocalDescription without arguments to generate offer");
  } catch (error) {
    onLog(`Failed to create DataChannel or offer: ${error}`);
    pc?.close();
    pc = null;
  }

  // Return cleanup function
  return () => {
    onLog("Shutting down server...");
    qrLoopController.stop = true; // Stop any ongoing QR loop
    dc?.close();
    pc?.close();
    // Suppress further node-datachannel logs
    nodeDataChannel.initLogger("Error");
  };
}
