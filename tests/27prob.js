const calculateTripleDrawProbability = (rounds = 3) => {
    const totalCards = 52;
    const initialHandSize = 5;
    const lowCards = 16; // 4 each of 3, 4, 5, 6

    const getProbabilityOfSingleDraw = () => {
        const remainingCards = totalCards - initialHandSize; // 52 - 5 = 47
        const p1 = lowCards / remainingCards;
        const p2 = (lowCards - 1) / (remainingCards - 1);
        const p3 = (lowCards - 2) / (remainingCards - 2);
        return p1 * p2 * p3;
    };

    const probabilityOfSingleDraw = getProbabilityOfSingleDraw();
    const probabilityOfFailureInOneRound = 1 - probabilityOfSingleDraw;
    const probabilityOfFailureInAllRounds = Math.pow(probabilityOfFailureInOneRound, rounds);
    const probabilityOfSuccess = 1 - probabilityOfFailureInAllRounds;

    return probabilityOfSuccess;
};

const calculateAndLogProbabilities = (maxRounds = 3) => {
    console.log("\nProbabilities for multiple rounds:");
    for (let i = 1; i <= maxRounds; i++) {
        const probabilityOfSuccess = calculateTripleDrawProbability(i);
        console.log(`- In at least one of ${i} round${i > 1 ? 's' : ''}: ${(probabilityOfSuccess * 100).toFixed(2)}%`);
    }
};

calculateAndLogProbabilities(5);