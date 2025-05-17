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
nodeDataChannel.initLogger("Verbose"); // Set to maximum verbosity for debugging

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
      onLog(`[DEBUG] Not ready for QR. SDP: ${!!localSdpOffer}, ICE complete: ${iceGatheringComplete}`);
      return;
    }

    // Create the SDP that includes the candidate lines
    let sdpString = localSdpOffer!; // localSdpOffer has been normalized to CRLF in onLocalDescription

    if (gatheredLocalCandidates.length > 0) {
        let lines = sdpString.split('\r\n');
        // If the last line is empty because sdpString ended with \r\n, pop it for clean insertion.
        if (lines.length > 0 && lines[lines.length - 1] === '') {
            lines.pop();
        }

        let mLineIndex = -1;
        for(let i=0; i < lines.length; i++) {
            if (lines[i].startsWith('m=')) { // Find the first m-line
                mLineIndex = i;
                break;
            }
        }

        if (mLineIndex === -1) {
            logWithFile("[ERROR] No m-line found in SDP for candidate insertion. Appending candidates to end.");
            // Fallback: Append candidates to the existing lines if no m-line found
            const candidateStringsForSdp = gatheredLocalCandidates.map(c => c.candidate.trimEnd());
            lines.push(...candidateStringsForSdp);
        } else {
            let insertAtIndex = lines.length; // Default: append to all lines (end of SDP)
            // Find the end of the media section for the *first* m-line to insert candidates before the next m-line
            for (let i = mLineIndex + 1; i < lines.length; i++) {
                if (lines[i].startsWith('m=')) { // Found start of a subsequent media section
                    insertAtIndex = i; // Insert before this new m-line
                    break;
                }
            }
            const candidateStringsForSdp = gatheredLocalCandidates.map(c => c.candidate.trimEnd());
            lines.splice(insertAtIndex, 0, ...candidateStringsForSdp);
            // Add a=end-of-candidates after all actual candidates in this media section
            lines.splice(insertAtIndex + candidateStringsForSdp.length, 0, 'a=end-of-candidates');
        }
        sdpString = lines.join('\r\n');
    }

    // Ensure the final SDP string ends with exactly one CRLF, unless it's empty
    if (sdpString.length > 0) {
        sdpString = sdpString.replace(/(\r\n)*$/, '') + '\r\n';
    }
    
    const sdpForPayload = sdpString; // Use the processed sdpString
    logWithFile(`[FINAL SDP FOR QR]\n${sdpForPayload}\n[/FINAL SDP FOR QR]`);

    const offerToClient: SignalingMessageToClient & { iceServers: string[] } = {
      type: "offer",
      sdp: sdpForPayload, // USE THE SDP WITH INLINED CANDIDATES
      candidates: gatheredLocalCandidates, // Still send them separately (harmless redundancy)
      iceServers: rtcConfig.iceServers as string[],
    };

    const fullOfferPayload = JSON.stringify(offerToClient);
    const totalLength = Math.ceil(fullOfferPayload.length / MAX_QR_CHUNK_SIZE);
    onLog(`[DEBUG] ===========================================`);
    onLog(`[DEBUG] Generating QR codes with:`);
    onLog(`[DEBUG] - ICE candidates in list: ${gatheredLocalCandidates.length}`);
    // Log length of the SDP that *actually* goes into the QR
    onLog(`[DEBUG] - SDP offer length (in QR): ${sdpForPayload.length}`);
    onLog(`[DEBUG] - Total QR parts: ${totalLength}`);
    onLog(`[DEBUG] ===========================================`);

    const allChunks: ChunkedData[] = [];
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
      allChunks.push(chunk);
      await displayQrCodeChunk(chunk);
      if (i < totalLength - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    // Log all chunks as a single block for easy copy-paste
    persistLog(`[ALL QR CHUNKS]\n${allChunks.map(c => JSON.stringify(c)).join('\n')}\n[/ALL QR CHUNKS]`);
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
          logWithFile("[DEBUG] Processing client answer...");
          logWithFile(`[DEBUG] Answer SDP:\n${clientMessage.sdp}`);
          try {
            pc.setRemoteDescription(clientMessage.sdp, "Answer" as DescriptionType);
            logWithFile("[DEBUG] Successfully set remote description from answer");
            
            if (clientMessage.candidates) {
              logWithFile(`[DEBUG] Processing ${clientMessage.candidates.length} remote ICE candidates`);
              for (const c of clientMessage.candidates) {
                if (c.candidate && c.mid) {
                  try {
                    logWithFile(`[DEBUG] Adding remote candidate: ${c.candidate}`);
                    pc.addRemoteCandidate(c.candidate, c.mid);
                  } catch (e) {
                    logWithFile(`[ERROR] Failed to add remote candidate: ${e}`);
                  }
                }
              }
              logWithFile("[DEBUG] Finished processing remote candidates");
            }
          } catch (e) {
            logWithFile(`[ERROR] Failed to set remote description: ${e}`);
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

      // Log gathering state changes
      pc.onGatheringStateChange((state: string) => {
        logWithFile(`[DEBUG] Gathering state changed to: ${state}`);
        if (state === "complete") {
          logWithFile(`[DEBUG] ICE gathering state is 'complete'. Setting iceGatheringComplete = true.`);
          iceGatheringComplete = true;
          // If local offer is already available, try to generate QR codes.
          // This might be called when gatheredLocalCandidates is still empty if onLocalDescription
          // hasn't fired yet, or if onLocalCandidate events for actual candidates are still pending.
          // The looping nature of generateAndDisplayQrCodes should handle eventual consistency.
          if (hasLocalOffer) {
            logWithFile(`[DEBUG] onGatheringStateChange(complete): Offer was ready, generating QR codes.`);
            generateAndDisplayQrCodes();
          } else {
            logWithFile(`[DEBUG] onGatheringStateChange(complete): Offer NOT YET ready. QR codes will be generated when offer is available.`);
          }
        }
      });

    } catch (error) {
      logWithFile(`Failed to create PeerConnection: ${error}`);
      return;
    }

  pc.onStateChange((state: string) => {
    logWithFile(`[DEBUG] PeerConnection state changed to: ${state}`);
    logWithFile(`[DEBUG] Current DataChannel state: ${dc ? dc.isOpen() ? 'open' : 'closed' : 'no datachannel'}`);
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
      // Conditionally add a=ice-lite if in LAN_ONLY mode
      if (process.env.LAN_ONLY === "1" && !/^a=ice-lite/m.test(patchedSdp)) {
        // Insert after a=msid-semantic or a similar session-level attribute
        // Ensure to use \r\n for new lines in SDP
        const msidSemanticPattern = /^(a=msid-semantic:WMS .*)$/m;
        if (msidSemanticPattern.test(patchedSdp)) {
            patchedSdp = patchedSdp.replace(msidSemanticPattern, `$1\r\na=ice-lite`);
        } else {
            // Fallback: attempt to add it after other session attributes if msid-semantic is not found
            // This might need a more robust way to find the end of session-level attributes
            const sdpLines = patchedSdp.split(/\r\n|\n/);
            let firstMLineIndex = sdpLines.findIndex(line => line.startsWith('m='));
            if (firstMLineIndex === -1) firstMLineIndex = sdpLines.length; // if no m-line, append
            sdpLines.splice(firstMLineIndex, 0, 'a=ice-lite');
            patchedSdp = sdpLines.join('\r\n');
        }
      }
      // The faulty a=end-of-candidates logic is removed.

      logWithFile(`[SDP OFFER BEGIN (initial, patched for IP/ice-lite)]\n${patchedSdp}\n[SDP OFFER END (initial, patched for IP/ice-lite)]`);
      // Normalize line endings to CRLF for internal storage and later use
      localSdpOffer = patchedSdp.split(/\r\n|\n/).map(l => l.trimEnd()).join('\r\n');
      hasLocalOffer = true;
      
      // Check if ICE gathering is also complete
      if (iceGatheringComplete) {
        logWithFile("[DEBUG] onLocalDescription: ICE was already complete, generating QR codes.");
        generateAndDisplayQrCodes(); // Trigger QR generation
      } else {
        logWithFile("[DEBUG] onLocalDescription: ICE NOT YET complete, QR will be generated once ICE is done.");
      }
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
