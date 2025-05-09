import $ from 'jquery';
// @ts-ignore
import Quagga from 'quagga';
import "./styles.css";

declare global {
    interface Window {
        websocket: WebSocket;
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

            if (window.websocket?.readyState === WebSocket.OPEN) {
                const message = JSON.stringify({code: code, format: format});
                window.websocket.send(message);
                debugLog(`Sent to server: ${message}`);
            } else {
                debugLog(`WebSocket not open, could not send: ${code}`);
            }
        }
    });
});

// WebSocket connection
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
