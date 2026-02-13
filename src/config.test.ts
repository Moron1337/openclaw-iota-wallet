import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveIotaWalletConfig } from "./config.js";

const A = `0x${"0123456789abcdef".repeat(4)}`;
const B = `0x${"a".repeat(64)}`;

describe("resolveIotaWalletConfig", () => {
  it("returns defaults", () => {
    const cfg = resolveIotaWalletConfig(undefined);
    expect(cfg.defaultNetwork).toBe(DEFAULT_CONFIG.defaultNetwork);
    expect(cfg.requireApproval).toBe(true);
    expect(cfg.maxTransferNanos).toBe(1_000_000_000n);
  });

  it("normalizes and clamps values", () => {
    const cfg = resolveIotaWalletConfig({
      defaultNetwork: "mainnet",
      approvalTtlSeconds: 999999,
      commandTimeoutMs: 10,
      maxTransferNanos: "12345",
      recipientAllowlist: [A, B.toUpperCase(), "bad"],
      customRpcUrl: "https://example.org/rpc",
      signer: { mode: "external-signature" },
    });

    expect(cfg.defaultNetwork).toBe("mainnet");
    expect(cfg.approvalTtlSeconds).toBe(86400);
    expect(cfg.commandTimeoutMs).toBe(1000);
    expect(cfg.maxTransferNanos).toBe(12345n);
    expect(cfg.recipientAllowlist.has(A)).toBe(true);
    expect(cfg.recipientAllowlist.has(B)).toBe(true);
    expect(cfg.customRpcUrl).toBe("https://example.org/rpc");
    expect(cfg.signer.mode).toBe("external-signature");
  });

  it("drops invalid URL", () => {
    const cfg = resolveIotaWalletConfig({ customRpcUrl: "not-an-url" });
    expect(cfg.customRpcUrl).toBeUndefined();
  });

  it("prefers IOTA_CLI_PATH from environment when cliPath is not provided", () => {
    const original = process.env.IOTA_CLI_PATH;
    process.env.IOTA_CLI_PATH = "/tmp/custom-iota";
    try {
      const cfg = resolveIotaWalletConfig({});
      expect(cfg.cliPath).toBe("/tmp/custom-iota");
    } finally {
      if (original === undefined) {
        delete process.env.IOTA_CLI_PATH;
      } else {
        process.env.IOTA_CLI_PATH = original;
      }
    }
  });
});
