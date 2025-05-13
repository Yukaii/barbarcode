// server/webrtc.ts
import nodeDataChannel, {
  PeerConnection,
  DataChannel,
  DescriptionType,
  RtcConfig,
} from "node-datachannel";
import qrcode from "qrcode";
import { executeKeystrokes } from "./helpers";

nodeDataChannel.initLogger("Info");

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

const MAX_QR_CHUNK_SIZE = 200;

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
  let iceGatheringSignaledComplete = false;

  const displayQrCodeChunk = async (chunk: ChunkedData) => {
    onLog(`[DEBUG] Entering displayQrCodeChunk for part ${chunk.part}/${chunk.length}`);
    try {
      const qrString = await qrcode.toString(JSON.stringify(chunk), {
        type: "terminal",
        small: true,
      });
      onLog(`[DEBUG] QR code string generated, length: ${qrString.length}`);
      onQr(qrString, chunk.part, chunk.length);
      onLog(`Displaying QR Code (Part ${chunk.part}/${chunk.length})`);
    } catch (err) {
      onLog(`Error generating QR code: ${err}`);
    }
    onLog(`[DEBUG] Exiting displayQrCodeChunk for part ${chunk.part}/${chunk.length}`);
  };

  const generateAndDisplayQrCodes = async () => {
    if (!localSdpOffer || !iceGatheringSignaledComplete) {
      onLog("Local SDP offer or ICE gathering not yet complete. Waiting...");
      return;
    }

    const offerToClient: SignalingMessageToClient = {
      type: "offer",
      sdp: localSdpOffer,
      candidates: gatheredLocalCandidates,
    };

    const fullOfferPayload = JSON.stringify(offerToClient);
    const totalLength = Math.ceil(fullOfferPayload.length / MAX_QR_CHUNK_SIZE);
    onLog(`Preparing WebRTC offer for QR display (${totalLength} parts)...`);

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
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    onLog("All QR code parts displayed. Waiting for client answer via DataChannel...");
  };

  const setupDataChannelEventHandlers = (currentDc: DataChannel) => {
    const currentDcLabel = currentDc.getLabel();
    currentDc.onOpen(() => {
      onLog(`DataChannel "${currentDcLabel}" opened!`);
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
      iceGatheringSignaledComplete = false;
      onQr("Connection closed. Restart server to try again.", 0, 0);
    }
  });

  pc.onLocalDescription((sdp: string, type: DescriptionType) => {
    onLog(`[DEBUG] Local description ready (type: ${type as string})`);
    if ((type as string) === "Offer") {
      onLog(`[DEBUG] Got local SDP offer, length: ${sdp.length}`);
      localSdpOffer = sdp;
      onLog(`[DEBUG] iceGatheringSignaledComplete=${iceGatheringSignaledComplete}`);
      if (iceGatheringSignaledComplete) generateAndDisplayQrCodes();
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
      iceGatheringSignaledComplete = true;
      onLog(`[DEBUG] localSdpOffer is ${localSdpOffer ? 'ready' : 'not ready'}`);
      if (localSdpOffer) generateAndDisplayQrCodes();
    }
  });

  try {
    dc = pc.createDataChannel("barbarcode-channel", { unordered: false });
    onLog(`DataChannel "${dc.getLabel()}" created by server.`);
    setupDataChannelEventHandlers(dc);

    // Initialize signaling by setting local description (will trigger onLocalDescription)
    onLog("[DEBUG] Starting signaling process...");
    pc.setLocalDescription(); // This triggers offer generation internally
  } catch (error) {
    onLog(`Failed to create DataChannel or offer: ${error}`);
    pc?.close();
    pc = null;
  }

  // Return cleanup function
  return () => {
    onLog("Shutting down server...");
    dc?.close();
    pc?.close();
  };
}
