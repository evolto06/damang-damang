// Procedural cues only: no downloaded audio, and no AudioContext until a gesture.
export function createGameAudio({
  Context = globalThis.AudioContext ?? globalThis.webkitAudioContext,
} = {}) {
  let context,
    muted = false,
    previous = null;
  const active = new Set();
  function silence() {
    for (const oscillator of active) {
      try {
        oscillator.stop();
      } catch {}
    }
    active.clear();
  }
  function tone(
    frequency,
    end,
    duration,
    delay = 0,
    type = "sine",
    volume = 0.06,
  ) {
    if (!context || context.state !== "running" || muted) return;
    try {
      const oscillator = context.createOscillator(),
        gain = context.createGain();
      const start = context.currentTime + delay;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, end),
        start + duration,
      );
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      active.add(oscillator);
      oscillator.onended = () => {
        active.delete(oscillator);
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
    } catch {
      /* Audio failure must never interrupt gameplay. */
    }
  }
  function cue(kind) {
    if (kind === "bite") tone(700, 180, 0.065, 0, "triangle", 0.035);
    if (kind === "web") tone(1300, 280, 0.14, 0, "sine", 0.04);
    if (kind === "hit") tone(130, 42, 0.15, 0, "triangle", 0.09);
    if (kind === "stun") tone(460, 800, 0.12, 0, "sine", 0.035);
    if (kind === "end") {
      tone(330, 330, 0.2);
      tone(440, 440, 0.25, 0.15);
      tone(660, 660, 0.35, 0.3);
    }
  }
  return {
    get muted() {
      return muted;
    },
    unlock() {
      if (!Context || muted) return;
      try {
        context ??= new Context();
        context.resume()?.catch?.(() => {});
      } catch {}
    },
    setMuted(value) {
      muted = Boolean(value);
      if (muted) silence();
    },
    reset() {
      previous = null;
      silence();
    },
    update(world, { paused = false } = {}) {
      const current = {
        tick: world.tick,
        status: world.status,
        fighters: world.fighters.map((f) => ({
          phase: f.phase,
          attackId: f.attackId,
          webId: f.webId,
          hp: f.hp,
          air: f.air.mode,
        })),
      };
      if (previous && current.tick >= previous.tick && !paused) {
        current.fighters.forEach((fighter, index) => {
          const before = previous.fighters[index];
          if (fighter.hp < before.hp) cue("hit");
          if (
            fighter.phase === "active" &&
            (before.phase !== "active" || fighter.attackId !== before.attackId)
          )
            cue("bite");
          if (
            fighter.phase === "webrelease" &&
            (before.phase !== "webrelease" || fighter.webId !== before.webId)
          )
            cue("web");
          if (fighter.air === "deploying" && before.air !== "deploying")
            cue("web");
          if (fighter.phase === "webstun" && before.phase !== "webstun")
            cue("stun");
        });
        if (current.status === "ended" && previous.status !== "ended")
          cue("end");
      }
      if (paused) silence();
      previous = current;
    },
  };
}
