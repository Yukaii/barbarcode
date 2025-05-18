// server/helpers.ts
import { networkInterfaces } from "node:os";
import robotjs from "robotjs";

const { keyTap, setKeyboardDelay, typeString } = robotjs;

export function getLocalIpAddress(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

export function executeKeystrokes(pattern: string): void {
  const keystrokes = pattern.match(/(\{[^}]+\}|[^{]+)/g) || [];
  for (const keystroke of keystrokes) {
    if (keystroke.startsWith("{") && keystroke.endsWith("}")) {
      const command = keystroke.slice(1, -1);
      switch (true) {
        case command === "enter":
          keyTap("enter");
          break;
        case command === "tab":
          keyTap("tab");
          break;
        case command === "esc":
          keyTap("escape");
          break;
        case command.startsWith("delay:"):
          setKeyboardDelay(Number(command.split(":")[1]));
          break;
        case ["up", "down", "left", "right"].includes(command):
          keyTap(command);
          break;
        case command.startsWith("key:"):
          keyTap(command.split(":")[1]);
          break;
        // Add more commands as needed
      }
    } else {
      typeString(keystroke);
    }
  }
}
