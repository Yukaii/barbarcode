# Barbarcode

[![npm version](https://img.shields.io/npm/v/barbarcode.svg?style=flat-square)](https://www.npmjs.com/package/barbarcode)

Turn your phone into a barcode scanner that types into your computer, like a USB scanner
(a "keyboard wedge"), plus custom keystrokes after every scan.

```sh
npx barbarcode
```

A QR code appears in your terminal. Scan it with your phone's camera, point the phone at a
barcode, and the value is typed into whatever window is focused on your computer. No app to
install, no account, nothing to configure.

https://github.com/user-attachments/assets/6905fc00-624b-4bd9-932c-54c056b6a9ef

## Keystroke profiles

By default each scan is typed followed by Enter. Write your own sequences in `barbarcode.toml`:

```sh
npx barbarcode init        # writes an example barbarcode.toml
npx barbarcode -s price_check
```

```toml
default = "inventory"

[profiles]
inventory   = "{barcode}{enter}"
price_check = "{f4}{barcode}{enter}"
data_entry  = "SKU:{barcode}{tab}Quantity:"
search      = "{cmd+k}{delay:150}{barcode}{enter}"
```

Every profile shows up on the phone, so you can switch between them while scanning.

| Token                                                                       | Meaning                                                               |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `{barcode}`                                                                 | The scanned value. Always typed literally, never interpreted as keys. |
| `{enter}` `{tab}` `{esc}` `{space}` `{backspace}` `{delete}`                | Special keys                                                          |
| `{up}` `{down}` `{left}` `{right}` `{home}` `{end}` `{pageup}` `{pagedown}` | Navigation                                                            |
| `{f1}` … `{f24}`                                                            | Function keys (`{key:F4}` from 0.1 still works)                       |
| `{ctrl+s}` `{cmd+shift+z}` `{alt+tab}`                                      | Shortcuts: `ctrl`, `shift`, `alt`/`option`, `cmd`/`meta`/`win`        |
| `{delay:250}`                                                               | Wait, in milliseconds                                                 |
| `{{` `}}`                                                                   | Literal braces                                                        |

Config is looked up in `./barbarcode.toml`, `./config.toml` (0.1 location, `[sessions]` still
accepted) and `~/.config/barbarcode/config.toml`, or pass `-c <file>`.

## How the phone reaches your computer

Phone browsers only allow the camera on HTTPS pages, so barbarcode needs an HTTPS address that
your phone can reach. Pick one with `--via`:

| Mode                | Command                       | Needs                                                                                                     | Good for                                              |
| ------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Relay** (default) | `barbarcode`                  | nothing                                                                                                   | Works anywhere, behind any NAT or firewall            |
| **Cloudflare**      | `barbarcode --via cloudflare` | [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) | Self-hosted, no account or login needed               |
| **Tailscale**       | `barbarcode --via tailscale`  | [Tailscale](https://tailscale.com/download) with HTTPS enabled                                            | Private: only your own devices can connect            |
| **LAN**             | `barbarcode --via lan`        | nothing                                                                                                   | Development (plain HTTP, so phone cameras won't work) |

In every mode, messages between the phone and your computer are **end-to-end encrypted**
(AES-GCM). The key exists only in the QR code's URL fragment (`#…`), which browsers never send
to a server, so neither the relay nor a tunnel can read your scans or type on your computer.

## Typing on each OS

| OS              | How keys are sent           | Setup                                                                                |
| --------------- | --------------------------- | ------------------------------------------------------------------------------------ |
| macOS           | `osascript` (System Events) | Allow your terminal app under _System Settings → Privacy & Security → Accessibility_ |
| Windows         | PowerShell `SendKeys`       | none                                                                                 |
| Linux (X11)     | `xdotool`                   | `sudo apt install xdotool`                                                           |
| Linux (Wayland) | `wtype`                     | `sudo apt install wtype`                                                             |

Use `--dry-run` to print the keystrokes instead of typing them.

## Options

```
-s, --profile <name>    keystroke profile from the config (alias: --session)
-c, --config <file>     config file
    --via <mode>        relay | cloudflare | tailscale | lan
    --relay <url>       relay URL (env BARBARCODE_RELAY)
-p, --port <number>     local port for cloudflare/tailscale/lan (default: random)
    --keys <driver>     auto | macos | windows | xdotool | wtype | print
    --dry-run           print keystrokes instead of typing them
```

## Phone scanner

The scanner page uses the browser's built-in `BarcodeDetector` where available (Android Chrome)
and falls back to [ZXing](https://github.com/zxing-cpp/zxing-cpp) compiled to WebAssembly
(iOS Safari, Firefox). It supports EAN/UPC, Code 128/39/93, ITF, Codabar, QR, Data Matrix,
PDF417, Aztec and more. It keeps the screen awake, beeps and vibrates on each scan, has a torch
toggle, lets you type codes by hand, and resends scans made while the connection was down.

## Self-hosting the relay

The relay is one Cloudflare Worker with a Durable Object per pairing session. It serves the
phone page and pairs the two WebSockets, keeps no stored data, and should fit comfortably in the Workers free plan (idle sessions
hibernate).

```sh
pnpm install
pnpm --filter @barbarcode/relay exec wrangler login   # once
pnpm deploy:relay             # builds the phone page and runs `wrangler deploy`
barbarcode --relay https://barbarcode-relay.<your-subdomain>.workers.dev
```

To use your own domain, uncomment `routes` in `packages/relay/wrangler.jsonc`. CI deploys the
relay on pushes to `main` when the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets are set.

## Development

```
packages/
  protocol/   shared message types + end-to-end encryption (WebCrypto)
  web/        phone scanner page (Vite, vanilla TS)
  cli/        the `barbarcode` npm package (tsdown)
  relay/      Cloudflare Worker + Durable Object
  landing/    barbarcode.yukai.dev
```

```sh
pnpm install
pnpm build                    # web → cli (bundles the page) → landing
pnpm test                     # vitest
pnpm lint && pnpm typecheck   # biome, tsc
pnpm dev:relay                # relay + phone page on http://localhost:8787
node packages/cli/dist/cli.mjs --relay http://localhost:8787 --dry-run
```

Open the printed URL on the same computer (`localhost` counts as secure, so the camera works) to
try the whole flow without a phone.

### Releasing

1. Bump `version` in `packages/cli/package.json` and merge it.
2. `git tag v<version> && git push origin v<version>`

The tag runs `.github/workflows/npm-publish.yml`, which tests, packs and publishes with npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers) (no npm token; provenance included).

## License

MIT
