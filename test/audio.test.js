import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAudio } from '../src/audio.js';

const world = () => ({
  tick: 0,
  status: 'playing',
  fighters: Array.from({ length: 2 }, () => ({
    hp: 100,
    phase: 'idle',
    attackId: 0,
    webId: 0,
    air: { mode: 'attached' },
  })),
});

test('unavailable or blocked audio does not prevent gameplay', () => {
  for (const Context of [
    null,
    class {
      constructor() {
        throw new Error('blocked');
      }
    },
  ]) {
    const audio = createGameAudio({ Context });
    assert.doesNotThrow(() => {
      audio.unlock();
      audio.update(world());
      audio.setMuted(true);
      audio.reset();
    });
  }
});

test('audio waits for a gesture, does not repeat a hit on render frames, and mute suppresses cues', () => {
  let contexts = 0,
    tones = 0,
    stops = 0;
  const parameter = () => ({
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {},
  });
  class Context {
    constructor() {
      contexts++;
      this.state = 'running';
      this.currentTime = 0;
    }
    resume() {
      return Promise.resolve();
    }
    createGain() {
      return { gain: parameter(), connect() {}, disconnect() {} };
    }
    createOscillator() {
      return {
        frequency: parameter(),
        connect() {},
        disconnect() {},
        start() {
          tones++;
        },
        stop() {
          stops++;
        },
      };
    }
  }
  const audio = createGameAudio({ Context }),
    state = world();
  audio.update(state);
  assert.equal(contexts, 0);
  audio.unlock();
  audio.unlock();
  assert.equal(contexts, 1);
  state.tick++;
  state.fighters[0].hp = 80;
  audio.update(state);
  audio.update(state);
  assert.equal(tones, 1);
  audio.setMuted(true);
  state.tick++;
  state.fighters[0].hp = 60;
  audio.update(state);
  assert.equal(tones, 1);
  assert.ok(stops > 0);
  audio.setMuted(false);
  state.tick++;
  state.fighters[0].hp = 40;
  audio.update(state, { paused: true });
  audio.update(state);
  assert.equal(tones, 1, 'resume must not replay sounds observed while paused');
  audio.reset();
  audio.update(world());
  assert.equal(tones, 1);
});
