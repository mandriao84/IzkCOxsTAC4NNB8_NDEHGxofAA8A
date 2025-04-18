const fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const { LRUCache } = require('lru-cache');
const path = require('path');
const { all } = require('mathjs');
const PATH_RESULTS = path.join(process.cwd(), '.results/mccfr/strategies.ndjson');
const PATH_SCORES = path.join(process.cwd(), '.results/mccfr/scores.ndjson');
const DECK = {
    1: '2s', 2: '3s', 3: '4s', 4: '5s', 5: '6s', 6: '7s', 7: '8s', 8: '9s', 9: '10s', 10: 'Js', 11: 'Qs', 12: 'Ks', 13: 'As',
    14: '2h', 15: '3h', 16: '4h', 17: '5h', 18: '6h', 19: '7h', 20: '8h', 21: '9h', 22: '10h', 23: 'Jh', 24: 'Qh', 25: 'Kh', 26: 'Ah',
    27: '2d', 28: '3d', 29: '4d', 30: '5d', 31: '6d', 32: '7d', 33: '8d', 34: '9d', 35: '10d', 36: 'Jd', 37: 'Qd', 38: 'Kd', 39: 'Ad',
    40: '2c', 41: '3c', 42: '4c', 43: '5c', 44: '6c', 45: '7c', 46: '8c', 47: '9c', 48: '10c', 49: 'Jc', 50: 'Qc', 51: 'Kc', 52: 'Ac'
};
const CARDS = { 'A': 13, 'K': 12, 'Q': 11, 'J': 10, '10': 9, '9': 8, '8': 7, '7': 6, '6': 5, '5': 4, '4': 3, '3': 2, '2': 1 };
const cardsLength = Object.keys(CARDS).length
const CACHE = new LRUCache ({
    max: 3000000, // ~2.6M >> 2,598,960 combinations of hands + hand score
    maxSize: 3000000000, // ~3GB
    sizeCalculation: (value, key) => {
        if (key.endsWith(':S')) {
            return key.length * 2 + 8;
        }
        return key.length * 2 + value.length * 2 + 8;
    },
    allowStale: false
});

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

const getHandKey = (hand) => {
    let handCopy = [...hand];
    const getCardRank = (card) => card.slice(0, -1);
    const getCardValue = (card) => CARDS[getCardRank(card)];
    const getCardSuit = (card) => card.slice(-1);
    const cardsRank = handCopy.map(getCardRank).sort((a, b) => CARDS[a] - CARDS[b]);
    const cardsValue = handCopy.map(getCardValue).sort((a, b) => a - b);
    const cardsSuit = handCopy.map(getCardSuit).sort((a, b) => a - b);
    const cardsSuitSize = new Set(cardsSuit).size;
    const straightWithAs = [1, 2, 3, 4, 13];
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

    const key = `${cardsRank.join('|')}:${cardsSuitSize}`;

    return { key, sort: handCopy, cardsValue, cardsSuit };
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

    var { key, hand: handSorted, cardsValue, cardsSuit } = getHandKey([...hand]);

    const cacheScoreKey = `${key}:S`;
    if (CACHE.has(cacheScoreKey)) {
        const score = CACHE.get(cacheScoreKey);
        const scoreAsJson = JSON.parse(score);
        return scoreAsJson;
    }

    cardsValue = cardsValue.sort((a, b) => b - a);
    const straightWithAs = [13, 1, 2, 3, 4];
    const isStraightWithAs = straightWithAs.every(v => cardsValue.includes(v));
    if (isStraightWithAs) { cardsValue = [4, 3, 2, 1, 0]; }

    const isStraight = cardsValue.every((val, index, arr) => index === 0 || val === arr[index - 1] - 1) // (-1) BECAUSE (cardsValue.sort((a, b) => b - a))
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

    const result = { key, score };
    CACHE.set(cacheScoreKey, JSON.stringify(result));
    return result;
}






const getAllCombinationsPossible = (arr, k) => {
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
    
    return result;
};

const getAllHandsPossible = (handCardsNumber = 5) => {
    const deck = Object.values(DECK);
    const results = getAllCombinationsPossible(deck, handCardsNumber);
    return results;
}

const getAllHandsPossibleScoreSaved = (handCardsNumber = 5) => {
    fs.mkdirSync(path.dirname(PATH_SCORES), { recursive: true });
    fs.closeSync(fs.openSync(PATH_SCORES, 'a'));

    const data = new Set();
    const content = fs.readFileSync(PATH_SCORES, 'utf8');
    const lines = content.split('\n');
    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) {
            console.log(`getAllHandsPossibleScoreSaved.LineEmpty`);
            return;
        }
        try {
            const entry = JSON.parse(trimmed);
            if (entry.key) { 
                data.add(entry.key); 
            }
        } catch (error) {
            console.log(`getAllHandsPossibleScoreSaved.Error: ${error}`)
        }
    });

    const hands = getAllHandsPossible(handCardsNumber);
    const file = fs.openSync(PATH_SCORES, 'a');

    for (let i = 0; i < hands.length; i++) {
        const hand = hands[i];
        const { key } = getHandKey(hand);
        const scoreKey = `${key}:S`;
        if (!data.has(scoreKey)) {
            const { score } = getHandScore(hand);
            const value = JSON.stringify({ key: scoreKey, score });
            fs.appendFileSync(PATH_SCORES, value + '\n');
            data.add(scoreKey);
        }
    }

    fs.closeSync(file);
}





const getDiscardsDetailsForGivenHand = (type, hand, roundNumber, simulationNumber = 10000) => {
    if (fs.existsSync(PATH_RESULTS)) {
        const data = fs.readFileSync(PATH_RESULTS, 'utf8');
        const lines = data.split('\n');
        lines.forEach(line => {
            try {
                const trimmed = line.trim();
                if (!trimmed) {
                    console.log(`getDiscardsDetailsForGivenHand.LineEmpty`);
                    return;
                }
                const entry = JSON.parse(trimmed);
                if (entry.key) {
                    CACHE.set(entry.key, trimmed);
                }
            } catch (error) {
                console.log(`getDiscardsDetailsForGivenHand.Error: ${error}`);
            }
        });
    }

    const { key } = getHandKey([...hand]);
    let cacheKey = `${key}:R${roundNumber}`;
    if (CACHE.has(cacheKey)) {
        console.log(`getDiscardsDetailsForGivenHand.CacheHit`);
        const result = JSON.parse(CACHE.get(cacheKey));
        console.log(result)
        return result;
    }

    const deck = Object.values(DECK);
    getArrayShuffled(deck);
    const deckLeft = deck.filter(card => !hand.includes(card));
    if (type === "MCS") {
        const result = getMCSDiscardsDetails(hand, deckLeft, roundNumber, simulationNumber);
        result.key = key;
        console.log(type)
        console.log(result)
        return result;
    } else if (type === "ENUM") {
        const result = getEnumDiscardsDetails(hand, deckLeft, roundNumber);
        result.key = key;
        console.log(type)
        console.log(result)
        return result;
    }
};





const getMCSDiscardsDetails = (hand, deckLeft, roundNumber, simulationNumber) => {
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
                    const { key } = getHandKey([...handNew]);

                    let cacheResultKey = `${key}:R${roundNumber - 1}`
                    if (CACHE.has(cacheResultKey)) {
                        const entry = JSON.parse(CACHE.get(cacheResultKey));
                        scorePerDiscardIndices += entry.score;
                    } else {
                        const roundNext = getMCSDiscardsDetails(
                            handNew,
                            deck, 
                            roundNumber - 1,
                            Math.sqrt(simulationNumber), //simulationNumber
                        );
                        scorePerDiscardIndices += roundNext.score;
                    }

                } else {
                    const { score } = getHandScore(handNew);
                    scorePerDiscardIndices += score;
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




const getEnumDiscardsDetails = (hand, deckLeft, roundNumber) => {
    const results = {};
    let scoreFinal = Infinity;
    let indexFinal = null;

    for (let discardNumber = 0; discardNumber <= 5; discardNumber++) {
        const discardCombinations = getAllCombinationsPossible([...Array(5).keys()], discardNumber);
        let score = Infinity;
        let index = null;

        for (const discardIndices of discardCombinations) {
            const cardsKept = hand.filter((_, idx) => !discardIndices.includes(idx));
            const drawNumber = discardIndices.length;

            const allDraws = getAllCombinationsPossible(deckLeft, drawNumber);
            let scorePerDiscardIndices = 0;

            for (const cardsReceived of allDraws) {
                const handNew = [...cardsKept, ...cardsReceived];
                const deckNew = deckLeft.filter(card => !cardsReceived.includes(card));
                const { key } = getHandKey([...handNew]);
                const cacheResultKey = `${key}:R${roundNumber - 1}`;

                if (roundNumber === 1) {
                    const { score } = getHandScore(handNew);
                    scorePerDiscardIndices += score;
                } else if (CACHE.has(cacheResultKey)) {
                    const entry = JSON.parse(CACHE.get(cacheResultKey));
                    scorePerDiscardIndices += entry.score;
                } else {
                    const roundNext = getEnumDiscardsDetails(handNew, deckNew, roundNumber - 1);
                    CACHE.set(cacheResultKey, JSON.stringify(roundNext));
                    scorePerDiscardIndices += roundNext.score;
                }
            }

            scorePerDiscardIndices /= allDraws.length;

            if (scorePerDiscardIndices < score) {
                score = scorePerDiscardIndices.safe("ROUND", 3);
                index = discardIndices;
            }
        }

        results[discardNumber] = score;
        if (score < scoreFinal) {
            scoreFinal = score;
            indexFinal = index;
        }
    }

    results.score = scoreFinal;
    // results.cards = (indexFinal || []).map(idx => hand[idx]);
    results.cards = (indexFinal || []).map(idx => hand[idx].slice(0, -1));
    return results;
};






const getEnumDataComputed = async (roundNumber = 1) => {
    if (isMainThread) {
        const entries = new Map();
        
        if (fs.existsSync(PATH_RESULTS)) {
            const content = fs.readFileSync(PATH_RESULTS, 'utf8');
            const lines = content.split('\n');
            lines.forEach(line => {
                try {
                    const trimmed = line.trim();
                    if (!trimmed) {
                        console.log(`getEnumDataComputed.LineEmpty`);
                        return;
                    }
                    const entry = JSON.parse(trimmed);
                    if (entry.key) {
                        entries.set(entry.key, trimmed);
                    }
                } catch (error) {
                    console.log(`getEnumDataComputed.Error: ${error}`);
                }
            });
        }

        const allHandsRaw = getAllHandsPossible();
        const allHands = allHandsRaw.reduce((acc, hand) => {
            const { key } = getHandKey(hand);
            const entryKey = `${key}:R${roundNumber}`;
            if (!entries.has(entryKey)) {
                acc.push({ hand, key: entryKey });
            }
            return acc;
        }, []);

        const cpuCount = os.cpus().length;
        const workers = { exit: [], instance: [] };
        const allHandsPerWorker = Math.ceil(allHands.length / cpuCount);

        for (let i = 0; i < cpuCount; i++) {
            const workerStart = i * allHandsPerWorker;
            const workerEnd = Math.min(workerStart + allHandsPerWorker, allHands.length);
            const workerHands = allHands.slice(workerStart, workerEnd);

            const worker = new Worker(__filename, {
                workerData: {
                    handsDetails: workerHands,
                    roundNumber,
                    PATH_RESULTS
                }
            });
            workers.instance.push(worker);

            worker.on('message', (content) => {
                const type = content?.type;
                const payload = content?.payload?.trim();
                const entry = JSON.parse(payload);
                if (type === "DATA" && !entries.has(entry.key)) {
                    fs.appendFileSync(PATH_RESULTS, payload + '\n');
                    entries.set(entry.key, payload);
                    workers.instance.forEach(w => {
                        if (w !== worker) {
                            w.postMessage({ type: 'CACHE_UPDATE', payload: payload });
                        }
                    });
                }
            });
            
            workers.exit.push(new Promise(resolve => worker.on('exit', resolve)));
        }
        
        await Promise.all(workers.exit);
    } else {
        getCacheLoaded();

        parentPort.on('message', (message) => {
            const type = message?.type;
            const payload = message?.payload;

            if (type === 'CACHE_UPDATE') {
                try {
                    const entry = JSON.parse(payload);
                    if (!CACHE.has(entry.key)) {
                        CACHE.set(entry.key, payload);
                    }
                } catch (error) {
                    console.log(`Process.Message.FromMainThreadToWorkerThread.Parsing.Error: ${payload}`);
                }
            }
        });

        const { handsDetails, roundNumber } = workerData;
        for (const { hand, key } of handsDetails) {
            const deck = Object.values(DECK);
            const deckLeft = deck.filter(card => !hand.includes(card));
            const result = getEnumDiscardsDetails(hand, deckLeft, roundNumber, 0);
            result.key = key;
            const resultAsString = JSON.stringify(result);
            CACHE.set(key, resultAsString);
            parentPort.postMessage({ type: 'DATA', payload: resultAsString });
        }
        
        process.exit(0);
    }
};





const getSingleThreadEnumDataComputed = (roundNumber = 1) => {
    getCacheLoaded();
    const allHandsRaw = getAllHandsPossible();
    const file = fs.openSync(PATH_RESULTS, 'a');

    for (let i = 0; i < allHandsRaw.length; i++) {
        const hand = allHandsRaw[i];
        const { key } = getHandKey(hand);
        const roundKey = `${key}:R${roundNumber}`;
        if (!CACHE.has(roundKey)) {
            const deck = Object.values(DECK);
            const deckLeft = deck.filter(card => !hand.includes(card));
            const result = getEnumDiscardsDetails(hand, deckLeft, roundNumber);
            result.key = roundKey;
            console.log(result)
            const resultAsString = JSON.stringify(result);
            CACHE.set(key, resultAsString);
            fs.appendFileSync(PATH_RESULTS, resultAsString + '\n');
        }
    }

    fs.closeSync(file);
};




const getMCSDataComputed = async (roundNumber, simulationNumber) => {
    if (isMainThread) {
        const cpuCount = os.cpus().length;
        const workers = {
            exit: [],
            instance: []
        };
        const entries = new Map();
        
        if (fs.existsSync(PATH_RESULTS)) {
            const content = fs.readFileSync(PATH_RESULTS, 'utf8');
            const lines = content.split('\n');
            lines.forEach(line => {
                try {
                    const trimmed = line.trim();
                    if (!trimmed) {
                        console.log(`getMCSDataComputed.LineEmpty`);
                        return;
                    }
                    const entry = JSON.parse(trimmed);
                    if (entry.key) {
                        entries.set(entry.key, trimmed);
                    }
                } catch (error) {
                    console.log(`getMCSDataComputed.Error: ${error}`);
                }
            });
        }

        for (let i = 0; i < cpuCount; i++) {
            const worker = new Worker(__filename, {
                workerData: { 
                    start: Math.floor(i * simulationNumber / cpuCount),
                    end: Math.floor((i + 1) * simulationNumber / cpuCount),
                    roundNumber,
                    simulationNumber,
                    PATH_RESULTS
                }
            });
            workers.instance.push(worker);

            worker.on('message', (content) => {
                const type = content?.type;
                const payload = content?.payload?.trim();
                const entry = JSON.parse(payload);
                if (type === "DATA" && !entries.has(entry.key)) {
                    fs.appendFileSync(PATH_RESULTS, payload + '\n');
                    entries.set(entry.key, payload);
                    workers.instance.forEach(w => {
                        if (w !== worker) {
                            w.postMessage({ type: 'CACHE_UPDATE', payload: payload });
                        }
                    });
                }
            });
            
            workers.exit.push(new Promise(resolve => worker.on('exit', resolve)));
        }
        
        await Promise.all(workers.exit);
    } else {
        getCacheLoaded();

        parentPort.on('message', (message) => {
            const type = message?.type;
            const payload = message?.payload;

            if (type === 'CACHE_UPDATE') {
                try {
                    const entry = JSON.parse(payload);
                    if (!CACHE.has(entry.key)) {
                        CACHE.set(entry.key, payload);
                    }
                } catch (error) {
                    console.log(`Process.Message.FromMainThreadToWorkerThread.Parsing.Error: ${payload}`);
                }
            }
        });
        
        for (let i = workerData.start; i < workerData.end; i++) {
            const deck = Object.values(DECK);
            getArrayShuffled(deck);
            const hands = getHandsDealed(deck, 5, 1);
            const hand = hands[0];
            const { key } = getHandKey([...hand]);

            const cacheResultKey = `${key}:R${workerData.roundNumber}`;
            if (!CACHE.has(cacheResultKey)) {
                const deckLeft = deck.filter(card => !hand.includes(card));
                const result = getMCSDiscardsDetails(hand, deckLeft, workerData.roundNumber, 10000);
                result.key = cacheResultKey;
                const resultAsString = JSON.stringify(result);
                CACHE.set(cacheResultKey, resultAsString);
                parentPort.postMessage({ type: 'DATA', payload: resultAsString });
            }
        }
        
        process.exit(0);
    }
}





const getCacheLoaded = () => {
    CACHE.clear();

    const paths = [PATH_SCORES, PATH_RESULTS];
    paths.forEach(p => {    
        if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, 'utf8');
            const lines = content.split('\n');
            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) {
                    console.log(`getCacheLoaded.LineEmpty`);
                    return;
                }
                try {
                    const entry = JSON.parse(trimmed);
                    CACHE.set(entry.key, trimmed);
                } catch (error) {
                    console.log(`getCacheLoaded.${p}.Error: ${line}`);
                }
            });
        }
    })
}

const getTimeElapsed = (timeStart, signal, error) => {
    const timeElapsed = process.hrtime(timeStart);
    const timeElapsedAsMs = timeElapsed[0] * 1000 + timeElapsed[1] / 1e6;
    console.log(`\ngetTimeElapsed.${signal}.${error} : ${timeElapsedAsMs.toFixed(2)}ms`);
}

const getCacheDuplicated = () => {
    const result = Array.from(CACHE).reduce((acc, [key, value]) => {
        acc.push({ key, value: JSON.parse(value) });
        return acc;
    }, []);
    return result;
}





(async () => {
    // const timeStart = process.hrtime();
    // const roundNumber = 1;
    // const simulationNumber = 1000;
    // const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGHUP', 'SIGUSR1', 'SIGUSR2', 'uncaughtException', 'unhandledRejection'];
    // signals.forEach((signal) => {
    //     process.on(signal, async (error) => {
    //         getTimeElapsed(timeStart, signal, error);
    //         process.exit(0);
    //     });
    // });

    // await getMCSDataComputed(roundNumber, simulationNumber);
    // await getEnumDataComputed(1);
    getSingleThreadEnumDataComputed(1);

    // const a = ["5c", "6h", "7c", "8c", "9c"]
    // const b = ["2h", "3h", "5h", "4h", "7c"]
    // getDiscardsDetailsForGivenHand("ENUM", b, 1);
    // getDiscardsDetailsForGivenHand("MCS", a, 1);
    // getAllHandsPossibleScoreSaved()
    // getTimeElapsed(timeStart, 'END', null);
})();