export type ToolText = { content: Array<{ type: "text"; text: string }> };

export function toToolText(payload: unknown): ToolText {
  const text = JSON.stringify(
    payload,
    (_key, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    },
    2,
  );

  return {
    content: [{ type: "text", text }],
  };
}
