import type { IotaWalletConfig, IotaNetwork, SignerMode } from "./types.js";

export const DEFAULT_CONFIG: IotaWalletConfig = {
  enabled: true,
  cliPath: "iota",
  defaultNetwork: "mainnet",
  requireApproval: true,
  approvalTtlSeconds: 1800,
  maxTransferNanos: 1_000_000_000n,
  recipientAllowlist: new Set<string>(),
  commandTimeoutMs: 30_000,
  signer: {
    mode: "local-keystore",
  },
};

const NETWORKS = new Set<IotaNetwork>(["mainnet", "testnet", "devnet", "localnet", "custom"]);
const SIGNER_MODES = new Set<SignerMode>(["local-keystore", "external-signature", "kms"]);

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNanos(value: unknown, fallback: bigint): bigint {
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  return fallback;
}

function asOptionalUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const trimmed = value.trim();
  try {
    // Only normalize and validate syntax here. Network use is enforced elsewhere.
    return new URL(trimmed).toString();
  } catch {
    return undefined;
  }
}

export function resolveIotaWalletConfig(raw: unknown): IotaWalletConfig {
  const cfg = asRecord(raw);
  const signer = asRecord(cfg.signer);

  const defaultNetworkRaw = asString(cfg.defaultNetwork, DEFAULT_CONFIG.defaultNetwork);
  const defaultNetwork = NETWORKS.has(defaultNetworkRaw as IotaNetwork)
    ? (defaultNetworkRaw as IotaNetwork)
    : DEFAULT_CONFIG.defaultNetwork;

  const signerModeRaw = asString(signer.mode, DEFAULT_CONFIG.signer.mode);
  const signerMode = SIGNER_MODES.has(signerModeRaw as SignerMode)
    ? (signerModeRaw as SignerMode)
    : DEFAULT_CONFIG.signer.mode;

  const allowlistInput = Array.isArray(cfg.recipientAllowlist) ? cfg.recipientAllowlist : [];
  const recipientAllowlist = new Set<string>();
  for (const entry of allowlistInput) {
    if (typeof entry === "string" && /^0x[a-fA-F0-9]{64}$/i.test(entry)) {
      recipientAllowlist.add(entry.toLowerCase());
    }
  }

  const customRpcUrl = asOptionalUrl(cfg.customRpcUrl);

  return {
    enabled: asBoolean(cfg.enabled, DEFAULT_CONFIG.enabled),
    cliPath: asString(cfg.cliPath, DEFAULT_CONFIG.cliPath),
    defaultNetwork,
    customRpcUrl,
    requireApproval: asBoolean(cfg.requireApproval, DEFAULT_CONFIG.requireApproval),
    approvalTtlSeconds: Math.max(
      60,
      Math.min(86400, Math.floor(asNumber(cfg.approvalTtlSeconds, DEFAULT_CONFIG.approvalTtlSeconds))),
    ),
    maxTransferNanos: asNanos(cfg.maxTransferNanos, DEFAULT_CONFIG.maxTransferNanos),
    recipientAllowlist,
    commandTimeoutMs: Math.max(
      1000,
      Math.min(120000, Math.floor(asNumber(cfg.commandTimeoutMs, DEFAULT_CONFIG.commandTimeoutMs))),
    ),
    signer: {
      mode: signerMode,
      keystorePath: typeof signer.keystorePath === "string" ? signer.keystorePath.trim() : undefined,
      keyId: typeof signer.keyId === "string" ? signer.keyId.trim() : undefined,
      base64PublicKey:
        typeof signer.base64PublicKey === "string" ? signer.base64PublicKey.trim() : undefined,
      intent: typeof signer.intent === "string" ? signer.intent.trim() : undefined,
    },
  };
}
