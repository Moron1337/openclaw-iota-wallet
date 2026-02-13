import { spawn } from "node:child_process";
import { IotaPluginError } from "./errors.js";
import type { IotaWalletConfig } from "./types.js";

const SAFE_TOP_LEVEL = new Set(["client", "keytool"]);

function resolveTopLevelCommand(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("-")) {
      return token;
    }
    // Global CLI flags such as --client.env consume the next value.
    if (token === "--client.env" || token === "--client.config") {
      i += 1;
    }
  }
  return undefined;
}

function assertSafeIotaArgs(args: string[]): void {
  if (!args.length) {
    throw new IotaPluginError("invalid_input", "iota command args are empty");
  }
  const topLevelCommand = resolveTopLevelCommand(args);
  if (!topLevelCommand || !SAFE_TOP_LEVEL.has(topLevelCommand)) {
    throw new IotaPluginError("invalid_input", `unsupported iota command: ${topLevelCommand ?? "<none>"}`);
  }
}

export function buildClientArgsWithNetwork(cfg: IotaWalletConfig, args: string[]): string[] {
  if (cfg.defaultNetwork === "custom") {
    return args;
  }
  return ["--client.env", cfg.defaultNetwork, ...args];
}

export function parseJsonFromStdout(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new IotaPluginError("cli_parse_error", "empty JSON output from iota command");
  }

  const tryParse = (input: string): unknown | undefined => {
    try {
      return JSON.parse(input) as unknown;
    } catch {
      return undefined;
    }
  };

  const direct = tryParse(trimmed);
  if (direct !== undefined) {
    return direct;
  }

  const suffixMatch = trimmed.match(/({[\s\S]*}|\[[\s\S]*])\s*$/);
  if (suffixMatch?.[1]) {
    const suffix = tryParse(suffixMatch[1]);
    if (suffix !== undefined) {
      return suffix;
    }
  }

  throw new IotaPluginError("cli_parse_error", "iota command did not return valid JSON", {
    sample: trimmed.slice(0, 500),
  });
}

export async function execIotaCli(
  cfg: IotaWalletConfig,
  args: string[],
  opts?: { expectJson?: boolean },
): Promise<string | unknown> {
  assertSafeIotaArgs(args);

  const expectJson = opts?.expectJson ?? true;
  const finalArgs = expectJson && !args.includes("--json") ? [...args, "--json"] : [...args];

  return await new Promise((resolve, reject) => {
    const child = spawn(cfg.cliPath, finalArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new IotaPluginError("cli_timeout", `iota command timed out after ${cfg.commandTimeoutMs}ms`));
    }, cfg.commandTimeoutMs);

    child.once("error", (err) => {
      clearTimeout(timer);
      reject(new IotaPluginError("cli_failed", "failed to start iota command", { cause: String(err) }));
    });

    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new IotaPluginError("cli_failed", `iota command failed (${code ?? "?"})`, {
            stderr: stderr.trim(),
            stdout: stdout.trim(),
            args: finalArgs,
          }),
        );
        return;
      }

      const text = stdout.trim();
      if (!expectJson) {
        resolve(text);
        return;
      }

      try {
        resolve(parseJsonFromStdout(text));
      } catch (err) {
        reject(err);
      }
    });
  });
}
