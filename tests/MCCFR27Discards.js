const { createClient } = require('redis');
const Piscina = require('piscina');
const { isMainThread } = require('worker_threads');
const os = require('os');
const fs = require('fs');
const path = require('path');

const PATH_RESULTS = path.join(process.cwd(), '.results/mccfr/strategies.ndjson');
const DECK = {
    1: '2s', 2: '3s', 3: '4s', 4: '5s', 5: '6s', 6: '7s', 7: '8s', 8: '9s', 9: '10s', 10: 'Js', 11: 'Qs', 12: 'Ks', 13: 'As',
    14: '2h', 15: '3h', 16: '4h', 17: '5h', 18: '6h', 19: '7h', 20: '8h', 21: '9h', 22: '10h', 23: 'Jh', 24: 'Qh', 25: 'Kh', 26: 'Ah',
    27: '2d', 28: '3d', 29: '4d', 30: '5d', 31: '6d', 32: '7d', 33: '8d', 34: '9d', 35: '10d', 36: 'Jd', 37: 'Qd', 38: 'Kd', 39: 'Ad',
    40: '2c', 41: '3c', 42: '4c', 43: '5c', 44: '6c', 45: '7c', 46: '8c', 47: '9c', 48: '10c', 49: 'Jc', 50: 'Qc', 51: 'Kc', 52: 'Ac'
};
const CARDS = { 'A': 13, 'K': 12, 'Q': 11, 'J': 10, '10': 9, '9': 8, '8': 7, '7': 6, '6': 5, '5': 4, '4': 3, '3': 2, '2': 1 };
const cardsLength = Object.keys(CARDS).length
const allCombinationsPossibleCache = {};

/** REDIS START */

/** REDIS END */

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
    let handCopy = [...hand];
    const getCardRank = (card) => card.slice(0, -1);
    const getCardValue = (card) => CARDS[getCardRank(card)];
    const getCardSuit = (card) => card.slice(-1);
    const cardsValue = handCopy.map(getCardValue).sort((a, b) => a - b);
    const cardsSuit = handCopy.map(getCardSuit).sort((a, b) => a - b);
    const straightWithAs = [13, 1, 2, 3, 4];
    const isStraightWithAs = straightWithAs.every(v => cardsValue.includes(v));

    handCopy.sort((a, b) => {
        const cardValueA = getCardValue(a);
        const cardValueB = getCardValue(b);
        if (isStraightWithAs) {
            if (cardValueA === 13) return -1;
            if (cardValueB === 13) return 1;
        }
        return cardValueA - cardValueB;
    });
    const handKey = handCopy.join('|');

    return { hand: handCopy, handKey, cardsValue, cardsSuit };
}

const getHandScore = async (hand) => {
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

    var { hand: handSorted, handKey, cardsValue, cardsSuit } = getHandSorted([...hand]);

    let redisKey = `${handKey}:S`;
    let handScore = await redis.get(redisKey);
    if (handScore !== null) {
        return Number(handScore);
    }

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

    await redis.set(redisKey, score);

    return score;
}





function getAllCombinationsHandsPossible(deckCardsNumber = 52, handCardsNumber = 5) {
    let result = 1;
    for (let i = 1; i <= handCardsNumber; i++) {
        result = result * (deckCardsNumber - i + 1) / i;
    }
    console.log(`getAllCombinationsHandsPossible.deckCardsNumber(${deckCardsNumber}).x.handCardsNumber(${handCardsNumber}) === ${result}`);
    return result;
}

const getAllCombinationsPossible = (arr, k) => {
    // const key = JSON.stringify({ arr, k });
    
    // if (allCombinationsPossibleCache.hasOwnProperty(key)) {
    //     return allCombinationsPossibleCache[key];
    // }

    let result;
    if (k === 0) {
        result = [[]];
    } else if (arr.length < k) {
        result = [];
    } else {
        const [first, ...rest] = arr;
        const withFirst = getAllCombinationsPossible(rest, k - 1).map(c => [first, ...c]);
        const withoutFirst = getAllCombinationsPossible(rest, k);
        result = [...withFirst, ...withoutFirst];
    }
    
    // allCombinationsPossibleCache[key] = result;
    return result;
};





// function getDiscardsMCSimulated(hand, discardIndices, deckLeft, simulationNumber) {
//     const handKept = hand.filter((_, index) => !discardIndices.includes(index));
//     const discardNumber = discardIndices.length;

//     let score = 0;
//     for (let i = 0; i < simulationNumber; i++) {
//         const deck = [...deckLeft];
//         getArrayShuffled(deck);
//         const cardsReceived = deck.slice(0, discardNumber);
//         const handNew = [...handKept, ...cardsReceived];
//         score += getHandScore(handNew);
//     }

//     const scoreFinal = score / simulationNumber;
//     return scoreFinal.safe("ROUND", 3);
// }





// const getDiscardsEnumerated = (hand, discardIndices, deckLeft) => {
//     const handKept = hand.filter((_, index) => !discardIndices.includes(index));
//     const discardNumber = discardIndices.length;

//     if (discardNumber === 0) {
//         return getHandScore(hand);
//     }

//     const allCombinationsPossible = getAllCombinationsPossible(deckLeft, discardNumber);

//     let score = 0;
//     for (const cardsReceived of allCombinationsPossible) {
//         const handNew = [...handKept, ...cardsReceived];
//         score += getHandScore(handNew);
//     }

//     const scoreFinal = score / allCombinationsPossible.length;
//     return scoreFinal.safe("ROUND", 3);
// }





const getDiscardsDetailsForGivenHand = async (hand, roundNumber, simulationNumber = null) => {
    const deck = Object.values(DECK);
    getArrayShuffled(deck);
    const deckLeft = deck.filter(card => !hand.includes(card));
    const result = await getDiscardsDetails(hand, deckLeft, roundNumber, simulationNumber);
    console.log(hand, result);
    return result;
};





const getDiscardsDetails = async (hand, deckLeft, roundNumber, simulationNumber) => {
    const results = {};
    let scoreFinal = Infinity;
    let indexFinal = null;

    for (let discardNumber = 0; discardNumber <= 5; discardNumber++) {
        const discardCombinations = getAllCombinationsPossible([...Array(5).keys()], discardNumber);
        let score = Infinity;
        let index = null;

        for (const discardIndices of discardCombinations) {
            let scorePerDiscardIndices = 0;
            
            for (let i = 0; i < simulationNumber; i++) {
                const deck = [...deckLeft];
                getArrayShuffled(deck);
                
                const cardsKept = hand.filter((_, idx) => !discardIndices.includes(idx));
                const cardsReceived = deck.splice(0, discardNumber);
                let handNew = [...cardsKept, ...cardsReceived];
                
                if (roundNumber > 1 && deck.length >= 5) {
                    const { handKey } = getHandSorted([...handNew]);

                    const redisKey = `${handKey}:S`;
                    let handScore = await redis.get(redisKey);
                    if (handScore !== null) {
                        scorePerDiscardIndices += Number(handScore);
                    } else {
                        const roundNext = await getDiscardsDetails(
                            handNew,
                            deck,
                            roundNumber - 1,
                            simulationNumber //Math.sqrt(simulationNumber)
                        );
                        scorePerDiscardIndices += roundNext.score;
                        await redis.set(redisKey, roundNext.score);
                    }

                } else {
                    scorePerDiscardIndices += await getHandScore(handNew);
                }
            }
            
            const scoreAverage = scorePerDiscardIndices / simulationNumber;
            if (scoreAverage < score) {
                score = scoreAverage.safe("ROUND", 3);
                index = discardIndices;
            }
        }

        results[discardNumber] = score

        if (score < scoreFinal) {
            scoreFinal = score;
            indexFinal = index;
        }
    }

    results.score = scoreFinal;
    results.cards = (indexFinal || []).map(idx => hand[idx]);
    return results;
};




const redis = createClient({ 
    url: 'redis://127.0.0.1:6379',
    socket: {
        tls: false,
        keepAlive: 10000,
        reconnectStrategy: retries => Math.min(retries * 50, 1000)
    },
    pingInterval: 60000  
});
redis.on('error', (err) => console.error('Redis Error:', err));

if (isMainThread) {
    const pool = new Piscina({
        filename: __filename,
        minThreads: os.cpus().length,
        maxThreads: os.cpus().length,
    });

    const getDataLoadedFromNdjsonToRedis = async () => {
        if (fs.existsSync(PATH_RESULTS)) {
            const content = fs.readFileSync(PATH_RESULTS, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());
            const pipeline = redis.multi();
            lines.forEach(line => {
                const entry = JSON.parse(line);
                pipeline.set(entry.key, JSON.stringify(entry));
            });
            await pipeline.exec();
            console.log(`Loaded ${lines.length} entries from Ndjson file to Redis`);
        }
    };

    const getDataFlushedFromRedisToNdjson = async (roundNumber) => {
        const keys = await redis.keys(`*:R${roundNumber}`);

        const pipeline = redis.multi();
        keys.forEach(key => pipeline.get(key));
        const values = await pipeline.exec();
        console.log(values);

        const fd = fs.openSync(PATH_RESULTS, 'w');
        for (let i = 0; i < values.length; i++) {
            const entry = JSON.parse(values[i]);
            fs.writeSync(fd, JSON.stringify(entry) + '\n');
        }
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        console.log(`Flushed ${keys.length} entries from Redis to Ndjson file.`);
    };

    const getDataComputed = async (roundNumber, simulationNumber) => {
        const cpuCount = os.cpus().length;
        const simulationsPerWorker = Math.ceil(simulationNumber / cpuCount);
        const tasks = [];
        for (let i = 0; i < cpuCount; i++) {
            tasks.push(pool.run({ roundNumber, simulationNumber: simulationsPerWorker }));
        }
        const results = await Promise.all(tasks);
        const resultsFlattened = results.flat();
        return resultsFlattened;
    };

    const getTimeElapsed = (timeStart, signal, error) => {
        const timeElapsed = process.hrtime(timeStart);
        const timeElapsedAsMs = timeElapsed[0] * 1000 + timeElapsed[1] / 1e6;
        console.log(`\ngetTimeElapsed.${signal}.${error} : ${timeElapsedAsMs.toFixed(2)}ms`);
    }

    (async () => {
        await redis.connect();
        await redis.flushDb(); // CLEAR REDIS

        // 1000 > 1min
        const timeStart = process.hrtime();
        const roundNumber = 1;
        const simulationNumber = 1;

        await getDataLoadedFromNdjsonToRedis();

        const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGHUP', 'SIGUSR1', 'SIGUSR2', 'uncaughtException', 'unhandledRejection'];
        signals.forEach((signal) => {
            process.on(signal, async (error) => {
                await getDataFlushedFromRedisToNdjson(roundNumber);
                getTimeElapsed(timeStart, signal, error);
                process.exit(0);
            });
        });

        const results = await getDataComputed(roundNumber, simulationNumber);
        await getDataFlushedFromRedisToNdjson(roundNumber);
        getTimeElapsed(timeStart, 'END', null);
        process.exit(0);
    })();
} else {
    module.exports = async ({ roundNumber, simulationNumber}) => {
        if (!redis.isReady) {
            await redis.connect();
        }

        const results = [];
        // const redisMulti = redis.multi();
        // const redisBatchSize = 100;

        for (let i = 0; i < simulationNumber; i++) {
            const deck = Object.values(DECK);
            getArrayShuffled(deck);
            const hands = getHandsDealed(deck, 5, 1);
            const hand = hands[0];
            const { handKey } = getHandSorted(hand);
            const resultKey = `${handKey}:R${roundNumber}`;


            const redisExists = await redis.exists(resultKey);
            if (!redisExists) {
                const deckLeft = deck.filter(card => !hand.includes(card));
                const result = await getDiscardsDetails(hand, deckLeft, roundNumber, 10000);
                result.key = resultKey;
                results.push(result);
                await redis.set(resultKey, JSON.stringify(result));
            }
        }

        // await redis.disconnect();
        return results;
    };
}





// (async () => {
//     await redis.connect();
//     await redis.flushDb(); // clear redis db
//     // getAllCombinationsHandsPossible();
//     // await getDataComputed(1, 500);
//     await getDiscardsDetailsForGivenHand(["2d", "3d", "4d", "10d", "Kh"], 1, 1000);
// })();