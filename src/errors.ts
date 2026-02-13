export type IotaPluginErrorCode =
  | "invalid_input"
  | "policy_denied"
  | "cli_timeout"
  | "cli_failed"
  | "cli_parse_error"
  | "draft_not_found"
  | "draft_expired"
  | "approval_required";

export class IotaPluginError extends Error {
  code: IotaPluginErrorCode;
  details?: unknown;

  constructor(code: IotaPluginErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "IotaPluginError";
    this.code = code;
    this.details = details;
  }
}

export function toToolErrorPayload(err: unknown): { ok: false; error: { code: string; message: string; details?: unknown } } {
  if (err instanceof IotaPluginError) {
    return {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
  }

  if (err instanceof Error) {
    return {
      ok: false,
      error: {
        code: "unknown",
        message: err.message,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "unknown",
      message: "Unexpected plugin error",
      details: err,
    },
  };
}
