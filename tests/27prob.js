const getDrawsProbability = (numberOfRoundsLeft, numberOfCardsToDraw) => {
    const cardsTotal = 52;
    const handSize = 5;

    // probability of single draw : 16/47 * 15/46 * 14/45
    const getDrawProbability = () => { 
        const cardsLeft = cardsTotal - handSize;
        const p1 = numberOfCardsToDraw / cardsLeft;
        const p2 = (numberOfCardsToDraw - 1) / (cardsLeft - 1);
        const p3 = (numberOfCardsToDraw - 2) / (cardsLeft - 2);
        return p1 * p2 * p3;
    };

    const probabilityOfSingleDraw = getDrawProbability();
    const probabilityOfFailureInOneRound = 1 - probabilityOfSingleDraw;
    const probabilityOfFailureInAllRounds = Math.pow(probabilityOfFailureInOneRound, numberOfRoundsLeft);
    const probabilityOfSuccess = 1 - probabilityOfFailureInAllRounds;

    return probabilityOfSuccess;
};


const numberOfRoundsLeft = 3;
const numberOfCardsToDraw = 16; // 4 each of 3, 4, 5, 6
for (let i = 1; i <= numberOfRoundsLeft; i++) {
    const probabilityOfSuccess = getDrawsProbability(i, numberOfCardsToDraw);
    console.log(`- Probability to draw in ${i} round${i > 1 ? 's' : ''}: ${(probabilityOfSuccess * 100).toFixed(2)}%`);
}