export const DIFFICULTIES = {
  standard: { name: 'Standard', opening: 45, middle: 390, maximum: 660, ambush: [45, 70], ambushSlots: 1, arrivals: 1.12 },
  hard: { name: 'Hard', opening: 18, middle: 210, maximum: 390, ambush: [20, 35], ambushSlots: 2, arrivals: .83 },
};

export const difficultyKey = value => value === 'hard' ? 'hard' : 'standard';
