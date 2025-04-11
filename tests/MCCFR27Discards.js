const fs = require('fs');
const PATH_RESULTS = '.results/mccfr/strategies.ndjson';
const DECK = {
    1: '2s', 2: '3s', 3: '4s', 4: '5s', 5: '6s', 6: '7s', 7: '8s', 8: '9s', 9: '10s', 10: 'Js', 11: 'Qs', 12: 'Ks', 13: 'As',
    14: '2h', 15: '3h', 16: '4h', 17: '5h', 18: '6h', 19: '7h', 20: '8h', 21: '9h', 22: '10h', 23: 'Jh', 24: 'Qh', 25: 'Kh', 26: 'Ah',
    27: '2d', 28: '3d', 29: '4d', 30: '5d', 31: '6d', 32: '7d', 33: '8d', 34: '9d', 35: '10d', 36: 'Jd', 37: 'Qd', 38: 'Kd', 39: 'Ad',
    40: '2c', 41: '3c', 42: '4c', 43: '5c', 44: '6c', 45: '7c', 46: '8c', 47: '9c', 48: '10c', 49: 'Jc', 50: 'Qc', 51: 'Kc', 52: 'Ac'
};
const CARDS = { 'A': 13, 'K': 12, 'Q': 11, 'J': 10, '10': 9, '9': 8, '8': 7, '7': 6, '6': 5, '5': 4, '4': 3, '3': 2, '2': 1 };
const cardsLength = Object.keys(CARDS).length

Number.prototype.safe = function (method = "FLOOR", decimals = 2) {
    method = method.toUpperCase();
    if (!["ROUND", "FLOOR", "CEIL"].includes(method)) {
        throw new Error("Number.prototype.safe.method.Error: ['round', 'floor', 'ceil']");
    }
    if (typeof decimals !== "number" || decimals < 0 || !Number.isInteger(decimals)) {
        throw new Error("Number.prototype.safe.decimals.Error: ['number', 'isInteger', '>=0']");
    }

    const factor = Math.pow(10, decimals);
    const value = this.valueOf();

    switch (method) {
        case "ROUND":
            return Math.round((value + Number.EPSILON) * factor) / factor;
        case "FLOOR":
            return Math.floor((value + Number.EPSILON) * factor) / factor;
        case "CEIL":
            return Math.ceil((value - Number.EPSILON) * factor) / factor;
    }
};

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

    return score;
}





const getAllCombinationsPossible = (arr, k) => {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [first, ...rest] = arr;
    const withFirst = getAllCombinationsPossible(rest, k - 1).map(c => [first, ...c]);
    const withoutFirst = getAllCombinationsPossible(rest, k);
    return [...withFirst, ...withoutFirst];
}





function getDiscardsMCSimulated(hand, discardIndices, deckLeft, simulationNumber = 1000) {
    const handKept = hand.filter((_, idx) => !discardIndices.includes(idx));
    const discardNumber = discardIndices.length;

    let score = 0;
    for (let i = 0; i < simulationNumber; i++) {
        const deck = [...deckLeft];
        getArrayShuffled(deck);
        const cardsReceived = deck.slice(0, discardNumber);
        const handNew = [...handKept, ...cardsReceived];
        score += getHandScore(handNew);
    }

    const scoreFinal = score / simulationNumber.length;
    return scoreFinal.safe("ROUND", 3);
}





const getDiscardsEnumerated = (hand, discardIndices, deckLeft) => {
    const handKept = hand.filter((_, index) => !discardIndices.includes(index));
    const discardNumber = discardIndices.length;

    if (discardNumber === 0) {
        return getHandScore(hand);
    }

    const allCombinationsPossible = getAllCombinationsPossible(deckLeft, discardNumber);

    let score = 0;
    for (const cardsReceived of allCombinationsPossible) {
        const handNew = [...handKept, ...cardsReceived];
        score += getHandScore(handNew);
    }

    const scoreFinal = score / allCombinationsPossible.length;
    return scoreFinal.safe("ROUND", 3);
}





const getDiscardsDetails = (hand, deckLeft, simulationNumber) => {
    const results = {};
    let score = Infinity;
    let index = null;
    let cards = null;

    for (let discardNumber = 0; discardNumber <= 5; discardNumber++) {
        const allCombinations = getAllCombinationsPossible([...Array(5).keys()], discardNumber);
        let scoreByDiscardNumber = Infinity;
        let cardsByDiscardNumber = null;

        for (const discardIndices of allCombinations) {
            let scoreAverage;
            if (simulationNumber) {
                scoreAverage = getDiscardsMCSimulated(hand, discardIndices, deckLeft, simulationNumber);
            } else {
                scoreAverage = getDiscardsEnumerated(hand, discardIndices, deckLeft);
            }
            
            if (scoreAverage < scoreByDiscardNumber) {
                scoreByDiscardNumber = scoreAverage;
                cardsByDiscardNumber = discardIndices;
            }
        }

        results[discardNumber] = scoreByDiscardNumber;

        if (scoreByDiscardNumber < score) {
            score = scoreByDiscardNumber;
            index = discardNumber;
            cards = cardsByDiscardNumber;
        }
    }

    results.cards = cards.map(index => hand[index]);
    results.index = index;
    results.round = 1;

    return results;
}





const getDataComputedForOneRound = async (simulationNumber = 10000) => {
    let fd;
    let exit = false;

    const cleanupHandler = () => {
        if (fd) {
            fs.closeSync(fd);
            fd = null;
        }
    };

    const exitHandler = (event, error) => {
        if (error) {
            console.error(`getDataComputedForOneRound.Error.${event}:`, error);
        } else {
            console.log(`getDataComputedForOneRound.Exit.${event}`);
        }
        exit = true;
    };

    ['SIGINT', 'SIGTERM', 'SIGQUIT', 'uncaughtException', 'unhandledRejection'].forEach((signal) => {
        process.once(signal, (error) => exitHandler(signal, error));
    });

    try {
        const isPathExists = fs.existsSync(PATH_RESULTS);
        const data = new Set();

        if (isPathExists) {
            const content = fs.readFileSync(PATH_RESULTS, 'utf8');
            content.split('\n').forEach((line) => {
                if (line.trim()) {
                    const entry = JSON.parse(line);
                    data.add(entry.key);
                }
            });
        }

        fd = fs.openSync(PATH_RESULTS, 'a+');

        for (let i = 0; i < simulationNumber; i++) {
            if (exit) {
                console.log('getDataComputedForOneRound.ExitEarly');
                break;
            }

            const deck = Object.values(DECK);
            getArrayShuffled(deck);
            const hands = getHandsDealed(deck, 5, 1);
            const hand = hands[0];
            const { hand: handSorted } = getHandSorted([...hand]);
            const key = handSorted.join('');

            if (!data.has(key)) {
                const result = getDiscardsDetails(hand, deck);
                result.key = key;
                const entry = JSON.stringify(result) + '\n';
                data.add(key);
                fs.appendFileSync(fd, entry);
                console.log(`getDataComputedForOneRound.Iteration.${i}.Done\n>> ${entry}`);
            }

            await new Promise((resolve) => setImmediate(resolve));
        }
    } finally {
        cleanupHandler();
    }
};

(async () => {
    await getDataComputedForOneRound();
})();



// function estimateBestDiscardMulti(hand, remainingDeck, roundsLeft = 1) {
//     // Base case: return final hand score when no more rounds
//     if (roundsLeft <= 0) {
//         return {
//             score: getHandScore(hand),
//             discards: []
//         };
//     }

//     let bestScore = Infinity;
//     let bestDiscard = null;
//     const results = {};

//     // Consider all possible discard counts (0-5)
//     for (let numDraw = 0; numDraw <= 5; numDraw++) {
//         const allDiscardCombos = getAllCombinationsPossible([...Array(5).keys()], numDraw);
//         let minScoreForNumDraw = Infinity;
//         let bestComboForNumDraw = null;

//         // Evaluate each discard combination
//         for (const discardIndices of allDiscardCombos) {
//             let totalScore = 0;
//             const samples = 1000; // Reduce for faster but less accurate results
            
//             // Monte Carlo simulation for card draws
//             for (let i = 0; i < samples; i++) {
//                 const deckCopy = [...remainingDeck];
//                 getArrayShuffled(deckCopy);
                
//                 // Draw new cards
//                 const drawnCards = deckCopy.splice(0, numDraw);
//                 const newHand = hand.filter((_, idx) => !discardIndices.includes(idx)).concat(drawnCards);
//                 const newRemaining = deckCopy;
                
//                 // Recursive call for next round
//                 const nextRound = estimateBestDiscardMulti(newHand, newRemaining, roundsLeft - 1);
//                 totalScore += nextRound.score;
//             }
            
//             const avgScore = totalScore / samples;
//             if (avgScore < minScoreForNumDraw) {
//                 minScoreForNumDraw = avgScore;
//                 bestComboForNumDraw = discardIndices;
//             }
//         }

//         // Track best discard count
//         results[numDraw] = minScoreForNumDraw;
//         if (minScoreForNumDraw < bestScore) {
//             bestScore = minScoreForNumDraw;
//             bestDiscard = {
//                 count: numDraw,
//                 indices: bestComboForNumDraw,
//                 cards: bestComboForNumDraw.map(idx => hand[idx])
//             };
//         }
//     }

//     return {
//         score: bestScore,
//         rounds: roundsLeft,
//         bestDiscard,
//         results
//     };
// }

// const fullDeck = Object.values(DECK);
// getArrayShuffled(fullDeck);
// const hands = getHandsDealed(fullDeck, 5, 1);
// const playerHand = hands[0];
// const remainingDeck = fullDeck.filter(card => !playerHand.includes(card));

// console.log(`Player's hand: ${playerHand.join(', ')}`);

// const result = estimateBestDiscardMulti(playerHand, remainingDeck, 2);
// console.log(`Optimal strategy for ${result.rounds} rounds:`);
// console.log(`Discard ${result.bestDiscard.count} cards: ${result.bestDiscard.cards.join(', ')}`);
// console.log(`Projected final score: ${result.score.toFixed(1)}`);


// const deck = Object.values(DECK);
// getArrayShuffled(deck);
// const hands = getHandsDealed(deck, 5, 1);
// const hand = hands[0];
// console.log(`Player's hand: ${hand.join(', ')}`);
// const results = getDiscardsDetails(hand, deck);
// console.log(results)