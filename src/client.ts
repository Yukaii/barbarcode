import $ from 'jquery';
// @ts-ignore
import Quagga from 'quagga';
import "./styles.css";

declare global {
    interface Window {
        // WebRTC properties
        dataChannel: RTCDataChannel;
        rtcPeerConnection: RTCPeerConnection;
        rtcConnected: boolean;
        sdpAnswer: string;
        
        // WebSocket property (legacy mode)
        websocket: WebSocket;
        
        // Connection mode
        connectionMode: 'webrtc' | 'websocket';
    }
}

function debugLog(message: string) {
    const logContent = $('#log-content');
    logContent.append(`${new Date().toISOString()}: ${message}\n`);
    logContent.scrollTop(logContent[0].scrollHeight);
}

$(() => {
    // Toggle debug log visibility
    $('#toggle-debug-log').on('click', () => {
        $('#debug-log-overlay').toggle();
    });

    // Close debug log when clicking outside
    $('#debug-log-overlay').on('click', function(e: JQuery.ClickEvent) { // Keep 'this' context for jQuery
        if (e.target === this) {
            $(this).hide();
        }
    });

    const App = {
        state: {
            inputStream: {
                type : "LiveStream",
                constraints: {
                    width: {min: 640},
                    height: {min: 480},
                    facingMode: "environment", // environment for back camera, user for front
                    aspectRatio: {min: 1, max: 2}
                }
            },
            locator: {
                patchSize: "medium",
                halfSample: true
            },
            numOfWorkers: navigator.hardwareConcurrency || 2,
            frequency: 10,
            decoder: {
                readers : [
                    {format: "code_128_reader", config: {}},
                    {format: "ean_reader", config: {}},
                    {format: "ean_8_reader", config: {}},
                    {format: "code_39_reader", config: {}},
                    {format: "code_39_vin_reader", config: {}},
                    {format: "codabar_reader", config: {}},
                    {format: "upc_reader", config: {}},
                    {format: "upc_e_reader", config: {}},
                    {format: "i2of5_reader", config: {}},
                    // {format: "2of5_reader", config: {}}, // ITF, often conflicts
                    {format: "code_93_reader", config: {}}
                ]
            },
            locate: true
        },
        lastResult : null as string | null,
        init: function() { // 'this' refers to App object, so keep as function expression
            debugLog('Initializing Quagga...');
            Quagga.init(this.state, (err: Error | undefined) => {
                if (err) {
                    debugLog(`Quagga initialization error: ${JSON.stringify(err)}`);
                    return;
                }
                debugLog('Quagga initialized successfully');
                App.attachListeners();
                Quagga.start();
            });
        },
        restart: function() { // 'this' refers to App object
            debugLog('Restarting Quagga with new settings...');
            Quagga.stop();
            setTimeout(() => {
                Quagga.init(this.state, (err: Error | undefined) => {
                    if (err) {
                        debugLog(`Quagga re-initialization error: ${JSON.stringify(err)}`);
                        return;
                    }
                    debugLog('Quagga re-initialized successfully');
                    Quagga.start();
                });
            }, 100);
        },
        attachListeners: function() { // 'this' refers to App object
            // const self = this; // 'self' pattern is fine here due to 'this' in Quagga.init - now using arrow function, 'this' is lexical
            $('#switch-camera').on('click', () => {
                debugLog('Switch camera button clicked');
                const currentFacingMode = this.state.inputStream.constraints.facingMode;
                if (currentFacingMode === "environment") {
                    this.state.inputStream.constraints.facingMode = "user";
                    debugLog('Switching to user (front) camera');
                } else {
                    this.state.inputStream.constraints.facingMode = "environment";
                    debugLog('Switching to environment (rear) camera');
                }
                this.restart();
            });
        },
    };

    App.init();

    // biome-ignore lint/suspicious/noExplicitAny: QuaggaJS types are not available
    Quagga.onProcessed((result: any) => {
        const drawingCtx = Quagga.canvas.ctx.overlay;
        const drawingCanvas = Quagga.canvas.dom.overlay;

        if (result) {
            if (result.boxes) {
                const canvasWidth = Number.parseInt(drawingCanvas.getAttribute("width") || "0");
                const canvasHeight = Number.parseInt(drawingCanvas.getAttribute("height") || "0");
                drawingCtx.clearRect(0, 0, canvasWidth, canvasHeight);
                // biome-ignore lint/suspicious/noExplicitAny: QuaggaJS types are not available
                for (const box of result.boxes.filter((box: any) => box !== result.box)) {
                    Quagga.ImageDebug.drawPath(box, {x: 0, y: 1}, drawingCtx, {color: "green", lineWidth: 2});
                }
            }

            if (result.box) {
                Quagga.ImageDebug.drawPath(result.box, {x: 0, y: 1}, drawingCtx, {color: "#00F", lineWidth: 2});
            }

            if (result.codeResult?.code) {
                Quagga.ImageDebug.drawPath(result.line, {x: 'x', y: 'y'}, drawingCtx, {color: 'red', lineWidth: 3});
            }
        }
    });

    // biome-ignore lint/suspicious/noExplicitAny: QuaggaJS types are not available
    Quagga.onDetected((result: any) => {
        const code = result.codeResult.code;
        const format = result.codeResult.format;
        debugLog(`Barcode detected: ${code} (Type: ${format})`);

        if (App.lastResult !== code) {
            App.lastResult = code;
            
            const message = JSON.stringify({code: code, format: format});
            
            // Send based on current connection mode
            if (window.connectionMode === 'webrtc' && window.rtcConnected && window.dataChannel) {
                window.dataChannel.send(message);
                debugLog(`Sent to server via WebRTC: ${message}`);
            } else if (window.connectionMode === 'websocket' && window.websocket?.readyState === WebSocket.OPEN) {
                window.websocket.send(message);
                debugLog(`Sent to server via WebSocket: ${message}`);
            } else {
                debugLog(`Connection not ready, could not send: ${code}`);
                debugLog(`Current mode: ${window.connectionMode}, RTCConnected: ${window.rtcConnected}, WebSocket ready: ${window.websocket?.readyState === WebSocket.OPEN}`);
            }
        }
    });
});

// WebRTC connection setup
function initializeWebRTC() {
    try {
        debugLog('Initializing WebRTC connection...');
        
        // Create RTCPeerConnection
        window.rtcPeerConnection = new RTCPeerConnection({ 
            iceServers: [] // No STUN/TURN servers as per requirements
        });
        
        // Create data channel
        window.dataChannel = window.rtcPeerConnection.createDataChannel('barcode');
        
        // Set up data channel event handlers
        window.dataChannel.onopen = () => {
            window.rtcConnected = true;
            debugLog('WebRTC data channel opened');
        };
        
        window.dataChannel.onclose = () => {
            window.rtcConnected = false;
            debugLog('WebRTC data channel closed');
        };
        
        window.dataChannel.onerror = (error: Event) => {
            debugLog(`WebRTC data channel error: ${JSON.stringify(error)}`);
        };
        
        // Parse ICE credentials from the answer SDP
        const iceUfragMatch = window.sdpAnswer.match(/a=ice-ufrag:(.+)/);
        const icePwdMatch = window.sdpAnswer.match(/a=ice-pwd:(.+)/);
        
        if (!iceUfragMatch || !icePwdMatch) {
            debugLog('Could not find ICE credentials in SDP answer');
            return;
        }
        
        const iceUfrag = iceUfragMatch[1];
        const icePwd = icePwdMatch[1];
        
        // Create offer
        window.rtcPeerConnection.createOffer()
            .then(offer => {
                // Patch the offer with server's ICE credentials
                const patchedOffer = {
                    type: 'offer',
                    sdp: offer.sdp
                        ?.replace(/^a=ice-ufrag:.+$/m, `a=ice-ufrag:${iceUfrag}`)
                        .replace(/^a=ice-pwd:.+$/m, `a=ice-pwd:${icePwd}`)
                };
                
                debugLog('Setting patched local description...');
                return window.rtcPeerConnection.setLocalDescription(patchedOffer);
            })
            .then(() => {
                // Set the answer from server as remote description
                debugLog('Setting remote description...');
                return window.rtcPeerConnection.setRemoteDescription({ 
                    type: 'answer', 
                    sdp: window.sdpAnswer 
                });
            })
            .then(() => {
                debugLog('WebRTC connection setup complete, waiting for connection...');
            })
            .catch(error => {
                debugLog(`WebRTC setup error: ${error}`);
            });
    } catch (error) {
        debugLog(`WebRTC initialization error: ${error}`);
    }
}

// WebSocket connection setup (legacy mode)
function initializeWebSocket() {
    try {
        debugLog('Initializing WebSocket connection (legacy mode)...');
        const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        window.websocket = new WebSocket(`${wsProtocol}${window.location.host}`);
        
        window.websocket.onopen = () => {
            debugLog('Connected to WebSocket server');
        };
        
        window.websocket.onerror = (event: Event) => {
            debugLog(`WebSocket Error: ${JSON.stringify(event)}`);
        };
        
        window.websocket.onclose = (event: CloseEvent) => {
            debugLog(`WebSocket connection closed: ${event.code} ${event.reason}`);
        };
    } catch (error) {
        debugLog(`WebSocket initialization error: ${error}`);
    }
}

$(document).ready(() => {
    // Determine connection mode based on URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const sdpParam = urlParams.get('sdp');
    const wsMode = urlParams.get('ws');
    
    // Check for explicit connection mode parameters
    if (sdpParam) {
        // WebRTC mode explicitly requested via SDP parameter
        window.connectionMode = 'webrtc';
        try {
            window.sdpAnswer = atob(sdpParam);
            initializeWebRTC();
        } catch (error) {
            debugLog(`Error parsing SDP: ${error}`);
        }
    } else if (wsMode || wsMode === '') {
        // WebSocket mode explicitly requested
        window.connectionMode = 'websocket';
        initializeWebSocket();
    } else {
        // Try to auto-detect mode - look for SDP in URL path
        if (window.location.pathname.indexOf('/rtc/') === 0) {
            window.connectionMode = 'webrtc';
            // Simple placeholder for demo
            debugLog('WebRTC mode detected from URL path');
            debugLog('In a real implementation, the QR code would contain the SDP');
        } else {
            // Default to WebSocket mode
            window.connectionMode = 'websocket';
            initializeWebSocket();
        }
    }
    
    debugLog(`Connection mode: ${window.connectionMode}`);
});
