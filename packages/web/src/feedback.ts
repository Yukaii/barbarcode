let audio: AudioContext | null = null;

/** iOS only allows audio after a user gesture; call this from one. */
export function unlockAudio() {
  audio ??= new AudioContext();
  if (audio.state === "suspended") void audio.resume();
}

export function beep(ok = true) {
  navigator.vibrate?.(ok ? 35 : [60, 60, 60]);
  if (audio?.state !== "running") return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = ok ? 1760 : 220;
  gain.gain.setValueAtTime(0.12, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.09);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 0.1);
}

let wakeLock: WakeLockSentinel | null = null;

/** Keeps the screen on while scanning; re-acquired whenever the page becomes visible again. */
export async function keepAwake() {
  const acquire = async () => {
    try {
      wakeLock = await navigator.wakeLock?.request("screen");
    } catch {
      // Not supported, or denied (e.g. battery saver). Scanning still works.
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && (!wakeLock || wakeLock.released)) void acquire();
  });
  await acquire();
}
