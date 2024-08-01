const getDrawsProbability = (numberOfRoundsLeft, numberOfCardsDiscarded, numberOfCardsDesired) => {
    const cardsTotal = 52;
    const handSize = 5;

    // probability of drawing X cards in a single draw
    const getDrawProbability = (numberOfCardsDiscarded) => { 
        const cardsLeft = cardsTotal - handSize - numberOfCardsDiscarded;

        // // probability of drawing 1 card | ex: 16/47
        // const p1 = numberOfCardsDesired / cardsLeft;
        // // probability of drawing 2 cards | ex: 15/46
        // const p2 = (numberOfCardsDesired - 1) / (cardsLeft - 1);
        // // probability of drawing 3 cards | ex: 14/45
        // const p3 = (numberOfCardsDesired - 2) / (cardsLeft - 2);
        // return p1 * p2 * p3;

        let result = 1;
        for (let i = 0; i < numberOfCardsDiscarded; i++) { 
            const p = (numberOfCardsDesired - i) / (cardsLeft - i);
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


const numberOfRoundsLeft = 1;
const numberOfCardsDiscarded = 2;
const numberOfCardsDesired = 28; // 4 each of 3, 4, 5, 6
for (let i = 1; i <= numberOfRoundsLeft; i++) {
    const probabilityOfSuccess = getDrawsProbability(i, numberOfCardsDiscarded, numberOfCardsDesired);
    console.log(`- Probability to draw ${numberOfCardsDiscarded} desired cards in ${i} round${i > 1 ? 's' : ''}: ${(probabilityOfSuccess * 100).toFixed(2)}%`);
}