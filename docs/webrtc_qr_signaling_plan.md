# WebRTC with QR Code Signaling Implementation Plan

This document outlines the plan and current implementation for enabling WebRTC communication between a PWA frontend (hosted on GitHub Pages or locally) and a local Node.js server, using QR codes for the initial signaling handshake.

## I. Project Goals

1.  Enable direct peer-to-peer communication between the PWA and the local server over the LAN.
2.  Use WebRTC data channels for message exchange.
3.  Implement a "zero-config" signaling mechanism using QR codes, where the server displays QR codes containing its offer, and the PWA scans them to establish a connection.
4.  The PWA is designed to be hostable on GitHub Pages (HTTPS, enabling camera access) or run locally.
5.  The local server runs on the user's machine, using a modular TypeScript codebase.

## II. Core Components & Technologies

*   **Frontend (PWA, `src/`):**
    *   React (TypeScript) app in `src/App.tsx`.
    *   HTML, CSS, TypeScript.
    *   Browser's native `RTCPeerConnection` API.
    *   QR Code Scanning Library: [`html5-qrcode`](https://github.com/mebjas/html5-qrcode) (used in the React PWA).
    *   Legacy/alternative implementation: `src/client.ts` (jQuery + Quagga, for barcode scanning, not QR signaling).
*   **Backend (`server/`):**
    *   Node.js, TypeScript.
    *   Modular structure: `server/index.tsx` (entry point), `server/webrtc.ts` (WebRTC and signaling logic), `server/ui.tsx` (Ink UI), `server/helpers.ts`.
    *   WebRTC Library: `node-datachannel`.
    *   QR Code Generation Library: `qrcode` (for terminal QR display).
    *   Terminal UI: [Ink](https://github.com/vadimdemedes/ink) for interactive display and logs.

## III. Implementation Steps

### A. Server-Side (`server/`)

1.  **Dependencies:**
    *   Uses `node-datachannel` for WebRTC capabilities.
    *   Uses `qrcode` for generating QR codes in the terminal.
    *   Uses Ink for terminal UI.
2.  **WebRTC Initialization:**
    *   On startup, creates a `PeerConnection` instance using `node-datachannel`.
    *   Creates a data channel (named "barbarcode-channel").
3.  **Generate Offer & ICE Candidates:**
    *   Creates an SDP offer and gathers local ICE candidates.
    *   The server acts as the "offerer."
4.  **QR Code Generation & Display:**
    *   Combines the SDP offer and ICE candidates into a single JSON string.
    *   **Chunking Data for QR Codes:**
        *   If the JSON string is too large for one QR code, splits it into manageable chunks.
        *   Each chunk is a JSON object: `{ part: number, length: number, data: string }`, with `data` base64-encoded.
    *   Generates QR codes for each chunk and displays them sequentially in the terminal using Ink.
    *   Loops QR code display until a connection is established.
5.  **Handle Client's Answer:**
    *   Once the PWA scans the offer and connects, it sends its SDP answer and ICE candidates back through the established data channel.
    *   The server listens on the data channel for this answer and sets the remote description.
6.  **Data Channel Communication:**
    *   Implements logic to send and receive messages over the data channel once the connection is fully established.
    *   Handles barcode data sent from the client and executes keystroke patterns as configured.

### B. Client-Side (PWA - `src/App.tsx`)

1.  **QR Code Scanning UI:**
    *   Provides a button/UI element to initiate QR code scanning.
    *   Uses `getUserMedia` to access the device camera.
    *   Integrates `html5-qrcode` to scan QR codes from the camera feed.
    *   Also supports manual QR chunk input for testing.
2.  **Data Reassembly:**
    *   As QR codes are scanned, parses the `{ part, length, data }` structure.
    *   Collects all parts until all chunks are received.
    *   Reconstructs the complete JSON string (server's offer and ICE candidates).
3.  **WebRTC Initialization:**
    *   Creates an `RTCPeerConnection` instance.
    *   Uses the server's ICE candidates when creating the connection.
4.  **Process Offer & Create Answer:**
    *   Sets the remote description using the server's SDP offer.
    *   Creates an SDP answer.
    *   Gathers local ICE candidates for the PWA.
5.  **Send Answer to Server:**
    *   Once the `RTCPeerConnection`'s data channel (initiated by the server's offer) becomes available, sends the PWA's SDP answer and its ICE candidates as a JSON string through this data channel.
6.  **Data Channel Communication:**
    *   Implements logic to send and receive messages over the data channel.

**Note:** The legacy `src/client.ts` is focused on barcode scanning and WebSocket communication, not QR-based WebRTC signaling.

## IV. Signaling Flow (QR Code Method)

1.  **Server:** Starts, generates WebRTC offer + ICE candidates.
2.  **Server:** Encodes offer/ICE into chunked QR codes: `{ part: x, length: y, data: chunk_data }`.
3.  **Server:** Displays QR codes sequentially in the terminal (Ink UI).
4.  **PWA:** User initiates scanning. PWA uses camera to read QR codes.
5.  **PWA:** Reassembles the full offer/ICE data from the chunks.
6.  **PWA:** Initializes `RTCPeerConnection`, sets remote description (server's offer), creates an answer.
7.  **PWA:** Once the data channel (defined in server's offer) is open, sends its answer + ICE candidates to the server over this channel.
8.  **Server:** Receives PWA's answer/ICE via data channel, sets remote description.
9.  **Connection Established:** Secure, bidirectional WebRTC data channel is now active.

## V. Key Considerations & Potential Challenges

*   **QR Code Data Capacity:** Chunking logic is implemented; base64 encoding is used for the `data` field in chunks.
*   **QR Code Display on Server:** ASCII QR codes are displayed in the terminal using Ink.
*   **PWA QR Scanning UX:** The React PWA provides clear instructions, error handling, and feedback during sequential scanning.
*   **ICE Candidate Gathering:** The implementation ensures ICE candidates are gathered before signaling proceeds.
*   **Error Handling:** Robust error handling is implemented for WebRTC state changes, data channel messages, and QR code processing.
*   **Security:** WebRTC connections are encrypted. The QR code transfer is an "out-of-band" signaling method.
*   **Library Versions:** Compatibility between `node-datachannel` and browser WebRTC is maintained.

## VI. Current Status & Next Steps

- The server-side WebRTC logic, QR code generation, and Ink UI are implemented in `server/`.
- The client-side React PWA with QR scanning and WebRTC logic is implemented in `src/App.tsx`.
- Legacy barcode scanning (not QR signaling) is available in `src/client.ts`.
- Testing and UX refinement are ongoing.

**Next Steps:**
1.  Continue testing the full QR-based signaling flow on local networks and refine UX.
2.  Expand data channel communication features as needed.
3.  Update documentation and deployment instructions as the implementation evolves.
