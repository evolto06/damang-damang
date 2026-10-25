// Physical positions use the browser's standard mapping, independent of printed labels.
const BUTTONS = Object.freeze({ dash: 0, web: 1, bite: 2, shoot: 3, pause: 9, up: 12, drop: 13, left: 14, right: 15 });
const usedButtons = Object.values(BUTTONS);
export function normalizeGamepad(gamepad, now) {
  if (!gamepad || gamepad.connected === false) return null;
  const supported = gamepad.mapping === 'standard' && gamepad.buttons?.length >= 16;
  const buttons = supported ? Array.from(gamepad.buttons, button => !!button && (button.pressed === true || button.value > 0.5)) : [];
  const at = Number.isFinite(gamepad.timestamp) && gamepad.timestamp > 0 && gamepad.timestamp <= now ? gamepad.timestamp : now;
  const axes = Array.from(gamepad.axes ?? [], value => Number.isFinite(value) ? value : 0);
  return { key: `${gamepad.index}:${gamepad.id}`, supported, buttons, axes, at };
}

export function createControllerInput() {
  const slots = Array.from({ length: 2 }, () => ({ key: null, previous: [], armed: false, direction: 0, connected: false }));
  let contextKey = '';
  let selectedMode = 'bot';
  const release = () => { for (const slot of slots) { slot.previous = []; slot.armed = false; slot.direction = 0; slot.axisX = 0; slot.axisY = 0; } };
  return {
    // Reset input edges without changing ownership, including across rounds.
    reset: release,
    selectMode(mode) { selectedMode = mode === 'pvp' ? 'pvp' : 'bot'; },
    poll(gamepads, now, context) {
      const snapshots = Array.from(gamepads ?? [], pad => normalizeGamepad(pad, now)).filter(Boolean);
      const supported = snapshots.filter(pad => pad.supported).sort((a, b) => Number(a.key.split(':')[0]) - Number(b.key.split(':')[0]));
      const result = { command: null, actions: [], directions: [], direction: null, unsupported: snapshots.some(pad => !pad.supported), connected: false, armed: false, slots: [], selectedMode };
      const key = [context.started, context.ready, context.paused, context.ended, context.focused, context.mode, context.navigation ?? ''].join(':');
      if (key !== contextKey) { contextKey = key; release(); }
      // Connected pads retain their fighter. New pads fill the first vacant slot,
      // including during play; each new identity must release its buttons first.
      for (const [fighter, slot] of slots.entries()) {
        if (slot.key && !supported.some(pad => pad.key === slot.key)) {
          if (slot.direction) {
            result.directions.push({ fighter, value: 0, at: now });
            if (fighter === 0) result.direction = { value: 0, at: now };
          }
          slot.key = null; slot.previous = []; slot.armed = false; slot.direction = 0; slot.axisX = 0; slot.axisY = 0;
        }
      }
      for (const slot of slots) {
        if (slot.key === null) slot.key = supported.find(pad => !slots.some(owner => owner.key === pad.key))?.key ?? null;
      }
      const edges = slots.map((slot, fighter) => {
        const pad = supported.find(candidate => candidate.key === slot.key);
        const lost = slot.connected && !pad;
        slot.connected = !!pad;
        if (lost || !context.focused) { slot.previous = []; slot.armed = false; slot.direction = 0; slot.axisX = 0; slot.axisY = 0; }
        if (!pad || !context.focused) return null;
        if (!slot.armed) {
          // A reveal, reconnect, mode change or resume requires full neutral first.
          slot.armed = !usedButtons.some(index => pad.buttons[index]) && !pad.axes.slice(0, 2).some(value => Math.abs(value) >= 0.35);
          slot.previous = pad.buttons;
          return null;
        }
        const pressed = Object.fromEntries(Object.entries(BUTTONS).map(([kind, index]) => [kind, pad.buttons[index] && !slot.previous[index]]));
        slot.previous = pad.buttons;
        const axisDirection = value => Math.abs(value ?? 0) >= 0.5 ? Math.sign(value) : 0;
        const x = axisDirection(pad.axes[0]), y = axisDirection(pad.axes[1]);
        const axisX = x && x !== slot.axisX ? x : 0, axisY = y && y !== slot.axisY ? y : 0;
        slot.axisX = x; slot.axisY = y;
        return { fighter, pad, pressed, axisX, axisY };
      });
      result.slots = slots.map(({ key, connected, armed }) => ({ key, connected, armed }));
      result.connected = slots[0].connected;
      result.armed = slots[0].armed;
      const participating = edges.slice(0, context.started && context.mode !== 'pvp' ? 1 : 2).filter(Boolean);
      if (context.navigation) {
        for (const edge of participating) {
          const { pressed, axisX, axisY } = edge;
          const move = pressed.drop ? 1 : pressed.up ? -1 : axisY;
          const adjust = pressed.right ? 1 : pressed.left ? -1 : axisX;
          if (move || adjust || pressed.dash || pressed.web || pressed.pause) {
            result.navigation = { move, adjust, activate: !!pressed.dash, back: !!pressed.web, resume: !!pressed.pause };
            break;
          }
        }
        return result;
      }
      if (!context.started) {
        if (participating.some(edge => edge.pressed.up)) selectedMode = 'bot';
        else if (participating.some(edge => edge.pressed.drop)) selectedMode = 'pvp';
        result.selectedMode = selectedMode;
        if (context.ready && participating.some(edge => edge.pressed.dash)) result.command = 'start';
        return result;
      }
      // Lifecycle commands consume the entire sample for both players.
      if (!result.command && context.ended && participating.some(edge => edge.pressed.dash)) result.command = 'restart';
      else if (!result.command && !context.ended && participating.some(edge => edge.pressed.pause)) {
        if (!context.paused) result.command = 'pause';
        else result.command = 'resume';
      }
      if (result.command || !context.ready || context.paused || context.ended || !context.focused) return result;
      for (const { fighter, pad, pressed } of participating) {
        const slot = slots[fighter];
        const dpad = Number(pad.buttons[BUTTONS.right]) - Number(pad.buttons[BUTTONS.left]);
        const nextDirection = pad.buttons[BUTTONS.right] || pad.buttons[BUTTONS.left] ? dpad : Math.abs(pad.axes[0] ?? 0) >= 0.35 ? Math.sign(pad.axes[0]) : 0;
        if (nextDirection !== slot.direction) {
          slot.direction = nextDirection;
          const direction = { fighter, value: nextDirection, at: pad.at };
          result.directions.push(direction);
          if (fighter === 0) result.direction = { value: nextDirection, at: pad.at };
        }
        for (const kind of ['bite', 'shoot', 'dash', 'drop', 'web']) if (pressed[kind]) result.actions.push({ fighter, kind, at: pad.at });
      }
      return result;
    },
  };
}

// Releasing one source never erases another source's held direction.
export function combinedDirection(keyboard, pointer, controller) { return Math.sign(keyboard + pointer + controller); }
