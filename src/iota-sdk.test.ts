import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendEd25519KeystoreEntry, defaultKeystorePath, loadKeystoreEntries, resolveRpcUrl } from "./iota-sdk.js";

describe("iota-sdk helpers", () => {
  it("returns the default keystore path", () => {
    expect(defaultKeystorePath("/tmp/example-home")).toBe("/tmp/example-home/.iota/iota_config/iota.keystore");
  });

  it("appends and reloads an ed25519 keystore entry", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-iota-sdk-"));
    const keystorePath = path.join(tmp, "wallet", "iota.keystore");

    const created = await appendEd25519KeystoreEntry(keystorePath, "sdk-wallet");
    const entries = await loadKeystoreEntries(keystorePath);

    expect(created.keystorePath).toBe(keystorePath);
    expect(created.alias).toBe("sdk-wallet");
    expect(entries).toHaveLength(1);
    expect(entries[0].address).toBe(created.address);
    expect(entries[0].alias).toBe("sdk-wallet");
    expect(entries[0].secretKey.startsWith("iotaprivkey")).toBe(true);
  });

  it("loads legacy array-format keystores", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-iota-sdk-legacy-"));
    const keystorePath = path.join(tmp, "iota.keystore");

    const modern = await appendEd25519KeystoreEntry(path.join(tmp, "source.keystore"), "legacy-source");
    const sourceEntries = await loadKeystoreEntries(path.join(tmp, "source.keystore"));
    fs.writeFileSync(keystorePath, JSON.stringify([sourceEntries[0].secretKey], null, 2));

    const entries = await loadKeystoreEntries(keystorePath);
    expect(entries).toHaveLength(1);
    expect(entries[0].address).toBe(modern.address);
  });

  it("resolves mainnet and custom rpc urls", () => {
    expect(
      resolveRpcUrl({
        enabled: true,
        cliPath: "iota",
        defaultNetwork: "mainnet",
        requireApproval: true,
        approvalTtlSeconds: 1800,
        maxTransferNanos: 1_000_000_000n,
        recipientAllowlist: new Set<string>(),
        commandTimeoutMs: 30_000,
        signer: { mode: "local-keystore", keystorePath: "/tmp/iota.keystore" },
      }),
    ).toMatch(/^https?:\/\//);

    expect(
      resolveRpcUrl({
        enabled: true,
        cliPath: "iota",
        defaultNetwork: "custom",
        customRpcUrl: "https://rpc.example.invalid",
        requireApproval: true,
        approvalTtlSeconds: 1800,
        maxTransferNanos: 1_000_000_000n,
        recipientAllowlist: new Set<string>(),
        commandTimeoutMs: 30_000,
        signer: { mode: "local-keystore", keystorePath: "/tmp/iota.keystore" },
      }),
    ).toBe("https://rpc.example.invalid");
  });
});
