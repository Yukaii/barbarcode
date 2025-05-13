// server/webrtc.ts
// server/webrtc.ts
import nodeDataChannel, {
  PeerConnection,
  DataChannel,
  DescriptionType,
  RtcConfig,
} from "node-datachannel";
import qrcode from "qrcode";
import { encodeQR } from 'qr'
import { executeKeystrokes, getLocalIpAddress } from "./helpers";
import https from "https";
import fs from "fs";

// Helper to fetch nearest STUN servers from always-online-stun project using geolocation
async function fetchStunServers(): Promise<string[]> {
  const VALID_HOSTS = "https://raw.githubusercontent.com/pradt2/always-online-stun/master/valid_hosts.txt";
  const GEO_LOC_URL = "https://raw.githubusercontent.com/pradt2/always-online-stun/master/geoip_cache.txt";
  const GEO_USER_URL = "https://geolocation-db.com/json/";

  function fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on("error", (err) => reject(err));
    });
  }

  function fetchText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve(data));
      }).on("error", (err) => reject(err));
    });
  }

  try {
    const [geoLocs, userGeo, hostsText] = await Promise.all([
      fetchJson(GEO_LOC_URL),
      fetchJson(GEO_USER_URL),
      fetchText(VALID_HOSTS)
    ]);
    const { latitude, longitude } = userGeo;
    const servers = hostsText.trim().split('\n')
      .map(addr => {
        const [stunLat, stunLon] = geoLocs[addr.split(':')[0]] || [null, null];
        let dist = Number.POSITIVE_INFINITY;
        if (stunLat !== null && stunLon !== null && latitude && longitude) {
          dist = Math.sqrt((latitude - stunLat) ** 2 + (longitude - stunLon) ** 2);
        }
        return { addr, dist };
      })
      .filter(({ addr }) => addr && !addr.startsWith("#"))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 10)
      .map(({ addr }) => `stun:${addr}`);
    return servers;
  } catch (err) {
    // fallback to first 10 if geo fails
    return new Promise((resolve, reject) => {
      https.get(VALID_HOSTS, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          const servers = data
            .split("\n")
            .map(line => line.trim())
            .filter(line => line && !line.startsWith("#"))
            .map(addr => `stun:${addr}`)
            .slice(0, 10);
          resolve(servers);
        });
      }).on("error", (err) => reject(err));
    });
  }
}

// Set a higher log level to reduce direct console output from the library
// For debugging STUN issues, temporarily change to "Debug" or "Verbose":
nodeDataChannel.initLogger("Debug"); 
// nodeDataChannel.initLogger("Error"); 

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
  // Helper to also write logs to a file for debugging
  function persistLog(msg: string) {
    try {
      fs.appendFileSync("webrtc-debug.log", msg + "\n");
    } catch (e) {
      // ignore file write errors
    }
  }
  // Wrap onLog to also persist logs
  function logWithFile(msg: string) {
    onLog(msg);
    persistLog(msg);
  }
  // Dynamically fetch STUN servers at startup
  logWithFile("[DEBUG] Fetching STUN server list from always-online-stun...");
  // For LAN-only mode, use host candidates only (no STUN)
  let stunServers: string[] = [];
  if (process.env.LAN_ONLY === "1") {
    logWithFile("[DEBUG] LAN_ONLY mode: using only host ICE candidates (no STUN servers).");
    stunServers = [];
  } else {
    try {
      stunServers = await fetchStunServers();
      logWithFile(`[DEBUG] Fetched ${stunServers.length} STUN servers: ${JSON.stringify(stunServers)}`);
    } catch (err) {
      logWithFile(`[WARN] Failed to fetch STUN servers, falling back to default: ${err}`);
      stunServers = [
        "stun:stun.nextcloud.com:3478",
        "stun:stun.stunprotocol.org:3478",
        "stun:stun.voip.blackberry.com:3478",
        "stun:stun.sipnet.net:3478",
        "stun:stun.ideasip.com:3478"
      ];
    }
  }
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

    const offerToClient: SignalingMessageToClient & { iceServers: string[] } = {
      type: "offer",
      sdp: localSdpOffer,
      candidates: gatheredLocalCandidates,
      iceServers: rtcConfig.iceServers as string[],
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

  logWithFile("Initializing WebRTC PeerConnection...");
  const rtcConfig: RtcConfig = { 
    iceServers: stunServers
  };
  logWithFile(`[DEBUG] Using RTC Configuration: ${JSON.stringify(rtcConfig)}`);
    try {
      pc = new PeerConnection("barbarcode-server-peer", rtcConfig);
      logWithFile("[DEBUG] PeerConnection created successfully");

      // Log ice state changes
      pc.onIceStateChange((state: string) => {
        logWithFile(`[DEBUG] ICE state changed to: ${state}`);
      });

      // Log gathering state changes and trigger QR code generation
      pc.onGatheringStateChange((state: string) => {
        logWithFile(`[DEBUG] Gathering state changed to: ${state}`);
        if (state === "complete") {
          iceGatheringComplete = true;
          logWithFile(`[DEBUG] ICE gathering completed, hasLocalOffer=${hasLocalOffer}`);
          if (hasLocalOffer) generateAndDisplayQrCodes();
        }
      });

    } catch (error) {
      logWithFile(`Failed to create PeerConnection: ${error}`);
      return;
    }

  pc.onStateChange((state: string) => {
    logWithFile(`PeerConnection state: ${state}`);
    if (
      state === "disconnected" ||
      state === "failed" ||
      state === "closed"
    ) {
      logWithFile("PeerConnection disconnected, failed or closed. Resetting.");
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
    logWithFile(`[DEBUG] Local description ready (type: ${type as string})`);
    if ((type as string).toLowerCase() === "offer") {
      logWithFile(`[DEBUG] Got local SDP offer, length: ${sdp.length}`);
      // Patch SDP origin and connection lines to use LAN IP instead of 127.0.0.1/0.0.0.0
      const lanIp = getLocalIpAddress();
      let patchedSdp = sdp.replace(
        /^o=rtc\s+\d+\s+\d+\s+IN IP4 127\.0\.0\.1/m,
        (line) => line.replace("127.0.0.1", lanIp)
      );
      patchedSdp = patchedSdp.replace(
        /^c=IN IP4 0\.0\.0\.0/m,
        `c=IN IP4 ${lanIp}`
      );
      logWithFile(`[SDP OFFER BEGIN]\n${patchedSdp}\n[SDP OFFER END]`);
      localSdpOffer = patchedSdp;
      hasLocalOffer = true;
      logWithFile(`[DEBUG] iceGatheringComplete=${iceGatheringComplete}`);
      if (iceGatheringComplete) generateAndDisplayQrCodes();
    } else {
      logWithFile(
        `Received local description of type ${type as string}, expected "Offer".`
      );
    }
  });

  pc.onLocalCandidate((candidate: string | null, mid: string | null) => {
    if (candidate && mid) {
      logWithFile(
        `[DEBUG] Got local ICE candidate: ${candidate.substring(0, 30)}... (mid: ${mid})`
      );
      logWithFile(`[ICE CANDIDATE] ${candidate} (mid: ${mid})`);
      gatheredLocalCandidates.push({ candidate, mid });
      logWithFile(`[DEBUG] Total ICE candidates gathered so far: ${gatheredLocalCandidates.length}`);
    } else {
      logWithFile("[DEBUG] ICE gathering completed (null candidate received)");
      logWithFile(`[DEBUG] Final ICE candidate count: ${gatheredLocalCandidates.length}`);
      iceGatheringComplete = true;
      logWithFile(`[DEBUG] SDP offer ready: ${!!localSdpOffer}, hasLocalOffer: ${hasLocalOffer}`);
      if (hasLocalOffer) generateAndDisplayQrCodes();
    }
  });

  try {
    dc = pc.createDataChannel("barbarcode-channel", { unordered: false });
    onLog(`DataChannel "${dc.getLabel()}" created by server.`);
    setupDataChannelEventHandlers(dc);

    // Create local description to start signaling
    logWithFile("[DEBUG] Starting signaling process...");
    pc.setLocalDescription(); // Should trigger offer generation and onLocalDescription callback
    logWithFile("[DEBUG] Called setLocalDescription without arguments to generate offer");
  } catch (error) {
    logWithFile(`Failed to create DataChannel or offer: ${error}`);
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
