# WebRTC with QR Code Signaling Implementation Plan

This document outlines the plan to implement WebRTC communication between a PWA frontend (hosted on GitHub Pages) and a local Node.js server (`server.cts`), using QR codes for the initial signaling handshake.

## I. Project Goals

1.  Enable direct peer-to-peer communication between the PWA and the local server over the LAN.
2.  Use WebRTC data channels for message exchange.
3.  Implement a "zero-config" signaling mechanism using QR codes, where the server displays QR codes containing its offer, and the PWA scans them to establish a connection.
4.  The PWA will be hosted on GitHub Pages (HTTPS, enabling camera access).
5.  The local server (`server.cts`) will run on the user's machine.

## II. Core Components & Technologies

*   **Frontend (PWA):**
    *   Hosted on GitHub Pages.
    *   HTML, CSS, TypeScript.
    *   Browser's native `RTCPeerConnection` API.
    *   QR Code Scanning Library: `quagga` (already in `package.json`).
*   **Backend (`server.cts`):**
    *   Node.js, TypeScript.
    *   WebRTC Library: `node-datachannel` (to be added).
    *   QR Code Generation Library: `qr` (already in `package.json`, likely referring to `qrcode` or a similar utility; will confirm usage).

## III. Implementation Steps

### A. Server-Side (`server.cts`)

1.  **Install Dependencies:**
    *   Add `node-datachannel` for WebRTC capabilities.
    *   Ensure `qrcode` (or the existing `qr` package if suitable) is used for generating QR codes in the terminal.
2.  **WebRTC Initialization:**
    *   On startup or a trigger, create an `RTCPeerConnection` instance using `node-datachannel`.
    *   Create a data channel (e.g., named "barbarcode-channel").
3.  **Generate Offer & ICE Candidates:**
    *   Create an SDP offer.
    *   Gather local ICE candidates.
    *   The server will act as the "offerer."
4.  **QR Code Generation & Display:**
    *   Combine the SDP offer and ICE candidates into a single JSON string.
    *   **Chunking Data for QR Codes:**
        *   If the JSON string is too large for one QR code, split it into manageable chunks.
        *   Each chunk will be a JSON object: `{ part: number, length: number, data: string }`.
        *   Example: `{ "part": 1, "length": 3, "data": "base64_encoded_chunk_1" }`
    *   Generate QR codes for each chunk. Display these sequentially in the terminal (e.g., updating every 300-500ms, or displaying all at once if feasible).
5.  **Handle Client's Answer:**
    *   Once the PWA scans the offer and connects, it will send its SDP answer and ICE candidates back through the newly established data channel.
    *   The server will listen on the data channel for this answer.
    *   Set the remote description using the PWA's answer.
6.  **Data Channel Communication:**
    *   Implement logic to send and receive messages over the data channel once the connection is fully established.

### B. Client-Side (PWA - e.g., `src/client.ts`)

1.  **QR Code Scanning UI:**
    *   Provide a button/UI element to initiate QR code scanning.
    *   Use `getUserMedia` to access the device camera.
    *   Integrate `quagga` (or chosen library) to scan QR codes from the camera feed.
2.  **Data Reassembly:**
    *   As QR codes are scanned, parse the `{ part, length, data }` structure.
    *   Collect all parts until `part === length`.
    *   Reconstruct the complete JSON string (server's offer and ICE candidates).
3.  **WebRTC Initialization:**
    *   Create an `RTCPeerConnection` instance.
    *   Use the server's ICE candidates when creating the connection.
4.  **Process Offer & Create Answer:**
    *   Set the remote description using the server's SDP offer.
    *   Create an SDP answer.
    *   Gather local ICE candidates for the PWA.
5.  **Send Answer to Server:**
    *   Once the `RTCPeerConnection`'s data channel (initiated by the server's offer) becomes available, send the PWA's SDP answer and its ICE candidates as a JSON string through this data channel.
6.  **Data Channel Communication:**
    *   Implement logic to send and receive messages over the data channel.

## IV. Signaling Flow (QR Code Method)

1.  **Server:** Starts, generates WebRTC offer + ICE candidates.
2.  **Server:** Encodes offer/ICE into chunked QR codes: `{ part: x, length: y, data: chunk_data }`.
3.  **Server:** Displays QR codes sequentially in the terminal.
4.  **PWA:** User initiates scanning. PWA uses camera to read QR codes.
5.  **PWA:** Reassembles the full offer/ICE data from the chunks.
6.  **PWA:** Initializes `RTCPeerConnection`, sets remote description (server's offer), creates an answer.
7.  **PWA:** Once the data channel (defined in server's offer) is open, sends its answer + ICE candidates to the server over this channel.
8.  **Server:** Receives PWA's answer/ICE via data channel, sets remote description.
9.  **Connection Established:** Secure, bidirectional WebRTC data channel is now active.

## V. Key Considerations & Potential Challenges

*   **QR Code Data Capacity:** Ensure chunking logic is robust. Base64 encoding might be useful for the `data` field in chunks.
*   **QR Code Display on Server:** ASCII QR codes in the terminal are feasible.
*   **PWA QR Scanning UX:** Clear instructions for the user, handling of scan errors, and feedback during sequential scanning.
*   **ICE Candidate Gathering:** Ensure sufficient time or mechanisms for ICE candidates to be gathered on both ends before being sent.
*   **Error Handling:** Implement robust error handling for WebRTC state changes, data channel messages, and QR code processing.
*   **Security:** WebRTC connections are inherently encrypted. The QR code transfer is a form of "out-of-band" signaling for the session setup.
*   **Library Versions:** Ensure compatibility between `node-datachannel` and browser WebRTC implementations.

## VI. Next Steps (Post-Planning)

1.  Confirm/Install `node-datachannel` on the server.
2.  Begin implementation of server-side WebRTC logic and QR code generation.
3.  Implement client-side QR scanning and WebRTC logic.
4.  Test thoroughly on the local network.
