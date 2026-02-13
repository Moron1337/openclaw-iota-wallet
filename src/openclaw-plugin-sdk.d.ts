declare module "openclaw/plugin-sdk" {
  export type PluginLogger = {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };

  export type OpenClawPluginApi = {
    id: string;
    pluginConfig?: Record<string, unknown>;
    logger: PluginLogger;
    registerTool: (tool: unknown, opts?: { optional?: boolean }) => void;
  };
}
