#!/usr/bin/env node
import os from "node:os";
import { parseArgs } from "node:util";
import { createPairing, importKey, pairingUrl } from "@barbarcode/protocol";
import pkg from "../package.json" with { type: "json" };
import { type Config, ConfigError, loadConfig, writeConfigTemplate } from "./config";
import { HostSession } from "./host";
import { createDriver, DRIVER_NAMES, type DriverName, KeyDriverError } from "./keys/drivers";
import { describe } from "./keys/pattern";
import { resolveWebRoot, startLocalServer } from "./transports/local-server";
import { connectRelay, DEFAULT_RELAY_URL } from "./transports/relay";
import {
  lanAddress,
  startCloudflareTunnel,
  startTailscaleServe,
  type Tunnel,
} from "./transports/tunnels";
import type { Transport, TransportHandlers } from "./transports/types";
import { bold, cyan, dim, fail, green, log, printPairing, red, yellow } from "./ui";

const VIAS = ["relay", "cloudflare", "tailscale", "lan"] as const;
type Via = (typeof VIAS)[number];

const HELP = `
  ${bold("barbarcode")} ${dim(pkg.version)}
  Turn your phone into a barcode scanner that types into this computer.

  ${bold("Usage")}
    barbarcode [options]          start scanning (shows a QR code to pair your phone)
    barbarcode init [file]        write an example config (default: ./barbarcode.toml)

  ${bold("Options")}
    -s, --profile <name>    keystroke profile from the config (alias: --session)
    -c, --config <file>     config file (default: ./barbarcode.toml, ./config.toml,
                            ~/.config/barbarcode/config.toml)
        --via <mode>        how the phone reaches this computer:
                              relay       hosted relay, works anywhere (default)
                              cloudflare  Cloudflare quick tunnel, no account needed
                              tailscale   HTTPS on your tailnet, only your devices
                              lan         plain HTTP on the local network (see below)
        --relay <url>       relay URL (env BARBARCODE_RELAY, default ${DEFAULT_RELAY_URL})
    -p, --port <number>     local port for cloudflare/tailscale/lan (default: random)
        --keys <driver>     ${DRIVER_NAMES.join(" | ")} (default: auto)
        --dry-run           print keystrokes instead of typing them (= --keys print)
    -h, --help              show this help
    -v, --version           show the version

  Everything between the phone and this computer is end-to-end encrypted with a key that
  only exists in the QR code. Phone browsers only allow the camera on HTTPS pages, so
  'lan' mode can only scan when the page is opened on this computer (localhost).
`;

function parseCli() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        profile: { type: "string", short: "s" },
        session: { type: "string" },
        config: { type: "string", short: "c" },
        via: { type: "string", default: "relay" },
        relay: { type: "string" },
        port: { type: "string", short: "p" },
        keys: { type: "string", default: "auto" },
        "dry-run": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
    });
  } catch (error) {
    fail(`${(error as Error).message}\n${dim("Run barbarcode --help for usage.")}`);
  }
}

async function main() {
  const { values: opts, positionals } = parseCli();
  if (opts.help) return void console.log(HELP);
  if (opts.version) return void console.log(pkg.version);

  if (positionals[0] === "init") {
    const file = await writeConfigTemplate(positionals[1]);
    console.log(
      `\n  ${green("✓")} Wrote ${file}\n  Start with: ${cyan("barbarcode -s inventory")}\n`,
    );
    return;
  }
  if (positionals.length > 0) fail(`Unknown command "${positionals[0]}". Run barbarcode --help.`);

  const via = opts.via as Via;
  if (!VIAS.includes(via)) fail(`--via must be one of: ${VIAS.join(", ")}`);
  const driverName = (opts["dry-run"] ? "print" : opts.keys) as DriverName;
  if (!DRIVER_NAMES.includes(driverName)) fail(`--keys must be one of: ${DRIVER_NAMES.join(", ")}`);
  const port = opts.port === undefined ? 0 : Number(opts.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail("--port must be 0-65535");

  const config: Config = await loadConfig(opts.config);
  const profileName = opts.profile ?? opts.session ?? config.defaultProfile;
  const profile = config.profiles.find((p) => p.name === profileName);
  if (!profile) {
    fail(
      `Profile "${profileName}" not found. Available: ${config.profiles.map((p) => p.name).join(", ")}`,
    );
  }
  const driver = await createDriver(driverName, (line) => log(`${yellow("would type")} ${line}`));

  const pairing = createPairing();
  let transport: Transport | null = null;
  let tunnel: Tunnel | null = null;
  let phoneCount = 0;

  const host = new HostSession({
    sessionId: pairing.sessionId,
    key: await importKey(pairing.key),
    hostName: os.hostname().replace(/\.local$/, ""),
    profiles: config.profiles,
    activeProfile: profile.name,
    driver,
    send: (frame) => transport?.send(frame),
    events: {
      scan: ({ code, format, actions }) =>
        log(`${bold(code)} ${dim(format)}  ${dim("→")} ${describe(actions)}`),
      typed: ({ ms }) => log(green(`  typed in ${ms}ms`)),
      failed: ({ error }) => log(red(`  ${error.message}`)),
      profile: (name) => log(`profile → ${bold(name)}`),
      rejected: () => log(yellow("ignored a message that failed decryption")),
    },
  });

  const handlers: TransportHandlers = {
    frame: (raw) => void host.receive(raw),
    phones: (count) => {
      if (count > phoneCount)
        log(green(count > 1 ? `${count} phones connected` : "phone connected"));
      else if (count < phoneCount)
        log(dim(count === 0 ? "phone disconnected" : `${count} phones connected`));
      phoneCount = count;
    },
    notice: (message, level) => log(level === "warn" ? yellow(message) : dim(message)),
  };

  const openTransport = async (): Promise<Transport> => {
    if (via === "relay") {
      const relayUrl = opts.relay ?? process.env.BARBARCODE_RELAY ?? DEFAULT_RELAY_URL;
      try {
        return await connectRelay(relayUrl, pairing.sessionId, handlers);
      } catch {
        fail(
          `Could not reach the relay at ${relayUrl}.\n` +
            "Try another way to connect:  barbarcode --via cloudflare   or   --via tailscale",
        );
      }
    }
    const local = await startLocalServer({
      sessionId: pairing.sessionId,
      host: via === "lan" ? "0.0.0.0" : "127.0.0.1",
      port,
      webRoot: resolveWebRoot(),
      on: handlers,
    });
    const base = { send: local.send };
    if (via === "lan") {
      return {
        ...base,
        baseUrl: `http://${lanAddress()}:${local.port}`,
        label: `${yellow("LAN over plain HTTP")} ${dim("— phone cameras need HTTPS; try --via tailscale")}`,
        close: local.close,
      };
    }
    process.stdout.write(
      dim(`  Starting ${via === "cloudflare" ? "Cloudflare tunnel" : "tailscale serve"}…\r`),
    );
    try {
      tunnel =
        via === "cloudflare"
          ? await startCloudflareTunnel(local.port)
          : await startTailscaleServe(local.port);
    } catch (error) {
      await local.close();
      throw error;
    } finally {
      process.stdout.write("\x1b[2K");
    }
    const t = tunnel;
    return {
      ...base,
      baseUrl: t.url,
      label: t.label,
      close: async () => {
        await t.close();
        await local.close();
      },
    };
  };

  transport = await openTransport();
  const warning = (tunnel as Tunnel | null)?.warning;

  printPairing({
    version: pkg.version,
    url: pairingUrl(transport.baseUrl, pairing),
    rows: [
      ["via", `${transport.label} ${dim("· end-to-end encrypted")}`],
      ["profile", `${bold(profile.name)}  ${dim(profile.pattern)}`],
      ["typing", driver.name],
      ["config", config.path ?? dim("built-in profiles (barbarcode init to customize)")],
    ],
  });

  if (warning) log(yellow(warning));

  let stopping = false;
  const shutdown = async () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log(dim("\n  Stopping…"));
    await transport?.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError || error instanceof KeyDriverError || error instanceof Error) {
    fail(error.message);
  }
  fail(String(error));
});
