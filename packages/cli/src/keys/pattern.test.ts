import { expect, describe as group, it } from "vitest";
import { compilePattern, describe, PatternError, render, sanitizeBarcode } from "./pattern";

const run = (pattern: string, code = "123") => render(compilePattern(pattern), code);

group("compilePattern + render", () => {
  it("handles the classic patterns from 0.1", () => {
    expect(run("{barcode}{enter}")).toEqual([
      { kind: "text", text: "123" },
      { kind: "key", key: "enter", modifiers: [] },
    ]);
    expect(run("{key:F4}{barcode}{enter}")[0]).toEqual({ kind: "key", key: "f4", modifiers: [] });
    expect(run("SKU:{barcode}{tab}Quantity:")).toEqual([
      { kind: "text", text: "SKU:123" },
      { kind: "key", key: "tab", modifiers: [] },
      { kind: "text", text: "Quantity:" },
    ]);
    expect(run("{delay:500}{key:F5}")[0]).toEqual({ kind: "delay", ms: 500 });
  });

  it("supports key combos with modifier aliases", () => {
    expect(run("{key:cmd+shift+s}")).toEqual([
      { kind: "key", key: "s", modifiers: ["meta", "shift"] },
    ]);
    expect(run("{ctrl+Enter}")).toEqual([{ kind: "key", key: "enter", modifiers: ["ctrl"] }]);
    expect(run("{ctrl++}")).toEqual([{ kind: "key", key: "+", modifiers: ["ctrl"] }]);
  });

  it("substitutes every {barcode}, not just the first", () => {
    expect(run("{barcode}-{barcode}", "A")).toEqual([{ kind: "text", text: "A-A" }]);
  });

  it("treats {{ and }} as literal braces", () => {
    expect(run("{{{barcode}}}", "X")).toEqual([{ kind: "text", text: "{X}" }]);
  });

  it("never interprets the barcode as tokens or control keys", () => {
    expect(run("{barcode}", "{key:cmd+q}\nrm")).toEqual([{ kind: "text", text: "{key:cmd+q}rm" }]);
  });

  it("rejects typos at compile time", () => {
    expect(() => compilePattern("{entr}")).toThrow(PatternError);
    expect(() => compilePattern("{hyper+s}")).toThrow(/unknown modifier/);
    expect(() => compilePattern("{delay:abc}")).toThrow(/delay/);
    expect(() => compilePattern("{barcode")).toThrow(/Unclosed/);
  });
});

group("helpers", () => {
  it("sanitizes control characters", () => {
    expect(sanitizeBarcode("01\u001d17\r\n")).toBe("0117");
  });

  it("describes actions for humans", () => {
    expect(describe(run("{key:F4}{barcode}{cmd+s}{enter}"))).toBe('F4 "123" ⌘s ⏎');
  });
});
