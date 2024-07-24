const getDrawsProbability = (numberOfRoundsLeft, numberOfCardsDiscarded, numberOfCardsLeft) => {
    const cardsTotal = 52;
    const handSize = 5;

    // probability of drawing X cards in a single draw
    const getDrawProbability = (numberOfCardsDiscarded) => { 
        const cardsLeft = cardsTotal - handSize;

        // // probability of drawing 1 card | ex: 16/47
        // const p1 = numberOfCardsLeft / cardsLeft;
        // // probability of drawing 2 cards | ex: 15/46
        // const p2 = (numberOfCardsLeft - 1) / (cardsLeft - 1);
        // // probability of drawing 3 cards | ex: 14/45
        // const p3 = (numberOfCardsLeft - 2) / (cardsLeft - 2);
        // return p1 * p2 * p3;

        let result = 1;
        for (let i = 0; i < numberOfCardsDiscarded; i++) { 
            const p = (numberOfCardsLeft - i) / (cardsLeft - i);
            // result = result ? result * p : p;
            result *= p;
        }
        return result
    };

    const probabilityOfSingleDraw = getDrawProbability(numberOfCardsDiscarded);
    const probabilityOfFailureInOneRound = 1 - probabilityOfSingleDraw;
    const probabilityOfFailureInAllRounds = Math.pow(probabilityOfFailureInOneRound, numberOfRoundsLeft);
    const probabilityOfSuccess = 1 - probabilityOfFailureInAllRounds;

    return probabilityOfSuccess;
};


const numberOfRoundsLeft = 3;
const numberOfCardsDiscarded = 0;
const numberOfCardsLeft = 16; // 4 each of 3, 4, 5, 6
for (let i = 1; i <= numberOfRoundsLeft; i++) {
    const probabilityOfSuccess = getDrawsProbability(i, numberOfCardsDiscarded, numberOfCardsLeft);
    console.log(`- Probability to draw in ${i} round${i > 1 ? 's' : ''}: ${(probabilityOfSuccess * 100).toFixed(2)}%`);
}