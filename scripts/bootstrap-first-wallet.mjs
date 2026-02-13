import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const LOG_PREFIX = "[openclaw-iota-wallet postinstall]";
const GITHUB_RELEASES_API = "https://api.github.com/repos/iotaledger/iota/releases";
const DEFAULT_IOTA_CLI_VERSION = "latest";
let iotaCliPath = process.env.IOTA_CLI_PATH?.trim() || "iota";
const BOOTSTRAP_FLAG = (process.env.IOTA_WALLET_BOOTSTRAP ?? "").trim().toLowerCase();
const BOOTSTRAP_ENABLED = !new Set(["0", "false", "off", "no"]).has(BOOTSTRAP_FLAG);
const AUTO_INSTALL_CLI_FLAG = (process.env.IOTA_WALLET_AUTO_INSTALL_CLI ?? "1").trim().toLowerCase();
const AUTO_INSTALL_CLI_ENABLED = !new Set(["0", "false", "off", "no"]).has(AUTO_INSTALL_CLI_FLAG);
const IOTA_CLI_VERSION_REQUEST = (process.env.IOTA_CLI_VERSION ?? DEFAULT_IOTA_CLI_VERSION).trim();
const IOTA_CLI_INSTALL_DIR = (process.env.IOTA_CLI_INSTALL_DIR ?? "").trim() || `${homedir()}/.local/bin`;

function info(message) {
  console.log(`${LOG_PREFIX} ${message}`);
}

function warn(message) {
  console.warn(`${LOG_PREFIX} ${message}`);
}

function normalizeReleaseTag(versionOrTag) {
  const value = (versionOrTag ?? "").trim();
  if (!value || value.toLowerCase() === "latest") {
    return "latest";
  }
  return value.startsWith("v") ? value : `v${value}`;
}

function detectReleasePlatform() {
  switch (process.platform) {
    case "linux":
      return "linux";
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    default:
      return undefined;
  }
}

function detectReleaseArch() {
  switch (process.arch) {
    case "x64":
      return "x86_64";
    case "arm64":
      return "arm64";
    default:
      return undefined;
  }
}

function parseJsonFromHttp(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "openclaw-iota-wallet-postinstall",
    },
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`http_${response.status}: ${body.slice(0, 300)}`);
  }

  const parsed = parseJsonFromHttp(body);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("json_parse_failed");
  }

  return parsed;
}

async function downloadFile(url, targetPath) {
  const response = await fetch(url, {
    headers: { "User-Agent": "openclaw-iota-wallet-postinstall" },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`download_failed_${response.status}: ${body.slice(0, 300)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  writeFileSync(targetPath, Buffer.from(arrayBuffer));
}

async function sha256File(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex").toLowerCase()));
    stream.on("error", reject);
  });
}

function checksumFromManifest(content, assetName) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([a-fA-F0-9]{64})\s+(.+)$/);
    if (!match) continue;
    const [, hash, fileName] = match;
    if (fileName.trim() === assetName) {
      return hash.toLowerCase();
    }
  }
  return undefined;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    input: options.input,
    timeout: options.timeoutMs ?? 15000,
    maxBuffer: 16 * 1024 * 1024,
  });

  return {
    ok: !result.error && result.status === 0,
    error: result.error ? String(result.error) : result.status === 0 ? undefined : `exit_${String(result.status)}`,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

async function installIotaCli() {
  const platform = detectReleasePlatform();
  const arch = detectReleaseArch();
  if (!platform || !arch) {
    warn(`Unsupported platform/arch for auto-install: ${process.platform}/${process.arch}`);
    return undefined;
  }

  const requestedTag = normalizeReleaseTag(IOTA_CLI_VERSION_REQUEST);
  const releaseUrl =
    requestedTag === "latest"
      ? `${GITHUB_RELEASES_API}/latest`
      : `${GITHUB_RELEASES_API}/tags/${encodeURIComponent(requestedTag)}`;

  const release = await fetchJson(releaseUrl);
  const releaseTag = typeof release.tag_name === "string" && release.tag_name.trim() ? release.tag_name.trim() : requestedTag;
  if (!releaseTag || releaseTag === "latest") {
    throw new Error("invalid_release_tag");
  }

  const assets = Array.isArray(release.assets) ? release.assets : [];
  const assetName = `iota-${releaseTag}-${platform}-${arch}.tgz`;
  const cliAsset = assets.find(
    (asset) =>
      asset &&
      typeof asset === "object" &&
      asset.name === assetName &&
      typeof asset.browser_download_url === "string",
  );
  const checksumAsset = assets.find(
    (asset) =>
      asset &&
      typeof asset === "object" &&
      asset.name === "checksum.txt" &&
      typeof asset.browser_download_url === "string",
  );

  if (!cliAsset) {
    throw new Error(`asset_not_found:${assetName}`);
  }
  if (!checksumAsset) {
    throw new Error("asset_not_found:checksum.txt");
  }

  const tmpRoot = mkdtempSync(join(tmpdir(), "iota-cli-install-"));
  try {
    const archivePath = join(tmpRoot, assetName);
    const checksumPath = join(tmpRoot, "checksum.txt");
    const extractDir = join(tmpRoot, "extract");
    mkdirSync(extractDir, { recursive: true });

    await downloadFile(cliAsset.browser_download_url, archivePath);
    await downloadFile(checksumAsset.browser_download_url, checksumPath);

    const checksumManifest = readFileSync(checksumPath, "utf8");
    const expected = checksumFromManifest(checksumManifest, assetName);
    if (!expected) {
      throw new Error("checksum_entry_missing");
    }
    const actual = await sha256File(archivePath);
    if (actual !== expected) {
      throw new Error("checksum_mismatch");
    }

    const tar = runCommand("tar", ["-xzf", archivePath, "-C", extractDir], { timeoutMs: 120000 });
    if (!tar.ok) {
      throw new Error(`tar_extract_failed:${tar.stderr.slice(0, 200)}`);
    }

    const binaryName = process.platform === "win32" ? "iota.exe" : "iota";
    const extractedBinaryPath = join(extractDir, binaryName);
    if (!existsSync(extractedBinaryPath)) {
      throw new Error("binary_missing_after_extract");
    }

    mkdirSync(IOTA_CLI_INSTALL_DIR, { recursive: true });
    const destinationPath = join(IOTA_CLI_INSTALL_DIR, binaryName);
    copyFileSync(extractedBinaryPath, destinationPath);
    if (process.platform !== "win32") {
      chmodSync(destinationPath, 0o755);
    }

    return {
      path: destinationPath,
      releaseTag,
    };
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

async function ensureIotaCliAvailable() {
  const existing = runCommand(iotaCliPath, ["--version"], { timeoutMs: 15000 });
  if (existing.ok) {
    const version = existing.stdout.trim();
    if (version) {
      info(`Detected IOTA CLI: ${version}`);
    }
    return true;
  }

  if (!AUTO_INSTALL_CLI_ENABLED) {
    warn(`IOTA CLI not found at "${iotaCliPath}". Auto-install disabled by IOTA_WALLET_AUTO_INSTALL_CLI.`);
    return false;
  }

  info("IOTA CLI not found, attempting automatic install...");
  try {
    const installed = await installIotaCli();
    if (!installed?.path) {
      warn("IOTA CLI auto-install did not produce a binary path.");
      return false;
    }

    iotaCliPath = installed.path;
    const verify = runCommand(iotaCliPath, ["--version"], { timeoutMs: 15000 });
    if (!verify.ok) {
      warn(`IOTA CLI installed at "${iotaCliPath}" but version check failed.`);
      return false;
    }

    info(`Installed IOTA CLI ${installed.releaseTag} to ${iotaCliPath}`);

    const pathEntries = (process.env.PATH ?? "").split(delimiter);
    if (!pathEntries.includes(IOTA_CLI_INSTALL_DIR)) {
      warn(
        `Install dir "${IOTA_CLI_INSTALL_DIR}" is not on PATH. Set plugin config cliPath="${iotaCliPath}" if needed.`,
      );
    }
    return true;
  } catch (error) {
    warn(`IOTA CLI auto-install failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function parseJsonFromMixedOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return undefined;
  }

  const tryParse = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  };

  const direct = tryParse(trimmed);
  if (direct !== undefined) {
    return direct;
  }

  const suffixMatch = trimmed.match(/({[\s\S]*}|\[[\s\S]*]|"[^"]*")\s*$/);
  if (suffixMatch?.[1]) {
    return tryParse(suffixMatch[1]);
  }

  return undefined;
}

function runIota(args, options = {}) {
  const result = spawnSync(iotaCliPath, args, {
    encoding: "utf8",
    input: options.input,
    timeout: options.timeoutMs ?? 15000,
    maxBuffer: 4 * 1024 * 1024,
  });

  const stdout = String(result.stdout ?? "");
  const stderr = String(result.stderr ?? "");

  if (result.error) {
    return {
      ok: false,
      error: String(result.error),
      stdout,
      stderr,
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      error: `exit_${String(result.status)}`,
      stdout,
      stderr,
    };
  }

  const expectJson = options.expectJson !== false;
  const json = expectJson ? parseJsonFromMixedOutput(stdout) : undefined;

  if (expectJson && json === undefined) {
    return {
      ok: false,
      error: "json_parse_failed",
      stdout,
      stderr,
    };
  }

  return { ok: true, json, stdout, stderr };
}

function asAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : undefined;
}

function extractAddressFromEntry(value) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const entry = value;
  return asAddress(entry.address) ?? asAddress(entry.iotaAddress) ?? asAddress(entry.iota_address);
}

function getKeyEntries() {
  const listed = runIota(["keytool", "list", "--json"]);
  if (!listed.ok || !Array.isArray(listed.json)) {
    return [];
  }
  return listed.json;
}

function getActiveAddress() {
  const active = runIota(["client", "active-address", "--json"]);
  if (!active.ok) {
    return undefined;
  }
  return asAddress(active.json);
}

function setMainnetAndAddress(address) {
  const args = ["client", "switch", "--env", "mainnet"];
  if (address) {
    args.push("--address", address);
  }
  runIota([...args, "--json"], { expectJson: true });
}

async function bootstrapWallet() {
  if (!BOOTSTRAP_ENABLED) {
    info("Skipped bootstrap because IOTA_WALLET_BOOTSTRAP is disabled.");
    return;
  }

  const cliReady = await ensureIotaCliAvailable();
  if (!cliReady) {
    warn(`IOTA CLI not available at "${iotaCliPath}". Wallet bootstrap skipped.`);
    return;
  }

  // Initialize CLI state non-interactively when first-run prompts appear.
  runIota(["client", "envs", "--json"], {
    expectJson: false,
    input: "mainnet\n0\n",
    timeoutMs: 30000,
  });

  setMainnetAndAddress(undefined);

  let entries = getKeyEntries();
  if (entries.length > 0) {
    const activeAddress = getActiveAddress();
    const firstAddress = extractAddressFromEntry(entries[0]);
    setMainnetAndAddress(activeAddress ?? firstAddress);
    info(`Wallet already initialized (${entries.length} address(es)).`);
    return;
  }

  const alias = `openclaw-mainnet-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const created = runIota(
    [
      "client",
      "new-address",
      "--key-scheme",
      "ed25519",
      "--word-length",
      "word24",
      "--alias",
      alias,
      "--json",
    ],
    { expectJson: true, timeoutMs: 30000 },
  );

  if (!created.ok) {
    warn("Failed to auto-create first wallet address. Run `iota client new-address --json` manually.");
    return;
  }

  const createdAddress = extractAddressFromEntry(created.json);
  entries = getKeyEntries();
  const fallbackAddress = entries.length > 0 ? extractAddressFromEntry(entries[0]) : undefined;
  const address = createdAddress ?? fallbackAddress ?? getActiveAddress();
  setMainnetAndAddress(address);

  if (address) {
    info(`Created first wallet address: ${address}`);
    return;
  }

  warn("Wallet address was created but could not be resolved from CLI output.");
}

try {
  await bootstrapWallet();
} catch (error) {
  warn(`Unexpected bootstrap error: ${error instanceof Error ? error.message : String(error)}`);
}
