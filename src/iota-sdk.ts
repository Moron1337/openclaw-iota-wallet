import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { IotaClient, getFullnodeUrl } from "@iota/iota-sdk/client";
import { decodeIotaPrivateKey, type Signer } from "@iota/iota-sdk/cryptography";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { Secp256k1Keypair } from "@iota/iota-sdk/keypairs/secp256k1";
import { Secp256r1Keypair } from "@iota/iota-sdk/keypairs/secp256r1";
import { Transaction } from "@iota/iota-sdk/transactions";
import { verifyTransactionSignature } from "@iota/iota-sdk/verify";
import { IotaPluginError } from "./errors.js";
import type { IotaWalletConfig } from "./types.js";

export const IOTA_COIN_TYPE = "0x2::iota::IOTA";

type KeystoreDocument = {
  version: number;
  keys: Array<Record<string, unknown>>;
};

export type KeystoreEntry = {
  address: string;
  alias: string;
  secretKey: string;
};

type PrepareTransferInput = {
  recipient: string;
  amountNanos: bigint;
  inputCoins: string[];
  gasBudget?: number;
};

type ExecuteTransferInput = {
  txBytes: string;
  signerAddress?: string;
  signature?: string;
};

export function defaultKeystorePath(homeDir = os.homedir()): string {
  return path.join(homeDir, ".iota", "iota_config", "iota.keystore");
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAddress(value: unknown): string {
  const normalized = normalizeString(value).toLowerCase();
  return /^0x[a-f0-9]{64}$/i.test(normalized) ? normalized : "";
}

async function signerFromSecretKey(secretKey: string): Promise<Signer> {
  const decoded = decodeIotaPrivateKey(secretKey);
  if (decoded.schema === "ED25519") {
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  if (decoded.schema === "Secp256k1") {
    return Secp256k1Keypair.fromSecretKey(secretKey);
  }
  if (decoded.schema === "Secp256r1") {
    return Secp256r1Keypair.fromSecretKey(secretKey);
  }
  throw new IotaPluginError("invalid_input", `unsupported signer schema: ${decoded.schema}`);
}

async function loadKeystoreDocument(keystorePath: string): Promise<KeystoreDocument> {
  try {
    const raw = await fs.readFile(keystorePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return {
        version: 1,
        keys: parsed.map((entry) => ({ key: { type: "key_pair", value: entry } })),
      };
    }

    return {
      version: typeof (parsed as KeystoreDocument)?.version === "number" ? (parsed as KeystoreDocument).version : 2,
      keys: Array.isArray((parsed as KeystoreDocument)?.keys) ? (parsed as KeystoreDocument).keys : [],
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { version: 2, keys: [] };
    }
    throw error;
  }
}

async function saveKeystoreDocument(keystorePath: string, document: KeystoreDocument): Promise<string> {
  const target = path.resolve(keystorePath);
  const directory = path.dirname(target);
  const tempFile = `${target}.${process.pid}.${Date.now()}.tmp`;

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    tempFile,
    JSON.stringify(
      {
        version: typeof document.version === "number" ? document.version : 2,
        keys: Array.isArray(document.keys) ? document.keys : [],
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  await fs.chmod(tempFile, 0o600);
  await fs.rename(tempFile, target);
  return target;
}

async function normalizeKeystoreEntry(entry: Record<string, unknown>): Promise<KeystoreEntry | null> {
  const secretKey =
    entry.key && typeof entry.key === "object"
      ? normalizeString((entry.key as Record<string, unknown>).value)
      : normalizeString(entry.secretKey);

  if (!secretKey) {
    return null;
  }

  const signer = await signerFromSecretKey(secretKey);
  const derivedAddress = signer.toIotaAddress().toLowerCase();
  const address = normalizeAddress(entry.address) || derivedAddress;
  if (!address) {
    return null;
  }

  return {
    address,
    alias: normalizeString(entry.alias),
    secretKey,
  };
}

export async function loadKeystoreEntries(keystorePath = defaultKeystorePath()): Promise<KeystoreEntry[]> {
  const document = await loadKeystoreDocument(keystorePath);
  const entries = await Promise.all(document.keys.map((entry) => normalizeKeystoreEntry(entry)));
  return entries.filter((entry): entry is KeystoreEntry => entry !== null);
}

export async function appendEd25519KeystoreEntry(
  keystorePath = defaultKeystorePath(),
  alias = "",
): Promise<{ keystorePath: string; address: string; alias: string | null }> {
  const normalizedAlias = normalizeString(alias);
  const document = await loadKeystoreDocument(keystorePath);

  if (
    normalizedAlias &&
    document.keys.some((entry) => normalizeString((entry as Record<string, unknown>).alias).toLowerCase() === normalizedAlias.toLowerCase())
  ) {
    throw new IotaPluginError("invalid_input", "keystore alias already exists");
  }

  const signer = Ed25519Keypair.generate();
  const address = signer.toIotaAddress().toLowerCase();
  document.keys.push({
    alias: normalizedAlias,
    address,
    key: {
      type: "key_pair",
      value: signer.getSecretKey(),
    },
  });

  const savedPath = await saveKeystoreDocument(keystorePath, document);
  return {
    keystorePath: savedPath,
    address,
    alias: normalizedAlias || null,
  };
}

export function resolveRpcUrl(cfg: IotaWalletConfig): string {
  if (cfg.defaultNetwork === "custom") {
    if (!cfg.customRpcUrl) {
      throw new IotaPluginError("invalid_input", "customRpcUrl is required when defaultNetwork is custom");
    }
    return cfg.customRpcUrl;
  }

  return getFullnodeUrl(cfg.defaultNetwork);
}

export function createIotaClient(cfg: IotaWalletConfig): IotaClient {
  return new IotaClient({ url: resolveRpcUrl(cfg) });
}

export async function resolveDefaultAddress(cfg: IotaWalletConfig): Promise<string> {
  if (cfg.signer.mode !== "local-keystore") {
    throw new IotaPluginError("invalid_input", "address is required when signer.mode is not local-keystore");
  }

  const entries = await loadKeystoreEntries(cfg.signer.keystorePath ?? defaultKeystorePath());
  if (entries.length === 0) {
    throw new IotaPluginError("invalid_input", "no local keystore entries found");
  }
  if (entries.length > 1) {
    throw new IotaPluginError(
      "invalid_input",
      "address is required because the local keystore contains multiple entries",
    );
  }

  return entries[0].address;
}

export async function getActiveEnvViaSdk(cfg: IotaWalletConfig): Promise<Record<string, unknown>> {
  const info: Record<string, unknown> = {
    activeEnv: cfg.defaultNetwork,
    rpcUrl: resolveRpcUrl(cfg),
    source: "sdk-config",
  };

  if (cfg.signer.mode === "local-keystore") {
    const entries = await loadKeystoreEntries(cfg.signer.keystorePath ?? defaultKeystorePath());
    info.keystorePath = cfg.signer.keystorePath ?? defaultKeystorePath();
    info.addressCount = entries.length;
    if (entries.length === 1) {
      info.activeAddress = entries[0].address;
    }
  }

  return info;
}

export async function getBalanceViaSdk(
  cfg: IotaWalletConfig,
  input: { address?: string; coinType?: string; withCoins?: boolean },
): Promise<Record<string, unknown>> {
  const owner = input.address ? normalizeAddress(input.address) : await resolveDefaultAddress(cfg);
  const client = createIotaClient(cfg);
  const rpcUrl = resolveRpcUrl(cfg);

  const result: Record<string, unknown> = {
    owner,
    network: cfg.defaultNetwork,
    rpcUrl,
  };

  if (input.coinType) {
    result.balance = await client.getBalance({ owner, coinType: input.coinType });
    if (input.withCoins) {
      result.coins = await client.getCoins({ owner, coinType: input.coinType });
    }
    return result;
  }

  result.balances = await client.getAllBalances({ owner });
  if (input.withCoins) {
    result.coins = await client.getAllCoins({ owner });
  }
  return result;
}

export async function getGasViaSdk(
  cfg: IotaWalletConfig,
  input: { address?: string },
): Promise<Record<string, unknown>> {
  const owner = input.address ? normalizeAddress(input.address) : await resolveDefaultAddress(cfg);
  const client = createIotaClient(cfg);
  const rpcUrl = resolveRpcUrl(cfg);
  const coins = await client.getCoins({ owner, coinType: IOTA_COIN_TYPE });
  return {
    owner,
    network: cfg.defaultNetwork,
    rpcUrl,
    coinType: IOTA_COIN_TYPE,
    gasCoins: coins,
  };
}

async function resolveGasPaymentRef(client: IotaClient, coinObjectId: string): Promise<{ objectId: string; version: string; digest: string }> {
  const response = await client.getObject({ id: coinObjectId });
  if (!response.data?.objectId || !response.data.version || !response.data.digest) {
    throw new IotaPluginError("invalid_input", "could not resolve gas payment object reference", {
      coinObjectId,
      response,
    });
  }

  return {
    objectId: response.data.objectId,
    version: response.data.version,
    digest: response.data.digest,
  };
}

export async function prepareTransferViaSdk(
  cfg: IotaWalletConfig,
  input: PrepareTransferInput,
): Promise<{ txBytes: string; decodedTx: unknown; signerAddress: string; rpcUrl: string }> {
  const signerAddress = await resolveDefaultAddress(cfg);
  const client = createIotaClient(cfg);
  const tx = new Transaction();

  tx.setSender(signerAddress);
  if (input.gasBudget !== undefined) {
    tx.setGasBudget(input.gasBudget);
  }

  const primaryGasRef = await resolveGasPaymentRef(client, input.inputCoins[0]);
  tx.setGasPayment([primaryGasRef]);

  if (input.inputCoins.length > 1) {
    tx.mergeCoins(
      tx.gas,
      input.inputCoins.slice(1).map((coinId) => tx.object(coinId)),
    );
  }

  const [paymentCoin] = tx.splitCoins(tx.gas, [input.amountNanos]);
  tx.transferObjects([paymentCoin], input.recipient);

  const bytes = await tx.build({ client });
  return {
    txBytes: Buffer.from(bytes).toString("base64"),
    decodedTx: tx.getData(),
    signerAddress,
    rpcUrl: resolveRpcUrl(cfg),
  };
}

export async function dryRunTransferViaSdk(
  cfg: IotaWalletConfig,
  txBytes: string,
): Promise<unknown> {
  const client = createIotaClient(cfg);
  return await client.dryRunTransactionBlock({
    transactionBlock: Buffer.from(txBytes, "base64"),
  });
}

async function resolveLocalSigner(
  cfg: IotaWalletConfig,
  requestedAddress?: string,
): Promise<{ signer: Signer; address: string }> {
  const entries = await loadKeystoreEntries(cfg.signer.keystorePath ?? defaultKeystorePath());
  if (entries.length === 0) {
    throw new IotaPluginError("invalid_input", "no local keystore entries found");
  }

  const requested = normalizeAddress(requestedAddress);
  const selected =
    requested
      ? entries.find((entry) => entry.address === requested)
      : entries.length === 1
        ? entries[0]
        : null;

  if (!selected) {
    throw new IotaPluginError(
      "invalid_input",
      requested
        ? "requested signerAddress was not found in the local keystore"
        : "signerAddress is required because the local keystore contains multiple entries",
    );
  }

  return {
    signer: await signerFromSecretKey(selected.secretKey),
    address: selected.address,
  };
}

async function verifySignatureMatchesAddress(
  txBytes: Uint8Array,
  signature: string,
  expectedAddress?: string,
): Promise<{ verified: true; signerAddress: string }> {
  const publicKey = await verifyTransactionSignature(txBytes, signature);
  const signerAddress = publicKey.toIotaAddress().toLowerCase();
  const expected = normalizeAddress(expectedAddress);

  if (expected && signerAddress !== expected) {
    throw new IotaPluginError("policy_denied", "signature does not match signerAddress", {
      expectedSignerAddress: expected,
      actualSignerAddress: signerAddress,
    });
  }

  return { verified: true, signerAddress };
}

export async function executeTransferViaSdk(
  cfg: IotaWalletConfig,
  input: ExecuteTransferInput,
): Promise<{ result: unknown; verifyResult: { verified: true; signerAddress: string }; signature: string }> {
  const client = createIotaClient(cfg);
  const txBytes = Buffer.from(input.txBytes, "base64");

  if (typeof input.signature === "string" && input.signature.trim()) {
    const signature = input.signature.trim();
    const verifyResult = await verifySignatureMatchesAddress(txBytes, signature, input.signerAddress);
    const result = await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
    });
    return { result, verifyResult, signature };
  }

  if (cfg.signer.mode !== "local-keystore") {
    throw new IotaPluginError(
      "invalid_input",
      "a precomputed signature is required unless signer.mode is local-keystore",
    );
  }

  const { signer, address } = await resolveLocalSigner(cfg, input.signerAddress);
  const signed = await signer.signTransaction(txBytes);
  const verifyResult = await verifySignatureMatchesAddress(txBytes, signed.signature, address);
  const result = await client.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: signed.signature,
  });
  return {
    result,
    verifyResult,
    signature: signed.signature,
  };
}
