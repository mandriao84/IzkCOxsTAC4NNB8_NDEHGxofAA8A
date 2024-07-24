const DECK = {
    1: '2s', 2: '3s', 3: '4s', 4: '5s', 5: '6s', 6: '7s', 7: '8s', 8: '9s', 9: 'Ts', 10: 'Js', 11: 'Qs', 12: 'Ks', 13: 'As',
    14: '2h', 15: '3h', 16: '4h', 17: '5h', 18: '6h', 19: '7h', 20: '8h', 21: '9h', 22: 'Th', 23: 'Jh', 24: 'Qh', 25: 'Kh', 26: 'Ah',
    27: '2d', 28: '3d', 29: '4d', 30: '5d', 31: '6d', 32: '7d', 33: '8d', 34: '9d', 35: 'Td', 36: 'Jd', 37: 'Qd', 38: 'Kd', 39: 'Ad',
    40: '2c', 41: '3c', 42: '4c', 43: '5c', 44: '6c', 45: '7c', 46: '8c', 47: '9c', 48: 'Tc', 49: 'Jc', 50: 'Qc', 51: 'Kc', 52: 'Ac'
};
const CARDS = { 'A': 13, 'K': 12, 'Q': 11, 'J': 10, 'T': 9, '9': 8, '8': 7, '7': 6, '6': 5, '5': 4, '4': 3, '3': 2, '2': 1 };

function getDeck(cardsExcluded) {
    const deck = Object.keys(DECK);
    let result = deck.filter(c => !cardsExcluded.includes(c));
    return result;
}

function getProbability(hand, opponentCardsDiscardNumber) {
    const deck = getDeck(hand);
    let combinationsCount = 0;
    let combinationsLoseCount = 0;

    const opponentHands = combinations(deck, 5 - opponentCardsDiscardNumber);

    for (const opponentHand of opponentHands) {
        const deckNew = deck.filter(card => !opponentHand.includes(card));
        if (opponentCardsDiscardNumber === 0) {
            combinationsCount++;

            const winner = getWinner(hand, opponentHand);
            if (winner === 'OPPONENT') {
                combinationsLoseCount++;
            }

        } else {
            const opponentHandsDrawn = combinations(deckNew, opponentCardsDiscardNumber);
            for (const opponentHandDrawn of opponentHandsDrawn) {
                const opponentHandNew = [...opponentHand, ...opponentHandDrawn];
                combinationsCount++;

                const winner = getWinner(hand, opponentHandNew);
                // console.log(winner, hand.map(i => DECK[i]), opponentHandNew.map(i => DECK[i]));
                if (winner === 'OPPONENT') {
                    combinationsLoseCount++;
                }
            }

        }
    }

    const combinationsWinCount = combinationsCount - combinationsLoseCount;
    const probabilityWin = combinationsWinCount / combinationsCount;

    return {
        "probabilityWin": probabilityWin,
        "combinationsWinCount": combinationsWinCount,
        "combinationsCount": combinationsCount
    };
}

function getHandTranslated(hand) {
    const handTranslated = hand.map(i => DECK[i]);
    const handTranslatedSorted = handTranslated.sort((a, b) => {
        const c1 = CARDS[a[0]];
        const c2 = CARDS[b[0]];
        return c1 - c2;
    });

    // return handTranslatedSorted.map(r => r.slice(0, 1) + 'x') // temporary for bypassing flush
    return handTranslatedSorted;
}


function getWinner(playerHand, opponentHand) {
    function getSameCards(handRanks) {
        const cardCounts = handRanks.reduce((acc, card) => {
            acc[card] = (acc[card] || 0) + 1;
            return acc;
        }, {});

        const cardCountsAsArray = Object.entries(cardCounts);

        cardCountsAsArray.sort((a, b) => {
            if (b[1] !== a[1]) {
                return b[1] - a[1]; // by count (descending)
            } else {
                return CARDS[b[0]] - CARDS[a[0]]; // by value (descending)
            }
        });

        const result = cardCountsAsArray.map(([card, count]) => {
            return count > 1 ? `${card}_${count}` : card;
        });

        return result;
    }

    function hasNotSame(handRanks) {
        const ranksUniq = new Set(handRanks)
        return ranksUniq.size == handRanks.length;
    }

    function isStraightByHandRanksValueSorted(handRanksValueSorted) {
        for (let i = 1; i < handRanksValueSorted.length; i++) {
            if (handRanksValueSorted[i] !== handRanksValueSorted[i - 1] + 1) {
                return false;
            }
        }
        return true;
    }

    function isNotStraight(handRanks) {
        const handRanksValue = handRanks.map(r => CARDS[r]);
        const handRanksValueSorted = handRanksValue.sort((a, b) => a - b);
        const isStraightWithAceHigh = isStraightByHandRanksValueSorted(handRanksValueSorted);

        if (handRanks.includes('A')) {
            const handRanksValueWithAceLow = handRanksValue.map(v => (v === 13 ? 0 : v));
            const handRanksValueWithAceLowSorted = handRanksValueWithAceLow.sort((a, b) => a - b);
            const isStraightWithAceLow = isStraightByHandRanksValueSorted(handRanksValueWithAceLowSorted);
            return !(isStraightWithAceLow || isStraightWithAceHigh);
        } else {
            return !isStraightWithAceHigh;
        }
    }

    function isNotFlush(handSuits) {
        const suitsUniq = new Set(handSuits)
        return suitsUniq.size >= 2;
    }

    function getLoserByHandRanks(playerHandRanks, opponentHandRanks) {
        const playerHandRanksValue = playerHandRanks.map(r => CARDS[r]);
        const playerHandRanksValueSorted = playerHandRanksValue.sort((a, b) => b - a);
        const opponentHandRanksValue = opponentHandRanks.map(r => CARDS[r]);
        const opponentHandRanksValueSorted = opponentHandRanksValue.sort((a, b) => b - a);

        for (let i = 0; i < playerHandRanksValueSorted.length; i++) {
            const player = playerHandRanksValueSorted[i];
            const opponent = opponentHandRanksValueSorted[i];
            if (player !== opponent) {
                if (player > opponent) {
                    return 'PLAYER' // { "hand": playerHandRanks, "loser": 'PLAYER' };
                } else {
                    return 'OPPONENT' // { "hand": opponentHandRanks, "loser": 'OPPONENT' };
                }
            }
        }

        return null;
    }

    const playerHandTranslated = getHandTranslated(playerHand);
    const playerHandSuits = playerHandTranslated.map(h => h.slice(-1));
    const playerHandRanks = playerHandTranslated.map(h => h.slice(0, -1));
    const playerHandHasNotSame = hasNotSame(playerHandRanks);

    const opponentHandTranslated = getHandTranslated(opponentHand);
    const opponentHandSuits = opponentHandTranslated.map(h => h.slice(-1));
    const opponentHandRanks = opponentHandTranslated.map(h => h.slice(0, -1));
    const opponentHandHasNotSame = hasNotSame(opponentHandRanks);

    if (playerHandHasNotSame === false && opponentHandHasNotSame === false) {
        const playerHandRanksSortedByDuplicates = getSameCards(playerHandRanks); // [ 'K_2', 'J_2', 'A' ]
        const opponentHandRanksSortedByDuplicates = getSameCards(opponentHandRanks); // [ 'K_2', 'J_2', 'A' ]
        const playerHandMaxDuplicateNumber = Math.max(...playerHandRanksSortedByDuplicates.map(r => Number(r.split('_')[1] || 1)));
        const opponentHandMaxDuplicateNumber = Math.max(...opponentHandRanksSortedByDuplicates.map(r => Number(r.split('_')[1] || 1)));
        if ( // ['A_2', ... ] vs [ 'K_3', ... ]
            playerHandMaxDuplicateNumber < opponentHandMaxDuplicateNumber
        ) {
            return 'PLAYER';
        }

        if ( // [ 'K_3', ... ] vs [ 'A_2', ... ]
            playerHandMaxDuplicateNumber > opponentHandMaxDuplicateNumber
        ) {
            return 'OPPONENT';
        }

        if ( // [ 'K_3', 'A', 'J' ].length === 3 vs [ 'A_3', Q_2].length === 2
            playerHandMaxDuplicateNumber === opponentHandMaxDuplicateNumber &&
            playerHandRanksSortedByDuplicates.length > opponentHandRanksSortedByDuplicates.length
        ) {
            return 'PLAYER';
        }

        if ( // [ 'A_3', 'Q_2'].length === 2 vs [ 'K_3', 'A', 'J' ].length === 3
            playerHandMaxDuplicateNumber === opponentHandMaxDuplicateNumber &&
            playerHandRanksSortedByDuplicates.length < opponentHandRanksSortedByDuplicates.length
        ) {
            return 'OPPONENT';
        }

        if ( // [ 'A_3', 'Q_2'] vs [ 'K_3', 'J_2']
            playerHandMaxDuplicateNumber === opponentHandMaxDuplicateNumber &&
            playerHandRanksSortedByDuplicates.length === opponentHandRanksSortedByDuplicates.length
        ) {
            const playerHandRanksSortedByDuplicatesAndFlattened = playerHandRanksSortedByDuplicates.map(r => {
                const sub = r.split('_')
                return sub[0]
            })
            const playerHandValuesSortedByDuplicatesAndFlattened = playerHandRanksSortedByDuplicatesAndFlattened.map(r => CARDS[r])

            const opponentHandRanksSortedByDuplicatesAndFlattened = opponentHandRanksSortedByDuplicates.map(r => {
                const sub = r.split('_')
                return sub[0]
            })
            const opponentHandValuesSortedByDuplicatesAndFlattened = opponentHandRanksSortedByDuplicatesAndFlattened.map(r => CARDS[r])

            for (let i = 0; i < playerHandValuesSortedByDuplicatesAndFlattened.length; i++) {
                const playerCard = playerHandValuesSortedByDuplicatesAndFlattened[i];
                const opponentCard = opponentHandValuesSortedByDuplicatesAndFlattened[i];
                if (playerCard > opponentCard) {
                    return 'OPPONENT';
                } else if (playerCard < opponentCard) {
                    return 'PLAYER';
                }
            }

            return 'NONE';
        }
    }

    if (playerHandHasNotSame === true && opponentHandHasNotSame === false) {
        const playerHandRanksValue = playerHandRanks.map(r => CARDS[r]);
        const playerHandIsNotFlush = isNotFlush(playerHandSuits);
        const playerHandIsNotStraight = isNotStraight(playerHandRanksValue);
        const opponentHandRanksSortedByDuplicates = getSameCards(opponentHandRanks); // [ 'K_2', 'J_2', 'A' ]

        if (opponentHandRanksSortedByDuplicates.length <= 2) { // need to check for straight flush
            return 'PLAYER';
        } else {
            if (playerHandIsNotStraight === false || playerHandIsNotFlush === false) {
                return 'OPPONENT';
            } else {
                return 'PLAYER';
            }
        }
    }

    if (playerHandHasNotSame === false && opponentHandHasNotSame === true) {
        const opponentHandRanksValue = opponentHandRanks.map(r => CARDS[r]);
        const opponentHandIsNotFlush = isNotFlush(opponentHandSuits);
        const opponentHandIsNotStraight = isNotStraight(opponentHandRanksValue);
        const playerHandRanksSortedByDuplicates = getSameCards(playerHandRanks); // [ 'K_2', 'J_2', 'A' ]

        if (playerHandRanksSortedByDuplicates.length <= 2) { // need to check for straight flush
            return 'OPPONENT';
        } else {
            if (opponentHandIsNotStraight === false || opponentHandIsNotFlush === false) {
                return 'PLAYER';
            } else {
                return 'OPPONENT';
            }
        }
    }

    if (playerHandHasNotSame === true && opponentHandHasNotSame === true) {
        const playerHandRanksValue = playerHandRanks.map(r => CARDS[r]);
        const opponentHandRanksValue = opponentHandRanks.map(r => CARDS[r]);
        const playerHandIsNotFlush = isNotFlush(playerHandSuits);
        const opponentHandIsNotFlush = isNotFlush(opponentHandSuits);
        const playerHandIsNotStraight = isNotStraight(playerHandRanksValue);
        const opponentHandIsNotStraight = isNotStraight(opponentHandRanksValue);

        if (playerHandIsNotFlush === false && opponentHandIsNotFlush === false) {
            const loser = getLoserByHandRanks(playerHandRanks, opponentHandRanks);
            return loser === 'OPPONENT' ? 'PLAYER' : (loser === 'PLAYER' ? 'OPPONENT' : 'NONE');
        }

        if (playerHandIsNotStraight === false && opponentHandIsNotStraight === false) {
            const loser = getLoserByHandRanks(playerHandRanks, opponentHandRanks);
            return loser === 'OPPONENT' ? 'PLAYER' : (loser === 'PLAYER' ? 'OPPONENT' : 'NONE');
        }

        if (playerHandIsNotFlush === true && opponentHandIsNotFlush === false) {
            return 'PLAYER';
        }

        if (playerHandIsNotFlush === false && opponentHandIsNotFlush === true) {
            return 'OPPONENT';
        }

        if (playerHandIsNotStraight === true && opponentHandIsNotStraight === false) {
            return 'PLAYER';
        }

        if (playerHandIsNotStraight === false && opponentHandIsNotStraight === true) {
            return 'OPPONENT';
        }

        if (
            playerHandIsNotStraight === true
            && playerHandIsNotFlush === true
            && opponentHandIsNotStraight === true
            && opponentHandIsNotFlush === true
        ) {
            const loser = getLoserByHandRanks(playerHandRanks, opponentHandRanks);
            return loser === 'OPPONENT' ? 'PLAYER' : (loser === 'PLAYER' ? 'OPPONENT' : 'NONE');
        }
    }

    throw new Error('getWinner.caseMissing');
}

function combinations(array, size) {
    const result = [];

    function backtrack(start, current) {
        if (current.length === size) {
            result.push([...current]);
            return;
        }

        for (let i = start; i < array.length; i++) {
            current.push(array[i]);
            backtrack(i + 1, current);
            current.pop();
        }
    }

    backtrack(0, []);
    return result;
}

const hand = ['48', '41', '43', '34', '49']; // ['Tc', '3c', '4c', '9d', 'Ac'];
const opponentCardsDiscardNumber = 1;
const result = getProbability(hand, opponentCardsDiscardNumber);

console.log(`Win Probability: ${result.probabilityWin.toFixed(4)}`);
console.log(`Winning Combinations: ${result.combinationsWinCount}`);
console.log(`Total Combinations: ${result.combinationsCount}`);