const { combinations } = require('mathjs');

function calculateWinProbability(hand, opponentDraws) {
  const deck = generateDeck(hand);
  const handRank = rankHand(hand);
  let totalCombinations = 0;
  let winningCombinations = 0;

  // Calculate all possible opponent hands
  for (let i = 0; i < deck.length; i++) {
    const opponentHand = [deck[i]];
    const remainingDeck = deck.filter((_, index) => index !== i);

    const opponentCombos = combinations(remainingDeck.length, opponentDraws - 1);
    totalCombinations += opponentCombos;

    for (let j = 0; j < remainingDeck.length; j++) {
      if (opponentDraws === 1) {
        const fullOpponentHand = [...opponentHand, remainingDeck[j]];
        if (rankHand(fullOpponentHand) > handRank) {
          winningCombinations += 1;
        }
      } else {
        // For opponent drawing more than 1 card, recursive calculation needed
        // This is a simplified version and may not be fully accurate
        const subDeck = remainingDeck.filter((_, index) => index !== j);
        winningCombinations += calculateWinProbability([...opponentHand, remainingDeck[j]], opponentDraws - 1).winningCombinations;
      }
    }
  }

  const winProbability = 1 - (winningCombinations / totalCombinations);
  return { winProbability, winningCombinations, totalCombinations };
}

function generateDeck(excludedCards) {
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
  const suits = ['h', 'd', 'c', 's'];
  const deck = [];

  for (const rank of ranks) {
    for (const suit of suits) {
      const card = rank + suit;
      if (!excludedCards.includes(card)) {
        deck.push(card);
      }
    }
  }

  return deck;
}

function rankHand(hand) {
  // This is a simplified ranking function for deuce to seven lowball
  // Lower rank is better in this game
  const ranks = hand.map(card => {
    const rank = card[0];
    return rank === 'A' ? 14 : (rank === 'T' ? 10 : (rank === 'J' ? 11 : (rank === 'Q' ? 12 : (rank === 'K' ? 13 : parseInt(rank)))));
  });
  
  return Math.max(...ranks) * 100 + ranks.reduce((a, b) => a + b, 0);
}

// Example usage
const hand = ['2h', '3d', '4s', '7c', '8h'];
const opponentDraws = 1;
const result = calculateWinProbability(hand, opponentDraws);

console.log(`Win Probability: ${result.winProbability.toFixed(4)}`);
console.log(`Winning Combinations: ${result.winningCombinations}`);
console.log(`Total Combinations: ${result.totalCombinations}`);