import { HIT_ANCHORS } from './hit-anchors.js';
import { clamp } from './world.js';

export const HIT_SEGMENTS = [
  [0, 1, 'head'], [2, 3, 'body'],
  [4, 5, 'arm'], [5, 6, 'arm'], [7, 8, 'leg'], [8, 9, 'leg'],
  [10, 11, 'arm'], [11, 12, 'arm'], [13, 14, 'leg'], [14, 15, 'leg'],
];

export function enemyMotion(enemy, windupSeconds) {
  const gait = (enemy.gait / (Math.PI * 2)) % 1;
  const attacking = enemy.windup > 0;
  const attack = attacking ? .94 : enemy.recover > .34 ? .56 * clamp((enemy.recover - .34) / .25, 0, 1) : 0;
  const hit = Math.min(1 - attack, enemy.stun * 4.8);
  const stumble = enemy.stumble > 0 ? clamp(1 - enemy.stumble / enemy.stumbleDuration, 0, 1) : 0;
  const stumbleWeight = (1 - attack - hit) * Math.sin(Math.PI * stumble) ** .56;
  return [
    ['Walk', gait, Math.max(0, 1 - attack - hit - stumbleWeight)],
    ['Stumble', stumble, stumbleWeight],
    ['Attack', attacking ? .05 + .50 * (1 - enemy.windup / windupSeconds)
      : .55 + .38 * clamp((1.13 - enemy.recover) / .79, 0, 1), attack],
    ['Hit', clamp((.15 - enemy.stun) * 5.4, 0, .94), hit],
  ];
}

export function animatedAnchors(enemy, windup, count = 16) {
  const { clips } = HIT_ANCHORS[enemy.kind];
  const pose = new Float32Array(count * 3);
  for (const [name, phase, weight] of enemyMotion(enemy, windup)) {
    if (weight <= 0) continue;
    const samples = clips[name], frame = clamp(phase, 0, 1) * (samples.length - 1);
    const first = Math.floor(frame), blend = frame - first;
    const a = samples[first], b = samples[Math.min(first + 1, samples.length - 1)];
    for (let i = 0; i < pose.length; i++) pose[i] += weight * (a[i] + (b[i] - a[i]) * blend);
  }
  // The authored mesh faces +Z. The renderer applies the same half-turn as this conversion.
  const c = Math.cos(enemy.yaw), s = Math.sin(enemy.yaw);
  const points = [];
  for (let i = 0; i < pose.length; i += 3) {
    const x = pose[i], z = pose[i + 2];
    points.push({ x: enemy.x - c*x + s*z, y: enemy.y + pose[i + 1], z: enemy.z - s*x - c*z });
  }
  return points;
}

export const hitRadii = kind => HIT_ANCHORS[kind].radii;
