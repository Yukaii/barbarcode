import { describe, expect, it } from "vitest";
import {
  appleScriptFor,
  escapeSendKeys,
  KeyDriverError,
  powerShellFor,
  wtypePlan,
  xdotoolPlan,
} from "./drivers";
import { compilePattern, render } from "./pattern";

const actions = (pattern: string, code = 'A"1\\') => render(compilePattern(pattern), code);

describe("macOS AppleScript", () => {
  it("escapes text and maps keys and modifiers", () => {
    expect(appleScriptFor(actions("{key:F4}{barcode}{delay:250}{cmd+shift+s}{enter}"))).toBe(
      [
        'tell application "System Events"',
        "  key code 118",
        '  keystroke "A\\"1\\\\"',
        "  delay 0.25",
        '  keystroke "s" using {command down, shift down}',
        "  key code 36",
        "end tell",
      ].join("\n"),
    );
  });

  it("rejects keys macOS doesn't have", () => {
    expect(() => appleScriptFor(actions("{f24}"))).toThrow(KeyDriverError);
  });
});

describe("Windows SendKeys", () => {
  it("escapes SendKeys syntax and PowerShell quotes", () => {
    expect(escapeSendKeys("50% (+1) {x}")).toBe("50{%} {(}{+}1{)} {{}x{}}");
    const script = powerShellFor(actions("{barcode}{ctrl+s}{enter}", "it's"));
    expect(script).toContain("SendWait('it''s')");
    expect(script).toContain("SendWait('^s')");
    expect(script).toContain("SendWait('{ENTER}')");
  });

  it("rejects the Windows key", () => {
    expect(() => powerShellFor(actions("{win+r}"))).toThrow(/Windows key/);
  });
});

describe("Linux", () => {
  it("plans xdotool invocations", () => {
    expect(xdotoolPlan(actions("{barcode}{delay:10}{ctrl+alt+t}", "42"))).toEqual([
      ["type", "--clearmodifiers", "--delay", "2", "--", "42"],
      { sleep: 10 },
      ["key", "--clearmodifiers", "ctrl+alt+t"],
    ]);
  });

  it("plans wtype invocations with balanced modifiers", () => {
    expect(wtypePlan(actions("{ctrl+shift+pageup}"))).toEqual([
      ["-M", "ctrl", "-M", "shift", "-k", "Prior", "-m", "shift", "-m", "ctrl"],
    ]);
  });
});
