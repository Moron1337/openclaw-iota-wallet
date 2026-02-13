import { spawnSync } from "node:child_process";

const LOG_PREFIX = "[openclaw-iota-wallet postinstall]";
const IOTA_CLI_PATH = process.env.IOTA_CLI_PATH?.trim() || "iota";
const BOOTSTRAP_FLAG = (process.env.IOTA_WALLET_BOOTSTRAP ?? "").trim().toLowerCase();
const BOOTSTRAP_ENABLED = !new Set(["0", "false", "off", "no"]).has(BOOTSTRAP_FLAG);

function info(message) {
  console.log(`${LOG_PREFIX} ${message}`);
}

function warn(message) {
  console.warn(`${LOG_PREFIX} ${message}`);
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
  const result = spawnSync(IOTA_CLI_PATH, args, {
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

function bootstrapWallet() {
  if (!BOOTSTRAP_ENABLED) {
    info("Skipped bootstrap because IOTA_WALLET_BOOTSTRAP is disabled.");
    return;
  }

  const version = runIota(["--version"], { expectJson: false });
  if (!version.ok) {
    warn(`IOTA CLI not found at "${IOTA_CLI_PATH}". Wallet bootstrap skipped.`);
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
  bootstrapWallet();
} catch (error) {
  warn(`Unexpected bootstrap error: ${error instanceof Error ? error.message : String(error)}`);
}
