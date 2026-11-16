export const DIFFICULTIES = {
  standard: { name: 'Standard', opening: 30, middle: 300, maximum: 540, ambush: [45, 70], ambushSlots: 1, arrivals: 1 },
  hard: { name: 'Hard', opening: 18, middle: 210, maximum: 390, ambush: [20, 35], ambushSlots: 2, arrivals: .83 },
};

export const difficultyKey = value => value === 'hard' ? 'hard' : 'standard';
