import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../src/combat.js';
import { createAI, decideAI } from '../src/ai.js';
import { isAttached } from '../src/aerial.js';
import { stickFor } from '../src/stage.js';

test('Terraces requires an intermediate landing when the bot chases between opposite starting perches', () => {
  for (const direction of [-1, 1]) {
    const world = createWorld('terraces'),
      ai = createAI();
    const [player, bot] = world.fighters;
    if (direction < 0) {
      [player.x, bot.x] = [bot.x, player.x];
      [player.air.y, bot.air.y] = [bot.air.y, player.air.y];
    }
    const visited = new Set([stickFor(bot, world.stage)]);
    for (let tick = 0; tick < 2400 && world.status === 'playing' && player.hp === 100; tick++) {
      stepWorld(world, [{}, decideAI(ai, world)]);
      if (isAttached(bot)) visited.add(stickFor(bot, world.stage));
    }
    assert.ok(player.hp < 100, `bot reaches and attacks from direction ${direction}`);
    assert.equal(visited.size, 3, 'crossing requires the center stick before the opposite perch');
    assert.ok(bot.hp > 0);
  }
});
