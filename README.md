# Barbarcode

Barbarcode is a simple, open-source barcode scanning service with a server and a mobile client, both implemented in JavaScript.

## Demo

https://github.com/user-attachments/assets/6905fc00-624b-4bd9-932c-54c056b6a9ef

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

### Session-based Keystroke Pattern Syntax

The `config.toml` file uses the following structure:
- The `[sessions]` section contains session names and their corresponding keystroke patterns
- Use `{barcode}` in the pattern to represent the scanned barcode value

Keystroke syntax:
- `{barcode}`: Placeholder for the scanned barcode value
- `{enter}`: Enter key
- `{tab}`: Tab key
- `{esc}`: Escape key
- `{delay:ms}`: Delay in milliseconds
- `{up}`, `{down}`, `{left}`, `{right}`: Arrow keys
- `{key:X}`: Custom key (where X is the key to be pressed)
- Any other text is typed as-is

Example `config.toml`:

```toml
[sessions]
inventory_input = "{barcode}{enter}"
price_check = "{key:F4}{barcode}{enter}"
data_entry = "SKU:{barcode}{tab}Quantity:"
complex_input = "{delay:500}{key:F5}{barcode}{tab}1{enter}"
```

## Client

The client is a simple HTML file that:
- Scans a QR code to connect to the server
- Scans barcodes and sends them to the server

### Usage

1. Open the `client/index.html` file in a mobile browser
2. Scan the QR code displayed by the server to connect
3. Start scanning barcodes

### Running a Session

To start a specific session, use the `-s` or `--session` flag when starting the server:

```
node server.js -p 8080 -s inventory_input
```

This will start the server using the keystroke pattern defined for the `inventory_input` session in the `config.toml` file.

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
