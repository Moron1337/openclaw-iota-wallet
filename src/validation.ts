import { IotaPluginError } from "./errors.js";

const IOTA_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/i;
const COIN_TYPE_RE = /^[^\s:]+::[^\s:]+::[^\s:]+$/;

export function isIotaAddress(value: string): boolean {
  return IOTA_ADDRESS_RE.test(value);
}

export function normalizeIotaAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function assertIotaAddress(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new IotaPluginError("invalid_input", `${field} must be a string`);
  }
  const normalized = normalizeIotaAddress(value);
  if (!isIotaAddress(normalized)) {
    throw new IotaPluginError("invalid_input", `${field} must be a valid 0x-prefixed 64-byte IOTA address`);
  }
  return normalized;
}

export function assertOptionalCoinType(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new IotaPluginError("invalid_input", "coinType must be a string");
  }
  const trimmed = value.trim();
  if (!COIN_TYPE_RE.test(trimmed)) {
    throw new IotaPluginError("invalid_input", "coinType must match <address>::<module>::<type>");
  }
  return trimmed;
}

export function parsePositiveBigInt(value: unknown, field: string): bigint {
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = BigInt(value);
    if (parsed <= 0n) {
      throw new IotaPluginError("invalid_input", `${field} must be greater than 0`);
    }
    return parsed;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return BigInt(value);
  }
  throw new IotaPluginError("invalid_input", `${field} must be a positive integer string`);
}

export function parseOptionalPositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  throw new IotaPluginError("invalid_input", `${field} must be a positive integer`);
}

export function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new IotaPluginError("invalid_input", `${field} must be an array`);
  }
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new IotaPluginError("invalid_input", `${field} must only contain non-empty strings`);
    }
    out.push(entry.trim());
  }
  return out;
}

export function asBoolean(value: unknown): boolean {
  return value === true;
}
