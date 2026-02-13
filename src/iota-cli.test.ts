import { describe, expect, it } from "vitest";
import { parseJsonFromStdout } from "./iota-cli.js";

describe("parseJsonFromStdout", () => {
  it("parses direct JSON", () => {
    expect(parseJsonFromStdout('{"ok":true}')).toEqual({ ok: true });
  });

  it("parses trailing JSON suffix", () => {
    expect(parseJsonFromStdout("warning line\n{\"ok\":true}")).toEqual({ ok: true });
  });

  it("throws on invalid input", () => {
    expect(() => parseJsonFromStdout("not-json")).toThrow();
  });
});
