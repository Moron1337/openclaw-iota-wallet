import { Type } from "@sinclair/typebox";
import { randomUUID } from "node:crypto";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { DraftStore } from "../draft-store.js";
import { IotaPluginError, toToolErrorPayload } from "../errors.js";
import { buildClientArgsWithNetwork, execIotaCli, parseJsonFromStdout } from "../iota-cli.js";
import { toToolText } from "../tool-output.js";
import type { IotaWalletConfig, PreparedTransfer } from "../types.js";
import {
  assertIotaAddress,
  assertStringArray,
  parseOptionalPositiveInt,
  parsePositiveBigInt,
} from "../validation.js";

type ExecFn = typeof execIotaCli;

const defaultDraftStore = new DraftStore();

function extractUnsignedTxBytes(rawOutput: string): string {
  const trimmed = rawOutput.trim();
  if (!trimmed) {
    throw new IotaPluginError("cli_parse_error", "unsigned transaction output is empty");
  }

  // Raw base64 response
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed;
  }

  // JSON string / object response
  try {
    const parsed = parseJsonFromStdout(trimmed);
    if (typeof parsed === "string" && /^[A-Za-z0-9+/=]+$/.test(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      const rec = parsed as Record<string, unknown>;
      const candidates = [rec.txBytes, rec.tx_bytes, rec.unsignedTxBytes, rec.unsigned_tx_bytes];
      for (const candidate of candidates) {
        if (typeof candidate === "string" && /^[A-Za-z0-9+/=]+$/.test(candidate)) {
          return candidate;
        }
      }
    }
  } catch {
    // fall through to line scan
  }

  for (const line of trimmed.split("\n")) {
    const candidate = line.trim();
    if (/^[A-Za-z0-9+/=]{20,}$/.test(candidate)) {
      return candidate;
    }
  }

  throw new IotaPluginError("cli_parse_error", "could not extract unsigned tx bytes from CLI output", {
    sample: trimmed.slice(0, 500),
  });
}

function findSignature(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const directKeys = [
    "iotaSignature",
    "signature",
    "serializedSignature",
    "serialized_signature",
    "serializedSigBase64",
    "serialized_sig_base64",
  ];
  for (const key of directKeys) {
    const candidate = record[key];
    if (typeof candidate === "string" && /^[A-Za-z0-9+/=]+$/.test(candidate)) {
      return candidate;
    }
  }

  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") {
      const found = findSignature(nested);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

function isVerificationSuccessful(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  const result = record.result;

  if (result === undefined || result === null) {
    return false;
  }

  if (typeof result === "string") {
    return /^ok$/i.test(result.trim());
  }

  if (typeof result === "object") {
    const inner = result as Record<string, unknown>;
    if ("Err" in inner || "err" in inner || "error" in inner) {
      return false;
    }
    if ("Ok" in inner || "ok" in inner || "success" in inner) {
      return true;
    }
  }

  return false;
}

function getDraftOrThrow(store: DraftStore, draftId: string): PreparedTransfer {
  const draft = store.get(draftId);
  if (!draft) {
    throw new IotaPluginError("draft_not_found", "draft not found");
  }

  if (Date.now() > draft.expiresAt) {
    store.delete(draftId);
    throw new IotaPluginError("draft_expired", "draft expired");
  }

  return draft;
}

export function registerTxTools(
  api: OpenClawPluginApi,
  cfg: IotaWalletConfig,
  deps?: { exec?: ExecFn; store?: DraftStore },
): void {
  const exec = deps?.exec ?? execIotaCli;
  const store = deps?.store ?? defaultDraftStore;

  api.registerTool(
    {
      name: "iota_prepare_transfer",
      description:
        "Prepare a transfer by building unsigned tx bytes and decoding preview. Requires inputCoins.",
      parameters: Type.Object({
        recipient: Type.String(),
        amountNanos: Type.String({ pattern: "^[0-9]+$" }),
        inputCoins: Type.Array(Type.String(), { minItems: 1 }),
        gasBudget: Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        try {
          store.pruneExpired(Date.now());

          const recipient = assertIotaAddress(params.recipient, "recipient");
          const amountNanos = parsePositiveBigInt(params.amountNanos, "amountNanos");
          const inputCoins = assertStringArray(params.inputCoins, "inputCoins").map((entry) =>
            assertIotaAddress(entry, "inputCoins[]"),
          );
          const gasBudget = parseOptionalPositiveInt(params.gasBudget, "gasBudget");

          if (amountNanos > cfg.maxTransferNanos) {
            throw new IotaPluginError("policy_denied", "amount exceeds maxTransferNanos policy");
          }

          if (cfg.recipientAllowlist.size > 0 && !cfg.recipientAllowlist.has(recipient)) {
            throw new IotaPluginError("policy_denied", "recipient is not in recipientAllowlist");
          }

          const prepareArgs = buildClientArgsWithNetwork(cfg, [
            "client",
            "pay-iota",
            "--recipients",
            recipient,
            "--input-coins",
            ...inputCoins,
            "--amounts",
            amountNanos.toString(),
            "--serialize-unsigned-transaction",
          ]);

          if (gasBudget !== undefined) {
            prepareArgs.push("--gas-budget", String(gasBudget));
          }

          const unsignedOutput = await exec(cfg, prepareArgs, { expectJson: false });
          const txBytes = extractUnsignedTxBytes(String(unsignedOutput));

          const decodedTx = await exec(
            cfg,
            ["keytool", "decode-or-verify-tx", "--tx-bytes", txBytes],
            { expectJson: true },
          );

          const now = Date.now();
          const draft: PreparedTransfer = {
            id: randomUUID(),
            recipient,
            amountNanos,
            createdAt: now,
            expiresAt: now + cfg.approvalTtlSeconds * 1000,
            approved: !cfg.requireApproval,
            txBytes,
            decodedTx,
          };

          store.set(draft);

          return toToolText({
            ok: true,
            status: "prepared",
            draft,
            preview: decodedTx,
          });
        } catch (err) {
          return toToolText(toToolErrorPayload(err));
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "iota_approve_transfer",
      description: "Approve or reject a prepared transfer draft.",
      parameters: Type.Object({
        draftId: Type.String(),
        approve: Type.Boolean(),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        try {
          const draftId = typeof params.draftId === "string" ? params.draftId.trim() : "";
          const draft = getDraftOrThrow(store, draftId);

          if (params.approve === true) {
            draft.approved = true;
            store.set(draft);
            return toToolText({ ok: true, status: "approved", draft });
          }

          store.delete(draftId);
          return toToolText({ ok: true, status: "rejected", draftId });
        } catch (err) {
          return toToolText(toToolErrorPayload(err));
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "iota_dry_run_transfer",
      description: "Dry-run a prepared draft using iota client serialized-tx --dry-run.",
      parameters: Type.Object({
        draftId: Type.String(),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        try {
          const draftId = typeof params.draftId === "string" ? params.draftId.trim() : "";
          const draft = getDraftOrThrow(store, draftId);
          if (!draft.txBytes) {
            throw new IotaPluginError("invalid_input", "draft does not contain txBytes");
          }

          const args = buildClientArgsWithNetwork(cfg, [
            "client",
            "serialized-tx",
            draft.txBytes,
            "--dry-run",
          ]);
          const result = await exec(cfg, args, { expectJson: true });
          return toToolText({ ok: true, status: "dry_run", result });
        } catch (err) {
          return toToolText(toToolErrorPayload(err));
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "iota_execute_transfer",
      description: "Execute an approved transfer draft via sign + execute-signed-tx.",
      parameters: Type.Object({
        draftId: Type.String(),
        signerAddress: Type.Optional(Type.String()),
        signature: Type.Optional(Type.String()),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        try {
          const draftId = typeof params.draftId === "string" ? params.draftId.trim() : "";
          const draft = getDraftOrThrow(store, draftId);

          if (!draft.txBytes) {
            throw new IotaPluginError("invalid_input", "draft does not contain txBytes");
          }

          if (cfg.requireApproval && !draft.approved) {
            throw new IotaPluginError("approval_required", "draft is not approved");
          }

          let signature: string | undefined;

          if (typeof params.signature === "string" && params.signature.trim()) {
            signature = params.signature.trim();
          } else if (cfg.signer.mode === "external-signature") {
            throw new IotaPluginError("invalid_input", "signature is required in external-signature mode");
          } else if (cfg.signer.mode === "kms") {
            const keyId = cfg.signer.keyId?.trim();
            const base64PublicKey = cfg.signer.base64PublicKey?.trim();

            if (!keyId || !base64PublicKey) {
              throw new IotaPluginError(
                "invalid_input",
                "kms signer mode requires signer.keyId and signer.base64PublicKey in plugin config",
              );
            }

            const kmsArgs = ["keytool", "sign-kms", "--data", draft.txBytes, "--keyid", keyId, "--base64pk", base64PublicKey];
            if (cfg.signer.intent) {
              kmsArgs.push("--intent", cfg.signer.intent);
            }

            const signResult = await exec(cfg, kmsArgs, { expectJson: true });
            signature = findSignature(signResult);
            if (!signature) {
              throw new IotaPluginError("cli_parse_error", "could not extract signature from keytool sign-kms output");
            }

            draft.signature = signature;
            store.set(draft);
          } else {
            const signerAddress = assertIotaAddress(
              params.signerAddress ?? draft.signerAddress,
              "signerAddress",
            );
            const signResult = await exec(
              cfg,
              ["keytool", "sign", "--address", signerAddress, "--data", draft.txBytes],
              { expectJson: true },
            );

            signature = findSignature(signResult);
            if (!signature) {
              throw new IotaPluginError("cli_parse_error", "could not extract signature from keytool output");
            }

            draft.signerAddress = signerAddress;
            draft.signature = signature;
            store.set(draft);
          }

          const executeArgs = buildClientArgsWithNetwork(cfg, [
            "client",
            "execute-signed-tx",
            "--tx-bytes",
            draft.txBytes,
            "--signatures",
            signature,
          ]);

          const verifyResult = await exec(
            cfg,
            ["keytool", "decode-or-verify-tx", "--tx-bytes", draft.txBytes, "--sig", signature],
            { expectJson: true },
          );
          if (!isVerificationSuccessful(verifyResult)) {
            throw new IotaPluginError("policy_denied", "signature verification failed", verifyResult);
          }

          const result = await exec(cfg, executeArgs, { expectJson: true });
          store.delete(draftId);

          return toToolText({ ok: true, status: "executed", result, verifyResult });
        } catch (err) {
          return toToolText(toToolErrorPayload(err));
        }
      },
    },
    { optional: true },
  );
}
