# Deuce-to-Seven Single Draw Poker Solver

This project implements a Node.js-based solver for heads-up single-draw Deuce-to-Seven (2-7) lowball poker using Counterfactual Regret Minimization (CFR). The implementation is divided into two main components:

1. **Discard Subgame Solver** - Focuses only on the discard decisions
2. **Full Game Solver** - Includes pre-draw betting, discard phase, and post-draw betting

## Project Structure

- `tests/27lsdByBuilder.js` - Implementation of the discard-only subgame
- `tests/27lsdFullGame.js` - Implementation of the full game with betting rounds

## Requirements

- Node.js (no external ML frameworks required)
- The implementation uses only built-in Node.js modules and the fs/path modules for saving/loading strategies

## How to Run

### Discard Subgame Solver

```bash
node tests/27lsdByBuilder.js [iterations] [saveInterval] [directory]
```

Parameters:
- `iterations` - Number of training iterations (default: 10,000)
- `saveInterval` - How often to save progress (default: 1,000)
- `directory` - Where to save results (default: '.results/discard')

### Full Game Solver

```bash
node tests/27lsdFullGame.js [iterations] [saveInterval] [directory]
```

Parameters:
- `iterations` - Number of training iterations (default: 10,000)
- `saveInterval` - How often to save progress (default: 1,000)
- `directory` - Where to save results (default: '.results/fullgame')

## Implementation Details

### Card Representation

Cards are represented as integers (1-52) mapping to standard deck cards. The mapping is:
- 1-13: 2s-As (spades)
- 14-26: 2h-Ah (hearts)
- 27-39: 2d-Ad (diamonds)
- 40-52: 2c-Ac (clubs)

### Hand Evaluation

In 2-7 lowball, the goal is to have the lowest possible hand with no straights or flushes. Aces are high, and the best possible hand is 7-5-4-3-2 of mixed suits.

The hand evaluator properly ranks hands according to 2-7 lowball rules:
1. High card (best)
2. One pair
3. Two pair
4. Three of a kind
5. Straight
6. Flush
7. Full house
8. Four of a kind
9. Straight flush (worst)

### Discard Actions

Each discard action is represented as a binary number where each bit indicates whether to discard the corresponding card. For example:
- 0 (00000) = Keep all cards
- 1 (00001) = Discard the first card
- 3 (00011) = Discard the first and second cards
- 31 (11111) = Discard all cards

This gives a total of 2^5 = 32 possible discard actions.

### Betting Actions

The betting model uses a simplified limit structure with three possible actions:
- p: pass/check/fold
- b: bet/raise
- c: call

### CFR Implementation

The implementation uses vanilla CFR with:
- Information sets based on player's cards and game history
- Regret tracking for each action
- Strategy computation through regret-matching
- Average strategy calculation for final policy

## Example Output

The solvers will output progress during training and display sample strategies at the end. Strategies are saved to disk and can be loaded for continued training or analysis.

## Extending the Implementation

To modify bet sizing or game rules, adjust the relevant parameters in the code:
- For different betting structures, modify the `getPotSize` and `getValidActions` methods
- For different hand evaluation rules, modify the `evaluateHand` method

## Performance Considerations

The full game solver is computationally intensive. For faster results:
- Start with fewer iterations (e.g., 1,000)
- Use the discard-only solver first to understand basic strategy
- Consider running on a machine with more CPU cores and memory