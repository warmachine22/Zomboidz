export const DIFFICULTIES = {
  easy: {
    name: 'Easy', opening: 50, late: 1320, speedLimit: 2.30,
    crowd: [[2, 3], [5, 7], [11, 13], [20, 24], [35, 37]],
    recycleAfter: 360, recycleInterval: 18, arrivals: 1.38, ambush: [65, 95], ambushSlots: 1,
  },
  standard: {
    name: 'Normal', opening: 40, late: 1080, speedLimit: 2.40,
    crowd: [[3, 4], [8, 10], [15, 18], [27, 31], [38, 41]],
    recycleAfter: 300, recycleInterval: 13, arrivals: 1.12, ambush: [45, 70], ambushSlots: 1,
  },
  hard: {
    name: 'Hard', opening: 30, late: 840, speedLimit: 2.50,
    crowd: [[4, 5], [12, 15], [22, 26], [37, 41], [42, 45]],
    recycleAfter: 180, recycleInterval: 9, arrivals: .83, ambush: [20, 35], ambushSlots: 2,
  },
};

// Keep the original Normal key for saved settings and scoreboards.
export const difficultyKey = value => value === 'easy' || value === 'hard' ? value : 'standard';

export function hordeTarget(time, difficulty = 'standard', roll = .5) {
  const { crowd, late } = DIFFICULTIES[difficultyKey(difficulty)];
  const times = [0, 180, 360, 720, late];
  const choose = ([low, high]) => low + Math.floor(roll * (high - low + 1));
  const end = times.findIndex((checkpoint, i) => i > 0 && time < checkpoint);
  if (end < 0) return choose(crowd.at(-1));
  const start = choose(crowd[end - 1]), finish = choose(crowd[end]);
  const fraction = Math.max(0, time - times[end - 1]) / (times[end] - times[end - 1]);
  return start + Math.floor((finish - start) * fraction);
}

export const pressureTime = run => run.time + (run.arsenal?.wave ?? 0) * 60;

export function activeHordeLimit(run) {
  return Math.min(run.crowdLimit, hordeTarget(pressureTime(run), run.difficulty, run.crowdRoll));
}

export const MODES = { survival: 'Survival', arsenal: 'Arsenal Test', legendary: 'Legendary' };
export const ARSENAL_WAVES = [0, 5, 10, 15, 20];
