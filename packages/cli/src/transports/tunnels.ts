import { type ChildProcess, spawn } from "node:child_process";
import { Resolver } from "node:dns/promises";
import { get } from "node:https";
import type { LookupFunction } from "node:net";
import os from "node:os";
import { findExecutable, run } from "../exec";

export interface Tunnel {
  url: string;
  label: string;
  /** Set when the URL could not be verified from this machine (the phone may still reach it). */
  warning?: string;
  close(): Promise<void>;
}

export class TunnelError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolves through Cloudflare's public DNS instead of the OS resolver. A brand-new quick-tunnel
 * hostname takes a few seconds to appear in DNS, and asking the OS too early makes it cache
 * "no such host" for minutes, which would also break the URL for the user on this machine.
 */
const publicDns = new Resolver();
publicDns.setServers(["1.1.1.1", "1.0.0.1"]);
const publicLookup: LookupFunction = (hostname, options, callback) => {
  publicDns.resolve4(hostname).then(
    (addresses) => {
      const address = addresses[0] as string;
      if (options.all) callback(null, [{ address, family: 4 }]);
      else callback(null, address, 4);
    },
    (error: NodeJS.ErrnoException) => callback(error, "", 4),
  );
};

function healthCheck(url: string, lookup?: LookupFunction): Promise<boolean> {
  return new Promise((resolve) => {
    const req = get(`${url}/health`, { lookup, timeout: 4000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
  });
}

/** Polls `${url}/health` until it answers, so the QR code doesn't point at a dead URL. */
async function waitUntilReachable(url: string, timeoutMs: number, lookup?: LookupFunction) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await healthCheck(url, lookup)) return true;
    await sleep(1000);
  }
  return false;
}

function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 3000).unref();
  });
}

/** Waits for `pattern` to appear on the child's output, or fails if it exits first. */
function waitForOutput(child: ChildProcess, pattern: RegExp, timeoutMs: number, what: string) {
  return new Promise<RegExpMatchArray>((resolve, reject) => {
    let output = "";
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(pattern);
      if (match) {
        cleanup();
        resolve(match);
      }
    };
    const onExit = (code: number | null) => {
      cleanup();
      reject(
        new TunnelError(
          `${what} exited (code ${code}):\n${output.trim().split("\n").slice(-5).join("\n")}`,
        ),
      );
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new TunnelError(`${what} did not become ready within ${timeoutMs / 1000}s`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onData);
      child.off("exit", onExit);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", onExit);
  });
}

/**
 * Cloudflare quick tunnel: a random https://*.trycloudflare.com URL, no account or login needed.
 * Cloudflare offers these for testing and they are rate limited, which is fine for one scanner.
 */
export async function startCloudflareTunnel(port: number): Promise<Tunnel> {
  const bin = await findExecutable("cloudflared");
  if (!bin) {
    throw new TunnelError(
      "cloudflared is not installed.\n" +
        "  macOS:   brew install cloudflared\n" +
        "  Windows: winget install --id Cloudflare.cloudflared\n" +
        "  Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
    );
  }
  const child = spawn(bin, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    // Collect output from the start: the URL is printed before the connection is registered.
    let output = "";
    const collect = (chunk: Buffer) => {
      output += chunk.toString();
    };
    child.stderr?.on("data", collect);
    child.stdout?.on("data", collect);
    // Only probe the hostname once the edge has registered the tunnel. Probing earlier can make
    // the OS resolver cache "no such host" for minutes (negative DNS caching).
    await waitForOutput(child, /Registered tunnel connection/, 30_000, "cloudflared");
    child.stderr?.off("data", collect);
    child.stdout?.off("data", collect);
    const url = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
    if (!url) throw new TunnelError("cloudflared connected but did not print a tunnel URL.");
    const reachable = await waitUntilReachable(url, 30_000, publicLookup);
    return {
      url,
      label: "Cloudflare quick tunnel",
      warning: reachable
        ? undefined
        : "Could not verify the tunnel from this computer yet; it may take a few seconds.",
      close: () => stop(child),
    };
  } catch (error) {
    await stop(child);
    throw error;
  }
}

interface TailscaleStatus {
  BackendState?: string;
  Self?: { DNSName?: string };
  CertDomains?: string[] | null;
}

/**
 * `tailscale serve` in the foreground: HTTPS with a real certificate at
 * https://<machine>.<tailnet>.ts.net, reachable only from your own devices. Stops when we exit.
 */
export async function startTailscaleServe(port: number, httpsPort = 443): Promise<Tunnel> {
  const bin = await findExecutable("tailscale", [
    "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
  ]);
  if (!bin) {
    throw new TunnelError("Tailscale is not installed. Get it at https://tailscale.com/download");
  }
  const { stdout, code } = await run(bin, ["status", "--json"]);
  let status: TailscaleStatus = {};
  try {
    status = JSON.parse(stdout);
  } catch {
    // handled below
  }
  if (code !== 0 || status.BackendState !== "Running") {
    throw new TunnelError(
      "Tailscale is not connected. Run `tailscale up` (or open the app) first.",
    );
  }
  const dnsName = status.Self?.DNSName?.replace(/\.$/, "");
  if (!dnsName || !status.CertDomains?.length) {
    throw new TunnelError(
      "HTTPS certificates are not enabled for your tailnet.\n" +
        "  Enable MagicDNS and HTTPS at https://login.tailscale.com/admin/dns, then try again.",
    );
  }

  const child = spawn(bin, ["serve", `--https=${httpsPort}`, `http://127.0.0.1:${port}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const url = httpsPort === 443 ? `https://${dnsName}` : `https://${dnsName}:${httpsPort}`;
  try {
    await waitForOutput(
      child,
      /Available within your tailnet|https:\/\//i,
      15_000,
      "tailscale serve",
    );
    // The first request may wait for the certificate to be issued.
    const reachable = await waitUntilReachable(url, 60_000);
    return {
      url,
      label: "Tailscale (only your devices)",
      warning: reachable ? undefined : `Could not reach ${url} from this computer yet.`,
      close: () => stop(child),
    };
  } catch (error) {
    await stop(child);
    throw error;
  }
}

/** First non-internal IPv4 address, for plain LAN mode. */
export function lanAddress(): string {
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}
