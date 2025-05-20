# Barbarcode

[![npm version](https://img.shields.io/npm/v/barbarcode.svg?style=flat-square)](https://www.npmjs.com/package/barbarcode)

Barbarcode is a simple, open-source barcode scanning service with a server and a mobile client, both implemented in JavaScript.

## Demo

https://github.com/user-attachments/assets/6905fc00-624b-4bd9-932c-54c056b6a9ef

## Usage

Get started with Barbarcode in four simple steps:

1. Install the server:
```sh
npm install -g barbarcode
# or use npx without installing
```

2. Create a `config.toml` file with your keystroke mappings:
```toml
[sessions]
inventory_input = "{barcode}{enter}"
price_check = "{key:F4}{barcode}{enter}"
```

3. Start the server with your desired session:
```sh
barbarcode -p 8080 -s inventory_input
# or with npx:
npx barbarcode -p 8080 -s inventory_input
```

4. Scan the QR code displayed by the server using your mobile device to start scanning barcodes!

### Connection Modes

Barbarcode supports two connection modes:

1. **WebRTC Mode (Default)**: Uses a single-QR WebRTC flow for offline LAN connections
   - Works without internet connectivity
   - Requires only one QR code scan (no return-trip signaling)
   - Ideal for secure environments or unstable networks

2. **WebSocket Mode (Legacy)**: Uses traditional WebSockets
   - Requires internet connectivity for ngrok tunnel
   - More compatible with older browsers

To select the connection mode:
```sh
# For WebRTC mode (default)
barbarcode -p 8080 -s inventory_input --rtc

# For WebSocket mode (legacy)
barbarcode -p 8080 -s inventory_input --ws
```

## Server

The server component handles:
- Running a WebRTC data channel server for client connections (in ICE-lite mode)
- Converting scanned barcodes into keystrokes
- Managing scanning sessions via CLI
- Generating QR codes with WebRTC connection details

### Configuration

The `config.toml` file defines how barcodes are processed using keystroke patterns:

```toml
[sessions]
# Press Enter after the barcode
inventory_input = "{barcode}{enter}"

# Press F4, then type barcode, then Enter
price_check = "{key:F4}{barcode}{enter}"

# Type SKU:, the barcode, Tab, then Quantity:
data_entry = "SKU:{barcode}{tab}Quantity:"

# Wait 500ms, press F5, type barcode, Tab, 1, Enter
complex_input = "{delay:500}{key:F5}{barcode}{tab}1{enter}"
```

#### Keystroke Pattern Syntax
- `{barcode}`: The scanned barcode value
- `{enter}`, `{tab}`, `{esc}`: Special keys
- `{delay:ms}`: Add delay in milliseconds
- `{up}`, `{down}`, `{left}`, `{right}`: Arrow keys
- `{key:X}`: Any other key (X)
- Regular text: Typed as-is

## Client

A mobile-first web client that:
- Automatically opens when scanning the server's QR code
- Handles barcode scanning through your device's camera

## Libraries Used

- Server:
  - node-datachannel: WebRTC data channel implementation
  - toml: TOML configuration parsing
  - commander: CLI interface
  - qr: QR code generation
  - robotjs: Keystroke emulation
  - ngrok: Public URL tunneling

- Client:
  - WebRTC: Browser WebRTC API for data channels
  - quaggaJS: Barcode scanning

## License

Barbarcode is open-source and available under the MIT License.

## Contributing

Contributions to Barbarcode are welcome! Please feel free to submit a Pull Request.

## Support

If you encounter any problems or have any questions, please open an issue on the GitHub repository.
