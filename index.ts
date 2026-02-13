import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveIotaWalletConfig } from "./src/config.js";
import { registerReadTools } from "./src/tools/read-tools.js";
import { registerTxTools } from "./src/tools/tx-tools.js";

const plugin = {
  id: "openclaw-iota-wallet",
  name: "IOTA Wallet",
  description: "IOTA wallet tools with approval-gated transaction flow.",
  register(api: OpenClawPluginApi) {
    const cfg = resolveIotaWalletConfig(api.pluginConfig);

    if (!cfg.enabled) {
      api.logger.info("openclaw-iota-wallet plugin is disabled by config");
      return;
    }

    registerReadTools(api, cfg);
    registerTxTools(api, cfg);
  },
};

export default plugin;
