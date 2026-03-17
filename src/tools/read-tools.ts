import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { toToolErrorPayload } from "../errors.js";
import { getActiveEnvViaSdk, getBalanceViaSdk, getGasViaSdk } from "../iota-sdk.js";
import { toToolText } from "../tool-output.js";
import type { IotaWalletConfig } from "../types.js";
import { assertIotaAddress, assertOptionalCoinType } from "../validation.js";

type SdkReadFns = {
  getActiveEnv: typeof getActiveEnvViaSdk;
  getBalance: typeof getBalanceViaSdk;
  getGas: typeof getGasViaSdk;
};

export function registerReadTools(
  api: OpenClawPluginApi,
  cfg: IotaWalletConfig,
  deps?: { sdk?: Partial<SdkReadFns> },
): void {
  const sdk: SdkReadFns = {
    getActiveEnv: deps?.sdk?.getActiveEnv ?? getActiveEnvViaSdk,
    getBalance: deps?.sdk?.getBalance ?? getBalanceViaSdk,
    getGas: deps?.sdk?.getGas ?? getGasViaSdk,
  };

  api.registerTool(
    {
      name: "iota_active_env",
      description: "Get the active IOTA environment and RPC endpoint used by the plugin runtime.",
      parameters: Type.Object({}),
      async execute() {
        try {
          const result = await sdk.getActiveEnv(cfg);
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
      description: "Read wallet balances using the IOTA SDK RPC client.",
      parameters: Type.Object({
        address: Type.Optional(Type.String()),
        coinType: Type.Optional(Type.String()),
        withCoins: Type.Optional(Type.Boolean()),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        try {
          const address =
            params.address !== undefined && params.address !== null && params.address !== ""
              ? assertIotaAddress(params.address, "address")
              : undefined;
          const coinType = assertOptionalCoinType(params.coinType);
          const result = await sdk.getBalance(cfg, {
            address,
            coinType,
            withCoins: params.withCoins === true,
          });
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
          const address =
            params.address !== undefined && params.address !== null && params.address !== ""
              ? assertIotaAddress(params.address, "address")
              : undefined;
          const result = await sdk.getGas(cfg, { address });
          return toToolText({ ok: true, result });
        } catch (err) {
          return toToolText(toToolErrorPayload(err));
        }
      },
    },
    { optional: true },
  );
}
