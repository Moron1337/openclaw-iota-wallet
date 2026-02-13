import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DraftStore } from "../draft-store.js";
import { DEFAULT_CONFIG } from "../config.js";
import { registerTxTools } from "./tx-tools.js";

const A = `0x${"0123456789abcdef".repeat(4)}`;
const C = `0x${"a".repeat(64)}`;
const D = `0x${"b".repeat(64)}`;

type ToolDef = {
  name: string;
  execute: (id: string, params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
};

function parseToolJson(result: { content: Array<{ type: string; text: string }> }): any {
  return JSON.parse(result.content[0]?.text ?? "{}");
}

describe("registerTxTools", () => {
  it("prepares, approves and executes a draft", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "iota-wallet-test-"));
    const store = new DraftStore(path.join(tmp, "drafts.json"));

    const tools = new Map<string, ToolDef>();

    const exec = vi.fn(async (_cfg, args: string[], opts?: { expectJson?: boolean }) => {
      const argStr = args.join(" ");
      if (argStr.includes("serialize-unsigned-transaction")) {
        return "QUJDREVGR0hJSg==";
      }
      if (argStr.includes("decode-or-verify-tx") && argStr.includes("--sig")) {
        return { result: { Ok: null } };
      }
      if (argStr.includes("decode-or-verify-tx")) {
        return { decoded: true };
      }
      if (argStr.includes("serialized-tx") && argStr.includes("--dry-run")) {
        return { dryRun: true };
      }
      if (argStr.includes("execute-signed-tx")) {
        return { digest: "0xdeadbeef" };
      }
      if (argStr.includes("keytool sign") || argStr.includes(" keytool sign ")) {
        return { iotaSignature: "AQIDBA==" };
      }
      if (opts?.expectJson === true) {
        return {};
      }
      return "";
    });

    const api = {
      registerTool(tool: unknown) {
        const typed = tool as ToolDef;
        tools.set(typed.name, typed);
      },
    } as any;

    registerTxTools(
      api,
      {
        ...DEFAULT_CONFIG,
        signer: { mode: "external-signature" },
      },
      { exec: exec as any, store },
    );

    const prepare = tools.get("iota_prepare_transfer")!;
    const approve = tools.get("iota_approve_transfer")!;
    const dryRun = tools.get("iota_dry_run_transfer")!;
    const execute = tools.get("iota_execute_transfer")!;

    const prepareRes = parseToolJson(
      await prepare.execute("1", {
        recipient: A,
        amountNanos: "100",
        inputCoins: [C, D],
        gasBudget: "5000000",
      }),
    );

    expect(prepareRes.ok).toBe(true);
    expect(prepareRes.status).toBe("prepared");
    expect(prepareRes.draft.txBytes).toBe("QUJDREVGR0hJSg==");

    const draftId = prepareRes.draft.id as string;

    const approveRes = parseToolJson(await approve.execute("1", { draftId, approve: true }));
    expect(approveRes.ok).toBe(true);

    const dryRunRes = parseToolJson(await dryRun.execute("1", { draftId }));
    expect(dryRunRes.ok).toBe(true);
    expect(dryRunRes.status).toBe("dry_run");

    const executeRes = parseToolJson(
      await execute.execute("1", {
        draftId,
        signature: "AQIDBA==",
      }),
    );

    expect(executeRes.ok).toBe(true);
    expect(executeRes.status).toBe("executed");
    expect(executeRes.result.digest).toBe("0xdeadbeef");
  });

  it("executes with kms signer mode", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "iota-wallet-test-kms-"));
    const store = new DraftStore(path.join(tmp, "drafts.json"));
    const tools = new Map<string, ToolDef>();

    const exec = vi.fn(async (_cfg, args: string[], opts?: { expectJson?: boolean }) => {
      const argStr = args.join(" ");
      if (argStr.includes("serialize-unsigned-transaction")) {
        return "QUJDREVGR0hJSg==";
      }
      if (argStr.includes("decode-or-verify-tx") && argStr.includes("--sig")) {
        return { result: { Ok: null } };
      }
      if (argStr.includes("decode-or-verify-tx")) {
        return { decoded: true };
      }
      if (argStr.includes("sign-kms")) {
        return { serializedSigBase64: "AQIDBA==" };
      }
      if (argStr.includes("execute-signed-tx")) {
        return { digest: "0xbeef" };
      }
      if (opts?.expectJson === true) {
        return {};
      }
      return "";
    });

    const api = {
      registerTool(tool: unknown) {
        const typed = tool as ToolDef;
        tools.set(typed.name, typed);
      },
    } as any;

    registerTxTools(
      api,
      {
        ...DEFAULT_CONFIG,
        signer: {
          mode: "kms",
          keyId: "kms-key-id",
          base64PublicKey: "ZmFrZS1rZXk=",
        },
      },
      { exec: exec as any, store },
    );

    const prepare = tools.get("iota_prepare_transfer")!;
    const approve = tools.get("iota_approve_transfer")!;
    const execute = tools.get("iota_execute_transfer")!;

    const prepared = parseToolJson(
      await prepare.execute("1", {
        recipient: A,
        amountNanos: "100",
        inputCoins: [C],
      }),
    );
    const draftId = prepared.draft.id as string;
    await approve.execute("1", { draftId, approve: true });

    const executed = parseToolJson(await execute.execute("1", { draftId }));
    expect(executed.ok).toBe(true);
    expect(executed.status).toBe("executed");
    expect(executed.result.digest).toBe("0xbeef");
  });
});
