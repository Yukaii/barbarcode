// Compiles standalone barbarcode executables with Bun (runtime + CLI + phone page in one file).
//
//   node scripts/build-binaries.mjs           every release target
//   node scripts/build-binaries.mjs --host    only this machine's platform (for testing)
//
// Writes the executables to dist-bin/ and the release assets to dist-bin/release/:
// barbarcode-<os>-<arch>.gz (macOS, Linux), barbarcode-windows-<arch>.zip, and SHA256SUMS.
// Needs `bun`, and `zip` for the Windows archives. Run `pnpm build` first: the phone page is
// embedded from dist/web.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { arch, platform, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

// Release name -> Bun target. x64 uses the "baseline" runtime so CPUs without AVX2 work too.
const TARGETS = {
  "linux-x64": "bun-linux-x64-baseline",
  "linux-arm64": "bun-linux-arm64",
  "linux-x64-musl": "bun-linux-x64-musl-baseline",
  "linux-arm64-musl": "bun-linux-arm64-musl",
  "darwin-x64": "bun-darwin-x64",
  "darwin-arm64": "bun-darwin-arm64",
  "windows-x64": "bun-windows-x64-baseline",
  "windows-arm64": "bun-windows-arm64",
};

const cwd = new URL("..", import.meta.url);
const outDir = new URL("dist-bin/", cwd);
const releaseDir = new URL("release/", outDir);

if (!existsSync(new URL("dist/web/index.html", cwd))) {
  console.error("dist/web is missing. Run `pnpm build` from the repo root first.");
  process.exit(1);
}

const hostName = `${platform() === "win32" ? "windows" : platform()}-${arch()}`;
const names = process.argv.includes("--host") ? [hostName] : Object.keys(TARGETS);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });

function compile(name) {
  const target = TARGETS[name];
  if (!target) throw new Error(`No Bun target for ${name}`);
  const file = `barbarcode-${name}${name.startsWith("windows") ? ".exe" : ""}`;
  execFileSync(
    "bun",
    [
      "build",
      "src/cli.ts",
      "--compile",
      "--minify",
      `--target=${target}`,
      "--asset=dist/web",
      `--outfile=dist-bin/${file}`,
    ],
    { cwd, stdio: ["ignore", "ignore", "inherit"] },
  );
  if (name.startsWith("darwin") && platform() === "darwin") {
    // Bun's ad-hoc signature on a cross-compiled darwin-x64 binary doesn't verify, and macOS
    // refuses to run code with a broken signature. Signing again (ad hoc) fixes it.
    execFileSync("codesign", ["--force", "--sign", "-", fileURLToPath(new URL(file, outDir))], {
      stdio: ["ignore", "ignore", "inherit"],
    });
  }
  return file;
}

/** Compresses an executable into its release asset and returns the asset's file name. */
function archive(name, file) {
  const binary = new URL(file, outDir);
  if (name.startsWith("windows")) {
    // A .zip opens natively in Explorer; it holds a plain barbarcode.exe.
    const staging = mkdtempSync(join(tmpdir(), "barbarcode-"));
    copyFileSync(binary, join(staging, "barbarcode.exe"));
    const zip = `barbarcode-${name}.zip`;
    execFileSync("zip", [
      "-j",
      "-9",
      "-q",
      fileURLToPath(new URL(zip, releaseDir)),
      join(staging, "barbarcode.exe"),
    ]);
    rmSync(staging, { recursive: true });
    return zip;
  }
  const gz = `barbarcode-${name}.gz`;
  writeFileSync(new URL(gz, releaseDir), gzipSync(readFileSync(binary), { level: 9 }));
  return gz;
}

const sums = [];
for (const name of names) {
  const file = compile(name);
  const asset = archive(name, file);
  const hash = createHash("sha256")
    .update(readFileSync(new URL(asset, releaseDir)))
    .digest("hex");
  sums.push(`${hash}  ${asset}`);
  console.log(`built ${file} -> release/${asset}`);
}
writeFileSync(new URL("SHA256SUMS", releaseDir), `${sums.join("\n")}\n`);
