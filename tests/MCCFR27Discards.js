const DECK = {
    1: '2s', 2: '3s', 3: '4s', 4: '5s', 5: '6s', 6: '7s', 7: '8s', 8: '9s', 9: '10s', 10: 'Js', 11: 'Qs', 12: 'Ks', 13: 'As',
    14: '2h', 15: '3h', 16: '4h', 17: '5h', 18: '6h', 19: '7h', 20: '8h', 21: '9h', 22: '10h', 23: 'Jh', 24: 'Qh', 25: 'Kh', 26: 'Ah',
    27: '2d', 28: '3d', 29: '4d', 30: '5d', 31: '6d', 32: '7d', 33: '8d', 34: '9d', 35: '10d', 36: 'Jd', 37: 'Qd', 38: 'Kd', 39: 'Ad',
    40: '2c', 41: '3c', 42: '4c', 43: '5c', 44: '6c', 45: '7c', 46: '8c', 47: '9c', 48: '10c', 49: 'Jc', 50: 'Qc', 51: 'Kc', 52: 'Ac'
};
const CARDS = { 'A': 13, 'K': 12, 'Q': 11, 'J': 10, '10': 9, '9': 8, '8': 7, '7': 6, '6': 5, '5': 4, '4': 3, '3': 2, '2': 1 };
const cardsLength = Object.keys(CARDS).length

const getArrayShuffled = (array) => {
    for (let c1 = array.length - 1; c1 > 0; c1--) {
        let c2 = Math.floor(Math.random() * (c1 + 1));
        let tmp = array[c1];
        array[c1] = array[c2];
        array[c2] = tmp;
    }
    return array;
};

const getHandsDealed = (deck, cardsNumberPerHand, handsNumber) => {
    const hands = Array.from({ "length": handsNumber }, () => []);
    for (let i = 0; i < cardsNumberPerHand; i++) {
        for (let j = 0; j < handsNumber; j++) {
            hands[j].push(deck.pop());
        }
    }
    return hands;
};

const getHandSorted = (hand) => {
    const getCardRank = (card) => card.slice(0, -1);
    const getCardValue = (card) => CARDS[getCardRank(card)];
    const getCardSuit = (card) => card.slice(-1);
    const cardsValue = hand.map(getCardValue).sort((a, b) => a - b);
    const cardsSuit = hand.map(getCardSuit).sort((a, b) => a - b);
    const straightWithAs = [13, 1, 2, 3, 4];
    const isStraightWithAs = straightWithAs.every(v => cardsValue.includes(v));

    hand.sort((a, b) => {
        const cardValueA = getCardValue(a);
        const cardValueB = getCardValue(b);
        if (isStraightWithAs) {
            if (cardValueA === 13) return -1;
            if (cardValueB === 13) return 1;
        }
        return cardValueA - cardValueB;
    });

    return { hand, cardsValue, cardsSuit };
}

const getHandScore = (hand) => {
    function getHandScoreBelowPair(cardsValueDesc, cardsValueMax = [6, 4, 3, 2, 1], cardsValueMin = [13, 12, 11, 10, 8]) {
        const multiplier = cardsLength + 1

        let raw = 0;
        for (let i = 0; i < cardsValueDesc.length; i++) {
            raw = raw * multiplier + cardsValueDesc[i];
        }

        let bestRaw = 0, worstRaw = 0;
        for (let i = 0; i < cardsValueDesc.length; i++) {
            bestRaw = bestRaw * multiplier + cardsValueMax[i];
            worstRaw = worstRaw * multiplier + cardsValueMin[i];
        }

        const range = worstRaw - bestRaw;
        let score;
        if (range === 0) {
            score = 1;
        } else {
            score = 1 + Math.round((raw - bestRaw) * (9998 / range));
            if (score < 1) { score = 1; }
            if (score > 9999) { score = 9999; }
        }
        return score;
    }

    var { hand: handSorted, cardsValue, cardsSuit } = getHandSorted([...hand]);
    cardsValue = cardsValue.sort((a, b) => b - a);
    const straightWithAs = [13, 1, 2, 3, 4];
    const isStraightWithAs = straightWithAs.every(v => cardsValue.includes(v));
    if (isStraightWithAs) { cardsValue = [0, 1, 2, 3, 4]; }

    const isStraight = cardsValue.every((val, index, arr) => index === 0 || val === arr[index - 1] + 1)
    const isFlush = new Set(cardsSuit).size === 1

    const cardCounts = cardsValue.reduce((acc, rank) => {
        acc[rank] = (acc[rank] || 0) + 1;
        return acc
    }, {})

    let score = 0
    const multiplier = cardsLength + 1
    const countValues = Object.values(cardCounts).sort((a, b) => b - a);
    if (isStraight && isFlush) {
        score = 80000 + cardsValue.at(0);
    } else if (countValues[0] === 4) {
        score = 70000 + cardsValue.at(0);
    } else if (countValues[0] === 3 && countValues[1] === 2) {
        score = 60000 + cardsValue.at(0);
    } else if (isFlush) {
        score = 50000 + cardsValue.at(0);
    } else if (isStraight) {
        score = 40000 + cardsValue.at(0);
    } else if (countValues[0] === 3) {
        score = 30000 + cardsValue.at(0);
    } else if (countValues[0] === 2 && countValues[1] === 2) {
        const rankMultiples = Object.keys(cardCounts).filter(r => cardCounts[r] === 2).sort((a, b) => b - a);
        score = 20000 + (Number(rankMultiples.at(0)) * multiplier * multiplier) + (Number(rankMultiples.at(1)) * multiplier) + cardsValue.at(-1);
    } else if (countValues[0] === 2) {
        const rankMultiples = Object.keys(cardCounts).filter(r => cardCounts[r] === 2).sort((a, b) => b - a);
        score = 10000 + (Number(rankMultiples.at(0)) * multiplier) + cardsValue.at(-1) + cardsValue.at(-2) + cardsValue.at(-3);
    } else {
        score = getHandScoreBelowPair(cardsValue);
    }

    return score
}

// Generates all combinations of k elements from an array
const getAllCombinationsPossible = (arr, k) => {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [first, ...rest] = arr;
    const withFirst = getAllCombinationsPossible(rest, k - 1).map(c => [first, ...c]);
    const withoutFirst = getAllCombinationsPossible(rest, k);
    return [...withFirst, ...withoutFirst];
}

// Simulates discarding specific cards and drawing replacements
function simulateDiscard(playerHand, discardIndices, remainingDeck, numSimulations = 1000) {
    const keptCards = playerHand.filter((_, idx) => !discardIndices.includes(idx));
    const numDraw = discardIndices.length;

    let totalScore = 0;
    for (let i = 0; i < numSimulations; i++) {
        const deckCopy = [...remainingDeck];
        getArrayShuffled(deckCopy);
        const drawnCards = deckCopy.slice(0, numDraw);
        const newHand = [...keptCards, ...drawnCards];
        totalScore += getHandScore(newHand);
    }

    return totalScore / numSimulations;
}

/**
 * Enumerate all possible ways to draw `discardIndices.length` cards from `remainingDeck`,
 * calculate average final hand score. No random simulation.
 */
function enumerateDiscard(playerHand, discardIndices, remainingDeck) {
    // which cards we keep from the original 5
    const keptCards = playerHand.filter((_, idx) => !discardIndices.includes(idx));
    const numDraw = discardIndices.length;

    if (numDraw === 0) {
        // if discarding 0, there's exactly one final hand: the original
        return getHandScore(playerHand);
    }

    // get all combos of 'numDraw' from the remaining deck
    const drawCombos = getAllCombinationsPossible(remainingDeck, numDraw);

    let totalScore = 0;
    for (const drawSet of drawCombos) {
        const newHand = [...keptCards, ...drawSet];
        totalScore += getHandScore(newHand);
    }
    return totalScore / drawCombos.length; // average
}

// Estimates the best discard strategy by evaluating all combinations
function estimateBestDiscard(playerHand, remainingDeck, numSimulations = 10000000) {
    const results = {};
    let bestScore = Infinity;
    let bestDiscard = null;
    let bestCombination = null;

    for (let numDraw = 0; numDraw <= 5; numDraw++) {
        const allCombinations = getAllCombinationsPossible([...Array(5).keys()], numDraw);
        let minScoreForNumDraw = Infinity;
        let bestCombinationForNumDraw = null;

        for (const discardIndices of allCombinations) {
            // const avgScore = simulateDiscard(playerHand, discardIndices, remainingDeck, numSimulations);
            const avgScore = enumerateDiscard(playerHand, discardIndices, remainingDeck);
            if (avgScore < minScoreForNumDraw) {
                minScoreForNumDraw = avgScore;
                bestCombinationForNumDraw = discardIndices;
            }
        }

        results[numDraw] = minScoreForNumDraw;

        if (minScoreForNumDraw < bestScore) {
            bestScore = minScoreForNumDraw;
            bestDiscard = numDraw;
            bestCombination = bestCombinationForNumDraw;
        }
    }

    const bestDiscardedCards = bestCombination.map(idx => playerHand[idx]);

    return { bestDiscard, bestDiscardedCards, results };
}

// Example usage
const fullDeck = Object.values(DECK);
getArrayShuffled(fullDeck);
const hands = getHandsDealed(fullDeck, 5, 1);
const playerHand = hands[0];
const remainingDeck = fullDeck.filter(card => !playerHand.includes(card));

console.log(`Player's hand: ${playerHand.join(', ')}`);

const { bestDiscard, bestDiscardedCards, results } = estimateBestDiscard(playerHand, remainingDeck);
console.log('Average hand scores for each discard choice:');
for (const [discardCount, avgScore] of Object.entries(results)) {
    console.log(`Discard ${discardCount} cards: ${avgScore.toFixed(2)}`);
}
console.log(`Best discard choice: ${bestDiscard} cards`);
console.log(`Best cards to discard: ${bestDiscardedCards.join(', ')}`);