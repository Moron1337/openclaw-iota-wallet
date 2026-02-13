import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../config.js";
import { registerReadTools } from "./read-tools.js";

const A = `0x${"0123456789abcdef".repeat(4)}`;

type ToolDef = {
  name: string;
  execute: (id: string, params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
};

function parseToolJson(result: { content: Array<{ type: string; text: string }> }): unknown {
  return JSON.parse(result.content[0]?.text ?? "{}");
}

describe("registerReadTools", () => {
  it("registers tools and builds args", async () => {
    const tools = new Map<string, ToolDef>();
    const exec = vi.fn(async (_cfg, args: string[]) => {
      return { args };
    });

    const api = {
      registerTool(tool: unknown) {
        const typed = tool as ToolDef;
        tools.set(typed.name, typed);
      },
    } as any;

    registerReadTools(api, DEFAULT_CONFIG, { exec: exec as any });

    const balance = tools.get("iota_get_balance");
    expect(balance).toBeDefined();

    const result = await balance!.execute("1", {
      address: A,
      coinType: "0x2::iota::IOTA",
      withCoins: true,
    });

    const payload = parseToolJson(result) as any;
    expect(payload.ok).toBe(true);
    expect(exec).toHaveBeenCalledTimes(1);
    const callArgs = exec.mock.calls[0]?.[1] as string[];
    expect(callArgs).toContain("--with-coins");
    expect(callArgs).toContain("--coin-type");
    expect(callArgs).toContain(A);
  });

  it("returns tool error payload on invalid address", async () => {
    const tools = new Map<string, ToolDef>();

    const api = {
      registerTool(tool: unknown) {
        const typed = tool as ToolDef;
        tools.set(typed.name, typed);
      },
    } as any;

    registerReadTools(api, DEFAULT_CONFIG, { exec: vi.fn() as any });

    const gas = tools.get("iota_get_gas")!;
    const result = await gas.execute("1", { address: "bad" });
    const payload = parseToolJson(result) as any;

    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("invalid_input");
  });
});
