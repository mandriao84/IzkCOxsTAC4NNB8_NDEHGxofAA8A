const calculateTripleDrawProbability = (rounds = 3) => {
    const totalCards = 52;
    const initialHandSize = 5;
    const lowCards = 16; // 4 each of 3, 4, 5, 6

    const calculateSingleDrawProbability = () => {
        const remainingCards = totalCards - initialHandSize; // 52 - 5 = 47
        const p1 = lowCards / remainingCards;
        const p2 = (lowCards - 1) / (remainingCards - 1);
        const p3 = (lowCards - 2) / (remainingCards - 2);
        return p1 * p2 * p3;
    };

    const singleDrawProbability = calculateSingleDrawProbability();
    console.log(`Probability of drawing three low cards in one round: ${(singleDrawProbability * 100).toFixed(4)}%`);

    const probabilityOfFailureInOneRound = 1 - singleDrawProbability;
    const probabilityOfFailureInAllRounds = Math.pow(probabilityOfFailureInOneRound, rounds);
    const probabilityOfSuccess = 1 - probabilityOfFailureInAllRounds;

    return probabilityOfSuccess;
};

// const probability = calculateTripleDrawProbability(3);
// console.log(`The probability of drawing three low cards in at least one of 3 rounds is approximately ${(probability * 100).toFixed(2)}%`);

const calculateAndLogProbabilities = (maxRounds = 3) => {
    console.log(`Probability of drawing three low cards in one round: ${(calculateTripleDrawProbability(1).singleDrawProbability * 100).toFixed(4)}%`);
    console.log("\nProbabilities for multiple rounds:");
    
    for (let i = 1; i <= maxRounds; i++) {
        const probabilityOfSuccess = calculateTripleDrawProbability(i);
        console.log(`- In at least one of ${i} round${i > 1 ? 's' : ''}: ${(probabilityOfSuccess * 100).toFixed(2)}%`);
    }
};

calculateAndLogProbabilities(5);