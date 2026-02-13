import { describe, expect, it } from "vitest";
import {
  assertIotaAddress,
  assertOptionalCoinType,
  assertStringArray,
  isIotaAddress,
  parseOptionalPositiveInt,
  parsePositiveBigInt,
} from "./validation.js";

const A = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("validation", () => {
  it("validates addresses", () => {
    expect(isIotaAddress(A)).toBe(true);
    expect(assertIotaAddress(A.toUpperCase(), "address")).toBe(A);
    expect(() => assertIotaAddress("bad", "address")).toThrow();
  });

  it("validates coin type", () => {
    expect(assertOptionalCoinType("0x2::iota::IOTA")).toBe("0x2::iota::IOTA");
    expect(assertOptionalCoinType(undefined)).toBeUndefined();
    expect(() => assertOptionalCoinType("broken")).toThrow();
  });

  it("parses amounts", () => {
    expect(parsePositiveBigInt("123", "amount")).toBe(123n);
    expect(() => parsePositiveBigInt("0", "amount")).toThrow();
    expect(parseOptionalPositiveInt("100", "gasBudget")).toBe(100);
    expect(parseOptionalPositiveInt(undefined, "gasBudget")).toBeUndefined();
    expect(() => parseOptionalPositiveInt("-1", "gasBudget")).toThrow();
  });

  it("validates string arrays", () => {
    expect(assertStringArray(["a", " b "], "x")).toEqual(["a", "b"]);
    expect(() => assertStringArray(["", "b"], "x")).toThrow();
  });
});
