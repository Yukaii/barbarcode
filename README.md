# Barbarcode

Barbarcode is a simple, open-source barcode scanning service with a server and a mobile client, both implemented in JavaScript.

## Server

The server is a Node.js application that:
- Runs a WebSocket server to receive scanned barcodes from clients
- Uses a TOML-based configuration for keystroke mapping
- Provides a CLI interface to start scanning sessions

### Setup

1. Navigate to the `server` directory
2. Install dependencies: `npm install`
3. Create a `config.toml` file for keystroke mapping (example below)
4. Run the server: `node server.js -p 8080 -s mysession`

Example `config.toml`:

```toml
[keystrokes]
"123456" = "hello"
"789012" = "world"
```

## Client

The client is a simple HTML file that:
- Scans a QR code to connect to the server
- Scans barcodes and sends them to the server

### Usage

1. Open the `client/index.html` file in a mobile browser
2. Scan the QR code displayed by the server to connect
3. Start scanning barcodes

## Libraries Used

- Server:
  - ws: WebSocket server
  - toml: TOML configuration parsing
  - commander: CLI interface
  - paulmillr-qr: QR code generation
  - robotjs: Keystroke emulation

- Client:
  - html5-qrcode: QR code scanning
  - quaggaJS: Barcode scanning

## License

Barbarcode is open-source and available under the MIT License.

## Contributing

Contributions to Barbarcode are welcome! Please feel free to submit a Pull Request.

## Support

If you encounter any problems or have any questions, please open an issue on the GitHub repository.
