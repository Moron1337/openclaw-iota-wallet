import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { toToolErrorPayload } from "../errors.js";
import { buildClientArgsWithNetwork, execIotaCli } from "../iota-cli.js";
import { toToolText } from "../tool-output.js";
import type { IotaWalletConfig } from "../types.js";
import { assertIotaAddress, assertOptionalCoinType } from "../validation.js";

type ExecFn = typeof execIotaCli;

export function registerReadTools(
  api: OpenClawPluginApi,
  cfg: IotaWalletConfig,
  deps?: { exec?: ExecFn },
): void {
  const exec = deps?.exec ?? execIotaCli;

  api.registerTool(
    {
      name: "iota_active_env",
      description: "Get the active IOTA environment from the local CLI config.",
      parameters: Type.Object({}),
      async execute() {
        try {
          const result = await exec(cfg, ["client", "active-env"], { expectJson: true });
          return toToolText({ ok: true, result });
        } catch (err) {
          return toToolText(toToolErrorPayload(err));
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "iota_get_balance",
      description: "Read wallet balances using iota client balance.",
      parameters: Type.Object({
        address: Type.Optional(Type.String()),
        coinType: Type.Optional(Type.String()),
        withCoins: Type.Optional(Type.Boolean()),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        try {
          const args = buildClientArgsWithNetwork(cfg, ["client", "balance"]);

          if (params.address !== undefined && params.address !== null && params.address !== "") {
            args.push(assertIotaAddress(params.address, "address"));
          }

          const coinType = assertOptionalCoinType(params.coinType);
          if (coinType) {
            args.push("--coin-type", coinType);
          }

          if (params.withCoins === true) {
            args.push("--with-coins");
          }

          const result = await exec(cfg, args, { expectJson: true });
          return toToolText({ ok: true, result });
        } catch (err) {
          return toToolText(toToolErrorPayload(err));
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "iota_get_gas",
      description: "List gas coin objects for an address.",
      parameters: Type.Object({
        address: Type.Optional(Type.String()),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        try {
          const args = buildClientArgsWithNetwork(cfg, ["client", "gas"]);
          if (params.address !== undefined && params.address !== null && params.address !== "") {
            args.push(assertIotaAddress(params.address, "address"));
          }
          const result = await exec(cfg, args, { expectJson: true });
          return toToolText({ ok: true, result });
        } catch (err) {
          return toToolText(toToolErrorPayload(err));
        }
      },
    },
    { optional: true },
  );
}
