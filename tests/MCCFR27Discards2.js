const fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const cluster = require('cluster');
const { LRUCache } = require('lru-cache');
const path = require('path');

const PATH_RESULTS = path.join(process.cwd(), '.results/mccfr');
const PATH_KEYS = path.join(PATH_RESULTS, 'keys.ndjson');
const PATH_SCORES = path.join(PATH_RESULTS, 'scores.ndjson');
const PATH_DISCARDSK = path.join(PATH_RESULTS, 'discardsk.ndjson');
const PATH_DISCARDSEV = path.join(PATH_RESULTS, 'discardsev.ndjson');
const PATH_STANDSEV = path.join(PATH_RESULTS, 'standsev.ndjson');
const PATH_STRATEGIES = path.join(PATH_RESULTS, 'strategies.ndjson');
const PATH_REGRETS = path.join(PATH_RESULTS, 'regrets.ndjson');
const PATH_EVS = path.join(PATH_RESULTS, 'evs.ndjson');
const DECK = {
    1: '2s', 2: '3s', 3: '4s', 4: '5s', 5: '6s', 6: '7s', 7: '8s', 8: '9s', 9: '10s', 10: 'Js', 11: 'Qs', 12: 'Ks', 13: 'As',
    14: '2h', 15: '3h', 16: '4h', 17: '5h', 18: '6h', 19: '7h', 20: '8h', 21: '9h', 22: '10h', 23: 'Jh', 24: 'Qh', 25: 'Kh', 26: 'Ah',
    27: '2d', 28: '3d', 29: '4d', 30: '5d', 31: '6d', 32: '7d', 33: '8d', 34: '9d', 35: '10d', 36: 'Jd', 37: 'Qd', 38: 'Kd', 39: 'Ad',
    40: '2c', 41: '3c', 42: '4c', 43: '5c', 44: '6c', 45: '7c', 46: '8c', 47: '9c', 48: '10c', 49: 'Jc', 50: 'Qc', 51: 'Kc', 52: 'Ac'
};
const CARDS = { 'A': 13, 'K': 12, 'Q': 11, 'J': 10, '10': 9, '9': 8, '8': 7, '7': 6, '6': 5, '5': 4, '4': 3, '3': 2, '2': 1 };
const cardsLength = Object.keys(CARDS).length
const CACHE = new LRUCache({
    max: 10000000,
    // maxSize: 5000000000, // ~5GB
    // sizeCalculation: (value, key) => {
    //     return key.length * 2 + value.length * 2 + 8;
    // },
    // ttl: 0,
    allowStale: false
});
const keysMap = new Map();
const scoresMap = new Map();
const discardskMap = new Map();
const discardsMap = new Map();
const standsevMap = new Map();
const evsMap = new Map();

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


const getNDJSONDirRead = (dir) => {
    if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        const results = files.reduce((map, filePath) => {
            const filePathParsed = path.parse(filePath);
            if (filePathParsed.ext === '.ndjson') {
                const data = fs.readFileSync(path.join(dir, filePath), 'utf8');
                const lines = data.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const trimmed = line.trim();
                    const data = trimmed ? JSON.parse(trimmed) : {};
                    if (!data.key) continue;
                    if (!map.has(data.key)) {
                        map.set(data.key, data);
                    }
                }
            }
            return map;
        }, new Map())

        const filePathNew = path.join(path.dirname(dir), '__results__.ndjson');
        const data = Array.from(results.values());
        data.sort((a, b) => b.value - a.value);
        fs.writeFileSync(filePathNew, data.map(d => JSON.stringify(d)).join('\n') + '\n', 'utf8');
    }
}
const getNDJSONRead = (filePath) => {
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const lines = data.split('\n');

        const results = lines.reduce((map, line) => {
            const trimmed = line.trim();
            const data = trimmed ? JSON.parse(trimmed) : {};
            if (data.key && !map.has(data.key)) {
                map.set(data.key, data);
            }
            return map;
        }, new Map());

        return results;
    } else {
        console.error(`getNDJSONRead.FileNotFound: ${filePath}`);
    }
}
const getNDJSONKeysDuplicatedDeleted = (filePath) => {
    const content = getNDJSONRead(filePath);
    const data = Array.from(content.values());
    // data.sort((a, b) => a.score - b.score);
    data.sort((a, b) => b.score - a.score);

    // const scoresAsMap = new Map();
    // const dataWithoutScoresDuplicated = data.reduce((arr, entry) => {
    //     const count = scoresAsMap.get(entry.score) || 0;
    //     scoresAsMap.set(entry.score, count + 1);

    //     if (count === 1) {
    //        const j = arr.findIndex(e => e.score === entry.score)
    //        const entryPast = arr[j];
    //        let entryPastKeyParts = entryPast.key.split(':');
    //        entryPastKeyParts[1] += "+"
    //        const keyNew = entryPastKeyParts.join(':');
    //        arr[j] = {
    //             ...entry,
    //             key: keyNew
    //         };
    //     } if (count === 0) {
    //         arr.push(entry);
    //     }
    //     return arr;
    // }, []);

    const filePathParsed = path.parse(filePath);
    const filePathNew = path.join(filePathParsed.dir, `${filePathParsed.name}_${filePathParsed.ext}`);
    fs.writeFileSync(filePathNew, data.map(d => JSON.stringify(d)).join('\n') + '\n', 'utf8');
}

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
    const cardsRank = handCopy.map(getCardRank).sort((a, b) => CARDS[b] - CARDS[a]);
    const cardsRankPattern = cardsRank.join('|');
    let cardsValue = handCopy.map(getCardValue).sort((a, b) => b - a);
    const cardsSuit = handCopy.map(getCardSuit).sort((a, b) => b - a);
    const cardsSuitCount = cardsSuit.reduce((obj, suit) => {
        obj[suit] = (obj[suit] || 0) + 1;
        return obj;
    }, {});
    const cardsSuitCountKeys = Object.keys(cardsSuitCount);
    const cardsSuitCountSize = cardsSuitCountKeys.length;
    const straightWithAs = [13, 4, 3, 2, 1];
    const isStraightWithAs = straightWithAs.every(v => cardsValue.includes(v));
    if (isStraightWithAs) { cardsValue = [4, 3, 2, 1, 0]; }

    const cardsCount = cardsValue.reduce((obj, rank) => {
        obj[rank] = (obj[rank] || 0) + 1;
        return obj
    }, {})
    const cardsCountKeys = Object.keys(cardsCount);
    const cardsCountKey1 = cardsCountKeys.filter(r => cardsCount[r] === 1).sort((a, b) => b - a);
    const cardsCountKey2 = cardsCountKeys.filter(r => cardsCount[r] === 2).sort((a, b) => b - a);
    const cardsCountKey3 = cardsCountKeys.filter(r => cardsCount[r] === 3).sort((a, b) => b - a);
    const cardsCountKey4 = cardsCountKeys.filter(r => cardsCount[r] === 4).sort((a, b) => b - a);

    const isHigh = cardsCountKey1.length === 5;
    const isPair = cardsCountKey2.length === 1 && cardsCountKey1.length === 3;
    const isPairs = cardsCountKey2.length === 2 && cardsCountKey1.length === 1;
    const isThree = cardsCountKey3.length === 1 && cardsCountKey1.length === 2;
    const isStraight = cardsValue.every((val, index, arr) => index === 0 || val === arr[index - 1] - 1) // (-1) BECAUSE (cardsValue.sort((a, b) => b - a))
    const isFlush = new Set(cardsSuit).size === 1
    const isFull = cardsCountKey3.length === 1 && cardsCountKey2.length === 1;
    const isFour = cardsCountKey4.length === 1 && cardsCountKey1.length === 1;
    const isStraightFlush = isStraight && isFlush;
    const details = function () {
        if (isStraightFlush) return { type: 'straightFlush', ranks: [...cardsCountKey1] };
        else if (isFour) return { type: 'four', ranks: [...cardsCountKey4, ...cardsCountKey1] };
        else if (isFull) return { type: 'full', ranks: [...cardsCountKey3, ...cardsCountKey2] };
        else if (isFlush) return { type: 'flush', ranks: [...cardsCountKey1] };
        else if (isStraight) return { type: 'straight', ranks: [...cardsCountKey1] };
        else if (isThree) return { type: 'three', ranks: [...cardsCountKey3, ...cardsCountKey1] };
        else if (isPairs) return { type: 'pairs', ranks: [...cardsCountKey2, ...cardsCountKey1] };
        else if (isPair) return { type: 'pair', ranks: [...cardsCountKey2, ...cardsCountKey1] };
        else return { type: 'high', ranks: [...cardsCountKey1] };
    }();

    handCopy.sort((a, b) => {
        const cardValueA = getCardValue(a);
        const cardValueB = getCardValue(b);
        if (isStraightWithAs) {
            if (cardValueA === 13) return -1;
            if (cardValueB === 13) return 1;
        }
        return cardValueB - cardValueA;
    });

    const cardsSuitPattern = function () {
        const cardSuitMax = getCardSuit(handCopy.at(0));
        const cardSuitMaxCount = cardsSuit.filter(suit => suit === cardSuitMax).length;
        if (cardsCountKey1.length === 5 && cardsSuitCountSize === 2 && cardSuitMaxCount === 1) {
            return '!';
        } else if (cardsSuitCountSize === 1) {
            return '-';
        } else {
            return '*';
        }
    }()


    const key = `${cardsRankPattern}:${cardsSuitPattern}`;

    return { key, hand: handCopy, cardsValue, cardsSuit, type: details.type, ranks: details.ranks };
}

const getHandFromKey = (key, discards = []) => {
    const [ranksPart, suitCountStr] = key.split(':');
    const ranks = ranksPart.split('|');
    const suitCount = parseInt(suitCountStr, 10);
    const suitsUniq = ['c', 'd', 'h', 's'].slice(0, suitCount);

    const used = {};
    const hand = [];

    for (const rank of ranks) {
        if (!used[rank]) used[rank] = new Set();
        const availableSuits = suitsUniq.filter(s => !used[rank].has(s));
        const suit = availableSuits.length > 0
            ? availableSuits[Math.floor(Math.random() * availableSuits.length)]
            : suitsUniq[Math.floor(Math.random() * suitsUniq.length)];
        used[rank].add(suit);
        hand.push(`${rank}${suit}`);
    }

    const getCardsDiscarded = (hand, suitsUniq, discards) => {
        const suitsCount = hand.reduce((obj, card) => {
            const suit = card.slice(-1);
            obj[suit] = (obj[suit] || 0) + 1;
            return obj;
        }, {});

        const discardedSet = new Set();
        const result = [];

        for (const rank of discards) {
            let candidates = hand.filter(c => c.slice(0, -1) === rank && !discardedSet.has(c));
            if (candidates.length === 0) {
                candidates = suitsUniq.map(s => `${rank}${s}`).filter(c => !discardedSet.has(c));
            }

            if (candidates.length === 0) {
                result.push(null);
                continue;
            }

            const candidate = candidates.reduce((best, card) => {
                const suit = card.slice(-1);
                return (suitsCount[suit] || 0) > (suitsCount[best.slice(-1)] || 0) ? card : best;
            }, candidates[0]);

            result.push(candidate);
            discardedSet.add(candidate);

            if (hand.includes(candidate)) {
                const candidateSuit = candidate.slice(-1);
                suitsCount[candidateSuit]--;
            }
        }

        return result;
    };

    return { hand, discards: getCardsDiscarded(hand, suitsUniq, discards) };
};

const getHandScore = (keyDetails) => {
    var { key, type, ranks } = keyDetails;

    let score = 0
    const multiplier = cardsLength + 1
    if (type === 'straightFlush') {
        score = 8000000 + ranks.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranks.length - 1 - index)), 0);
    } else if (type === 'four') {
        score = 7000000 + ranks.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranks.length - 1 - index)), 0);
    } else if (type === 'full') {
        score = 6000000 + ranks.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranks.length - 1 - index)), 0);
    } else if (type === 'flush') {
        score = 5000000 + ranks.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranks.length - 1 - index)), 0);
    } else if (type === 'straight') {
        score = 4000000 + ranks.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranks.length - 1 - index)), 0);
    } else if (type === 'three') {
        score = 3000000 + ranks.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranks.length - 1 - index)), 0);
    } else if (type === 'pairs') {
        score = 2000000 + ranks.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranks.length - 1 - index)), 0);
    } else if (type === 'pair') {
        score = 1000000 + ranks.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranks.length - 1 - index)), 0);
    } else {
        score = ranks.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranks.length - 1 - index)), 0);
    }

    const result = { key, score };
    return result;
}
const getHandExpectedValue = (hand, deckLeft, roundNumber) => {
    const timeStart = performance.now();
    const results = {};
    results.key = keysMap.get([...hand].sort().join('')).value;

    if (standsevMap.has(results.key)) {
        results.score = standsevMap.get(results.key);
        return results;
    }

    const allHandsX = getAllCombinations(deckLeft, 5);
    const score = scoresMap.get(results.key).value;
    const getScore = (scoreX, score) => {
        if (scoreX < score) return 1;
        else if (score === scoreX) return 0.5;
        else return 0;
    };

    const scoreAcc = allHandsX.reduce((acc, handX) => {
        const keyX = keysMap.get([...handX].sort().join('')).value;
        const scoreX = scoresMap.get(keyX).value;
        acc += getScore(scoreX, score);
        return acc;
    }, 0);

    results.ev = (scoreAcc / allHandsX.length).safe("ROUND", 5);
    const timeEnd = performance.now();
    console.log(`getHandExpectedValue (round ${roundNumber}) took ${(timeEnd - timeStart).toFixed(2)}ms`);
    return results;
}
function evDiscardCall(myHand, keepIdx, Pot) {
    const ed = getHandWithDiscardsExpectedValue(myHand, keepIdx);
    return ed * (Pot + 1) - 1;
}
function shouldPlay(hand, pot = 3, bet = 1) {
    const evHand = getHandExpectedValue(hand);
    const evPot = bet / (pot + bet);    // = 1/(3+1) = 0.25
    return evHand >= evPot;
}





const getAllCombinations = (arr, k) => {
    const nChooseK = (n, k) => {
        if (k > n) return 0;
        if (k > n - k) k = n - k;
        let res = 1;
        for (let i = 1; i <= k; i++) {
            res = (res * (n - k + i)) / i;
        }
        return res | 0;
    }

    const n = arr.length;
    if (k === 0) return [[]];
    if (k > n) return [];

    const total = nChooseK(n, k);    //  e.g. C(52,5) = 2 598 960
    const out = new Array(total);

    const idx = new Uint32Array(k);
    for (let i = 0; i < k; i++) idx[i] = i;

    let pos = 0;

    while (true) {
        const combo = new Array(k);
        for (let i = 0; i < k; i++) combo[i] = arr[idx[i]];
        out[pos++] = combo;

        let i = k - 1;
        while (i >= 0 && idx[i] === n - k + i) i--;
        if (i < 0) break;
        idx[i]++;
        for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }

    return out;
}
const getAllHandsPossible = (handCardsNumber = 5) => {
    const deck = Object.values(DECK);
    const results = getAllCombinations(deck, handCardsNumber);
    return results;
}
const getAllDiscardsK = (hand) => {
    const n = hand.length;
    const result = {
        counts: Array(n + 1).fill(0),
        k: Array(n + 1).fill().map(() => [])
    };

    const k = 1 << n; // 2^n

    for (let mask = 0; mask < k; mask++) {
        const subset = [];
        let count = 0;

        for (let i = 0; i < n; i++) {
            if ((mask & (1 << i)) !== 0) {
                subset.push(hand[i]);
                count++;
            }
        }

        result.k[count].push(subset);
        result.counts[count]++;
    }

    return result;
}
const getAllHandsPossibleWithDiscards = (hand) => {
    const deck = Object.values(DECK);
    const deckLeft = deck.filter(card => !hand.includes(card));
    const allDiscards = getAllDiscardsK(hand);
    const results = [];
    for (const discards of allDiscards) {
        const cardsKept = hand.filter(card => !discards.includes(card));
        const allCardsReceived = getAllCombinations(deckLeft, discards.length);
        const handsNew = allCardsReceived.map(cardsReceived => {
            const hand = [...cardsKept, ...cardsReceived];
            const keyDetails = getHandKey(hand);
            return { hand, keyDetails };
        });

        results.push(handsNew.length);
    }

    // results.sort((a, b) => b.avgEV - a.avgEV);

    return results;
}
const getAllHandsKeySaved = () => {
    fs.mkdirSync(path.dirname(PATH_KEYS), { recursive: true });
    fs.closeSync(fs.openSync(PATH_KEYS, 'a'));
    const allHandsRaw = getAllHandsPossible();
    const data = allHandsRaw.reduce((arr, hand) => {
        const keyDetails = getHandKey(hand);
        const { key, hand: handSorted } = keyDetails;
        arr.push({ key: hand.sort().join(''), hand: handSorted, value: key });
        return arr;
    }, []);
    fs.writeFileSync(PATH_KEYS, data.map(d => JSON.stringify(d)).join('\n') + '\n', 'utf8');
}
const getAllHandsScoreSaved = () => {
    fs.mkdirSync(path.dirname(PATH_SCORES), { recursive: true });
    fs.closeSync(fs.openSync(PATH_SCORES, 'a'));

    const entries = getNDJSONRead(PATH_SCORES);
    const allHandsRaw = getAllHandsPossible();
    const handsMap = allHandsRaw.sort().reduce((map, hand) => {
        const keyDetails = getHandKey(hand);
        const { key, hand: handSorted } = keyDetails;
        const keyUniq = `${key}`;
        if (key && !map.has(keyUniq) && !entries.has(keyUniq)) {
            const { score } = getHandScore(keyDetails);
            map.set(keyUniq, { key: keyUniq, hand: handSorted, score });
        }
        return map;
    }, new Map());

    const data = Array.from(handsMap.values());
    data.sort((a, b) => a.score - b.score);
    const dataNormalized = data.filter(entry => !entry.key.endsWith("!"))
    dataNormalized.forEach((entry, index) => {
        entry.value = (1 - (index / (dataNormalized.length - 1))).safe("ROUND", 5);
    });
    data.forEach((entry, index) => {
        const entrySearch = entry.key.endsWith("!") ? entry.key.slice(0, -1) + "*" : entry.key;
        const entryEqual = dataNormalized.find(e => e.key === entrySearch);
        entry.value = entryEqual.value;
    });
    fs.writeFileSync(PATH_SCORES, data.map(d => JSON.stringify(d)).join('\n') + '\n', 'utf8');
}
const getAllDiscardsKSaved = () => {
    fs.mkdirSync(path.dirname(PATH_DISCARDSK), { recursive: true });
    fs.closeSync(fs.openSync(PATH_DISCARDSK, 'a'));

    const dataMap = getNDJSONRead(PATH_SCORES);
    const data = Array.from(dataMap.values());
    const result = data.reduce((str, d) => {
        const { key } = d;
        const value = getAllDiscardsK(d.hand).k;
        str += JSON.stringify({ key, value }) + '\n';
        return str;
    }, '');

    fs.writeFileSync(PATH_DISCARDSK, result, 'utf8');
}





const getDiscardsDetailsForGivenHand = (type, hand, roundNumber, simulationNumber = 100000) => {
    const deck = Object.values(DECK);
    getArrayShuffled(deck);
    const deckLeft = deck.filter(card => !hand.includes(card));
    if (type === "MCCFR") {
        const cfr = new MonteCarloCFR();
        const strategy = cfr.run(simulationNumber);
        console.log(strategy)
        return strategy;
    } else if (type === "MCS") {
        const result = getMCSDiscardsDetails(hand, deckLeft, roundNumber, simulationNumber);
        console.log(type)
        console.log(result)
        return result;
    } else if (type === "ENUM") {
        const result = getEnumDiscardsDetails(hand, deckLeft, roundNumber);
        console.log(type)
        console.log(result)
        return result;
    }
};





const getMCSDiscardsDetails = (hand, deckLeft, roundNumber, simulationNumber) => {
    const keyDetails = getHandKey(hand);
    const results = {};
    results.key = keyDetails.key;
    let scoreFinal = Infinity;
    let indexFinal = null;

    for (let discardNumber = 0; discardNumber <= 5; discardNumber++) {
        const discardCombinations = getAllCombinations([...Array(5).keys()], discardNumber);
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
                const keyDetails = getHandKey(handNew);
                const { key } = keyDetails;

                if (roundNumber > 1 && deck.length >= 5) {
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
                    const { score } = getHandScore(keyDetails);
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
    const timeStart = performance.now();
    const result = {};
    result.key = keysMap.get([...hand].sort().join('')).value;
    const handEv = standsevMap.get(result.key);
    result.keyDiscards = `${result.key}:R${roundNumber}`;

    if (discardsMap.has(result.keyDiscards)) {
        result.ev = discardsMap.get(result.keyDiscards).value;
        return result;
    }

    result.ev = -Infinity;
    // const discardsK = discardskMap.get(result.key);
    const discardsK = getAllDiscardsK(hand).k;

    for (let discardCount = hand.length; discardCount >= 0; discardCount--) {
        for (const discards of discardsK[discardCount]) {
            const cardsKept = hand.filter(card => !discards.includes(card));
            const allCardsReceived = getAllCombinations(deckLeft, discardCount);
            const scoreAcc = allCardsReceived.reduce((acc, cardsReceived) => {
                const handNew = [...cardsKept, ...cardsReceived];
                const key = keysMap.get([...handNew].sort().join('')).value;

                if (roundNumber <= 1) {
                    acc += scoresMap.get(key).value;
                } else {
                    const deckNew = deckLeft.filter(card => !cardsReceived.includes(card));
                    const roundNext = getEnumDiscardsDetails(handNew, deckNew, roundNumber - 1);
                    acc += roundNext.ev;
                }

                return acc;
            }, 0);

            // IF (discardCount === 0) MEANING STAND PAT MEANING WE TAKE THE EV OF THE HAND
            const ev = (discardCount === 0 && roundNumber <= 1) ? handEv : scoreAcc / allCardsReceived.length;
            if (ev > result.ev) {
                result.ev = ev.safe("ROUND", 5);
                result.cards = discards;
            }
        }
    }

    const timeEnd = performance.now();
    console.log(`getEnumDiscardsDetails (round ${roundNumber}) took ${(timeEnd - timeStart).toFixed(2)}ms`);
    discardsMap.set(result.keyDiscards, { cards: result.cards, value: result.ev });
    return result;
};
const getHandExpectedValue2 = (hand, deckLeft, roundNumber) => {
    const timeStart = performance.now();
    const results = {};
    results.key = keysMap.get([...hand].sort().join("")).value;
    const score = scoresMap.get(results.key).value;

    const cacheKey = `${results.key}:R${roundNumber}`;
    if (standsevMap.has(cacheKey)) {
        results.ev = standsevMap.get(cacheKey);
        return results;
    }

    const getScore = (scoreX, score) => scoreX < score ? 1 : (scoreX === score ? 0.5 : 0);

    if (roundNumber <= 0) {
        const allHandsX = getAllCombinations(deckLeft, 5);
        const scoreAcc = allHandsX.reduce((acc, handX) => {
            const keyX = keysMap.get([...handX].sort().join("")).value;
            const scoreX = scoresMap.get(keyX).value;
            acc += getScore(scoreX, score);
            return acc
        }, 0);

        results.ev = (scoreAcc / allHandsX.length).safe("ROUND", 5);
        standsevMap.set(cacheKey, results.ev);
        console.log(`getHandExpectedValue (R0) took ${(performance.now() - timeStart).toFixed(2)} ms`);
        return results;
    }

    let win = 0;
    let tie = 0;
    let total = 0;

    const allHandsX = getAllCombinations(deckLeft, 5)
    for (const handX of allHandsX) {
        const deckLeftNew = deckLeft.filter(card => !handX.includes(card));
        for (let discardCount = 0; discardCount <= 1; discardCount++) {
            const allCardsKept = getAllCombinations(handX, handX.length - discardCount);
            for (const cardsKept of allCardsKept) {
                const deckLeftNewAfter = deckLeftNew.filter(card => !cardsKept.includes(card));
                const allCardsReceived = getAllCombinations(deckLeftNewAfter, discardCount);
                for (const cardsReceived of allCardsReceived) {
                    const handXNew = [...cardsKept, ...cardsReceived];
                    const keyX = keysMap.get([...handXNew].sort().join('')).value;
                    const scoreX = scoresMap.get(keyX).value;
                    const result = getScore(scoreX, score);
                    if (result === 1) win++;
                    else if (result === 0.5) tie++;
                    total++;
                }
            }
        }
    }

    results.ev = ((win + tie * 0.5) / total).safe("ROUND", 5);
    standsevMap.set(cacheKey, results.ev);
    console.log(results)
    console.log(`getHandExpectedValue (R1) took ${(performance.now() - timeStart).toFixed(2)} ms`);
    return results;
};




const getEnumDiscardsComputed = async (roundNumber) => {
    if (isMainThread) {
        getCacheLoadedFromNDJSON([PATH_KEYS, PATH_SCORES, PATH_STANDSEV, PATH_DISCARDSK, PATH_DISCARDSEV]);
        const handsAll = Array.from(scoresMap.entries());
        const handsMissing = handsAll.reduce((arr, [key, value]) => {
            const { hand } = value;
            const keyDiscards = `${key}:R${roundNumber}`;
            if (!discardsMap.has(keyDiscards)) {
                arr.push({ hand })
            }
            return arr;
        }, []);
        console.log(`getEnumDiscardsComputed.EntriesMissing: ${handsMissing.length}`);

        const cpuCount = os.cpus().length;
        const workers = { exit: [], instance: [] };
        const handsCountPerWorker = Math.ceil(handsMissing.length / cpuCount);

        for (let i = 0; i < cpuCount; i++) {
            const workerStart = i * handsCountPerWorker;
            const workerEnd = Math.min(workerStart + handsCountPerWorker, handsMissing.length);
            const workerHands = handsMissing.slice(workerStart, workerEnd);

            const worker = new Worker(__filename, {
                workerData: {
                    id: i,
                    hands: workerHands,
                    roundNumber
                }
            });

            workers.exit.push(new Promise(resolve => worker.on('exit', resolve)));
        }

        await Promise.all(workers.exit);
    } else {
        getCacheLoadedFromNDJSON([PATH_KEYS, PATH_SCORES, PATH_STANDSEV, PATH_DISCARDSK, PATH_DISCARDSEV]);
        const { id, hands } = workerData;

        const pathParsed = path.parse(PATH_DISCARDSEV);
        const pathDir = path.join(pathParsed.dir, `discardsev`);
        fs.mkdirSync(pathDir, { recursive: true });
        const pathNew = path.join(pathDir, `${pathParsed.name}-${id}${pathParsed.ext}`);
        const writeStream = fs.createWriteStream(pathNew, { flags: 'a' });

        let index = 0;
        function getHandsProcessed() {
            if (index >= hands.length) {
                process.exit(0);
            }

            const { hand } = hands[index];
            const deck = Object.values(DECK);
            const deckLeft = deck.filter(card => !hand.includes(card));
            const result = getEnumDiscardsDetails(hand, deckLeft, roundNumber);
            discardsMap.set(result.keyDiscards, { cards: result.cards, value: result.ev });
            writeStream.write(JSON.stringify({ key: result.keyDiscards, cards: result.cards, value: result.ev }) + '\n');

            index++;
            setImmediate(getHandsProcessed);
        }

        setImmediate(getHandsProcessed);
    }
};




const getExpectedValueDataComputed = async (roundNumber) => {
    if (isMainThread) {
        getCacheLoadedFromNDJSON([PATH_KEYS, PATH_SCORES, PATH_STANDSEV]);
        const handsAll = Array.from(scoresMap.entries());
        const handsMissing = handsAll.reduce((arr, [key, value]) => {
            const { hand } = value;
            if (!standsevMap.has(key)) {
                arr.push({ hand })
            }
            return arr;
        }, []);
        console.log(`getExpectedValueDataComputed.EntriesMissing: ${handsMissing.length}`);

        const cpuCount = os.cpus().length;
        const workers = { exit: [], instance: [] };
        const handsCountPerWorker = Math.ceil(handsMissing.length / cpuCount);

        for (let i = 0; i < cpuCount; i++) {
            const workerStart = i * handsCountPerWorker;
            const workerEnd = Math.min(workerStart + handsCountPerWorker, handsMissing.length);
            const workerHands = handsMissing.slice(workerStart, workerEnd);

            const worker = new Worker(__filename, {
                workerData: {
                    id: i,
                    hands: workerHands,
                    roundNumber
                }
            });

            workers.exit.push(new Promise(resolve => worker.on('exit', resolve)));
        }

        await Promise.all(workers.exit);
    } else {
        getCacheLoadedFromNDJSON([PATH_KEYS, PATH_SCORES, PATH_STANDSEV]);
        const { id, hands } = workerData;

        const pathParsed = path.parse(PATH_STANDSEV);
        const pathDir = path.join(pathParsed.dir, `standsev`);
        fs.mkdirSync(pathDir, { recursive: true });
        const pathNew = path.join(pathDir, `${pathParsed.name}-${id}${pathParsed.ext}`);
        const writeStream = fs.createWriteStream(pathNew, { flags: 'a' });

        let index = 0;
        function getHandsProcessed() {
            if (index >= hands.length) {
                process.exit(0);
            }

            const { hand } = hands[index];
            const deck = Object.values(DECK);
            const deckLeft = deck.filter(card => !hand.includes(card));
            const result = getHandExpectedValue(hand, deckLeft, roundNumber);
            standsevMap.set(result.key, result.ev);
            writeStream.write(JSON.stringify({ key: result.key, value: result.ev }) + '\n');

            index++;
            setImmediate(getHandsProcessed);
        }

        setImmediate(getHandsProcessed);
    }
};




const getMCSDataComputed = async (roundNumber, simulationNumber) => {
    if (isMainThread) {
        const cpuCount = os.cpus().length;
        const workers = {
            exit: [],
            instance: []
        };
        const entries = new Map();

        if (fs.existsSync(PATH_STRATEGIES)) {
            const content = fs.readFileSync(PATH_STRATEGIES, 'utf8');
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
                    PATH_STRATEGIES
                }
            });
            workers.instance.push(worker);

            worker.on('message', (content) => {
                const type = content?.type;
                const payload = content?.payload?.trim();
                const entry = JSON.parse(payload);
                if (type === "DATA" && !entries.has(entry.key)) {
                    fs.appendFileSync(PATH_STRATEGIES, payload + '\n');
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
        getCacheLoadedFromNDJSON();

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
            const { key } = getHandKey(hand);

            const cacheResultKey = `${key}:R${workerData.roundNumber}`;
            if (!CACHE.has(cacheResultKey)) {
                const deckLeft = deck.filter(card => !hand.includes(card));
                const result = getMCSDiscardsDetails(hand, deckLeft, workerData.roundNumber, 10000);
                const resultAsString = JSON.stringify(result);
                CACHE.set(cacheResultKey, resultAsString);
                parentPort.postMessage({ type: 'DATA', payload: resultAsString });
            }
        }

        process.exit(0);
    }
}




const getCacheLoadedFromNDJSON = (paths) => {
    for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.closeSync(fs.openSync(p, 'a'));
        const content = fs.readFileSync(p, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            const entry = trimmed ? JSON.parse(trimmed) : null;
            if (entry?.key) {
                if (p.includes("keys.ndjson")) {
                    const obj = { hand: entry.hand, value: entry.value };
                    Object.freeze(obj.value);
                    Object.freeze(obj.hand);   
                    keysMap.set(entry.key, obj);
                } else if (p.includes("scores.ndjson")) {
                    scoresMap.set(entry.key, { hand: entry.hand, value: entry.value });
                } else if (p.includes("discardsk.ndjson")) {
                    discardskMap.set(entry.key, entry.value);
                } else if (p.includes("discardsev.ndjson")) {
                    discardsMap.set(entry.key, { cards: entry.cards, value: entry.value });
                } else if (p.includes("standsev.ndjson")) {
                    standsevMap.set(entry.key, entry.value);
                } else if (p.includes("evs.ndjson")) {
                    evsMap.set(entry.key, entry.values);
                }
            }
        }
    }
}

const getTimeElapsed = (timeStart, signal, error) => {
    const timeElapsed = process.hrtime(timeStart);
    const timeElapsedAsMs = timeElapsed[0] * 1000 + timeElapsed[1] / 1e6;
    console.log(`\ngetTimeElapsed.${signal}.${error} : ${timeElapsedAsMs.toFixed(2)}ms`);
}

// pgrep -fl "caffeinate|MCCFR27Discards2.js"
// sudo pkill -9 -f "MCCFR27Discards2.js"
// sudo sh -c "nohup caffeinate -dims nice -n -20 node tests/MCCFR27Discards2.js > mccfr.log 2>&1 &"

const getHandDiscarded = (hand, discards, roundNumber) => {
    const details = hand.reduce((obj, card) => {
        const rank = card.slice(0, -1);
        const suit = card.slice(-1);
        obj.ranks = obj.ranks || { maxCount: 0, max: '' };
        obj.ranks[rank] = (obj.ranks[rank] || 0) + 1;
        obj.ranks.maxCount = Math.max(obj.ranks.maxCount, obj.ranks[rank]);
        obj.suits = obj.suits || { maxCount: 0, max: '' };
        obj.suits[suit] = (obj.suits[suit] || 0) + 1;
        obj.suits.maxCount = Math.max(obj.suits.maxCount, obj.suits[suit]);
        return obj;
    }, {});

    const cardsKeptMax = [];
    const cardsDiscarded = [];
    for (let i = 0; i < hand.length; i++) {
        const card = hand[i];
        const rank = card.slice(0, -1);
        const suit = card.slice(-1);
        if (discards.includes(rank)) {
            cardsDiscarded.push(card);
            details.ranks[rank]--;
            details.suits[suit]--;
            continue;
        }
        if (details.ranks[rank] > 1 && details.suits[suit] > 1) {
            cardsDiscarded.push(card);
            details.ranks[rank]--;
            details.suits[suit]--;
            continue;
        }
        cardsKeptMax.push(card);
    }

    const cardsKept = [];
    for (let i = 0; i < cardsKeptMax.length; i++) {
        const card = cardsKeptMax[i];
        const rank = card.slice(0, -1);
        const suit = card.slice(-1);
        if (details.ranks[rank] > 1) {
            cardsDiscarded.push(card);
            details.ranks[rank]--;
            details.suits[suit]--;
            continue;
        }
        cardsKept.push(card);
    }

    if (cardsKept.length === 5 && details.suits.maxCount === 5) {
        const key = keysMap.get([...cardsKept].sort().join('')).value;
        const discards = discardsMap.get(`${key}:R${roundNumber}`);
        // console.log(`${key}:R${roundNumber}`, discards)
        const discardsRank = discards.cards.map(card => card.slice(0, -1));
        return getHandDiscarded(cardsKept, discardsRank, roundNumber);
    }

    return { cardsKept, cardsDiscarded }
};

const getMCSResult = (hand = ['4s', '6d', '7s', '8s', '9s'], simulationNumber = 1000000) => {
    const key = keysMap.get([...hand].sort().join('')).value;
    const score = scoresMap.get(key).value;
    let wins = 0, ties = 0;

    for (let s = 0; s < simulationNumber; ++s) {
        const deck = Object.values(DECK)
        const deckLeft = deck.filter(c => !hand.includes(c));
        getArrayShuffled(deckLeft);

        let handX = deckLeft.splice(0, 5);

        for (let roundNumber = 3; roundNumber >= 1; --roundNumber) {

            // const discardsX = discardsMap.get(`${keyX}:R${roundNumber}`);
            // if (discardsX.cards.length === 0) break;
            // const cardsXKept = getHandDiscarded(handX, discardsX, roundNumber);
            // const cardsXReceived = deckLeft.splice(0, discardsX.cards.length);
            const { cardsKept: cardsXKept, cardsDiscarded: cardsXDiscarded } = getHandDiscarded(handX, ['10', 'J', 'Q', 'K', 'A'], roundNumber);
            const cardsXReceived = deckLeft.splice(0, cardsXDiscarded.length);
            const handXReceived = [...cardsXKept, ...cardsXReceived];
            handX = handXReceived;
        }

        const keyX = keysMap.get([...handX].sort().join('')).value;
        const scoreX = scoresMap.get(keyX).value;
        if (scoreX < score) ++wins;
        else if (scoreX === score) ++ties;
    }

    const winRate = (wins + 0.5 * ties) / simulationNumber;
    console.log(`
        hand  |  sim  |  win%+ties½
        ---------------------------
        ${key}  |  ${simulationNumber}  |  ${(100 * winRate).toFixed(2)}
        `);
}


(async () => {
    // getNDJSONKeysDuplicatedDeleted(PATH_DISCARDSEV);
    // getAllHandsKeySaved();
    // getAllHandsScoreSaved();
    // getAllDiscardsKSaved();
    // getExpectedValueDataComputed(1);
    // getNDJSONDirRead('.results/mccfr/discardsev')

    // getHandDiscardExpectedValue(['2s', '3s', '4s', '5s', '6s'], ['5s', '6s'])
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
    // await getEnumDiscardsComputed(4);

    // const hand = ["Jc", "5c", "4c", "3c", "2d"]
    // getCacheLoadedFromNDJSON([PATH_KEYS, PATH_SCORES, PATH_STANDSEV, PATH_DISCARDSK, PATH_DISCARDSEV]);
    // getMCSResult();
    // const deck = Object.values(DECK);
    // const deckLeft = deck.filter(card => !hand.includes(card));
    // getHandExpectedValue2(hand, deckLeft, 1);
    // getDiscardsDetailsForGivenHand("ENUM", hand, 1);
    // getDiscardsDetailsForGivenHand("MCS", b, 1);
    // getDiscardsDetailsForGivenHand("MCCFR");
})();










const ACTIONS = (() => {
    const out = [];
    for (let mask = 0; mask < 32; ++mask) {
        const arr = [];
        for (let i = 0; i < 5; ++i) if (mask & (1 << i)) arr.push(i);
        out.push(arr);
    }
    return out;
})();
const ACTION_COUNT = ACTIONS.length;
const regretSum = new Map();
const strategySum = new Map();
const evSum = new Map();

const getStrategyAverage = (key) => {
    const values = strategySum.get(key);
    if (!values) return Array(ACTION_COUNT).fill(1 / ACTION_COUNT);
    const total = values.reduce((acc, value) => acc + value, 0);
    return values.map(v => v / total);
}

const getStrategyReadable = (key) => {
    const strat = getStrategyAverage(key);
    const result = strat.reduce((obj, value, index) => {
        obj.key = key;
        obj.discards = obj.discards || [];
        const d = ACTIONS[index].length ? ACTIONS[index].join('') : '–';
        const v = value.safe("ROUND", 4);
        obj.discards.push([d, v]);
        return obj;
    }, {});
    result.discards.sort((a, b) => b[1] - a[1]);

    return result;
}
function getDataLoaded(paths = [PATH_REGRETS, PATH_STRATEGIES, PATH_EVS], keys = null) {
    const ndjsons = Array.from({ length: paths.length }, () => '');
    for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, 'utf8');
            const data = raw.split('\n');
            for (let j = 0; j < data.length; j++) {
                const line = data[j];
                const trimmed = line.trim();
                if (!trimmed) continue;
                const { key, values } = JSON.parse(trimmed);

                if (p.endsWith('regrets.ndjson')) {
                    if (keys?.includes(key)) regretSum.set(key, Float64Array.from(values));
                    if (!keys) regretSum.set(key, Float64Array.from(values));
                } else if (p.endsWith('strategies.ndjson')) {
                    if (keys?.includes(key)) strategySum.set(key, Float64Array.from(values));
                    if (!keys) {
                        strategySum.set(key, Float64Array.from(values));
                        const strategy = getStrategyReadable(key);
                        ndjsons[i] += (JSON.stringify(strategy) + '\n');
                    }
                } else if (p.endsWith('evs.ndjson')) {
                    if (keys?.includes(key)) evSum.set(key, values);
                    if (!keys) evSum.set(key, values);
                }
            }

            if (ndjsons[i]) fs.writeFileSync(`${PATH_STRATEGIES}-readable`, ndjsons[i]);
        }
    }
    console.log(`[MCCFR] loaded ${regretSum.size} regrets from disk`);
    console.log(`[MCCFR] loaded ${strategySum.size} strategies from disk`);
    console.log(`[MCCFR] loaded ${evSum.size} evs from disk`);
}

async function getDataFlushed(threadId = null) {
    const toLines = (map) => {
        const entries = Array.from(map.entries());
        const lines = entries.map(([key, values]) => {
            const entry = { 
                key, 
                values: values instanceof Float64Array ? [...values] : values 
            };
            return JSON.stringify(entry);
        });
        return lines.join('\n') + '\n';
    }

    if (threadId >= 0) {
        const dirRegrets = path.join(PATH_RESULTS, `regrets`);
        const dirStrategies = path.join(PATH_RESULTS, `strategies`);
        const dirEvs = path.join(PATH_RESULTS, `evs`);

        await Promise.all([
            fs.promises.mkdir(dirRegrets, { recursive: true }),
            fs.promises.mkdir(dirStrategies, { recursive: true }),
            fs.promises.mkdir(dirEvs, { recursive: true })
        ]);

        const pathRegrets = path.join(dirRegrets, `regrets-${threadId}.ndjson`);
        const pathStrategies = path.join(dirStrategies, `strategies-${threadId}.ndjson`);
        const pathEvs = path.join(dirEvs, `evs-${threadId}.ndjson`);

        await Promise.all([
            fs.promises.writeFile(pathRegrets, toLines(regretSum)),
            fs.promises.writeFile(pathStrategies, toLines(strategySum)),
            fs.promises.writeFile(pathEvs, toLines(evSum))
        ]);
    }
    
    if (threadId === null || threadId === undefined) {
        fs.mkdirSync(PATH_RESULTS, { recursive: true });
        fs.writeFileSync(PATH_REGRETS, toLines(regretSum));
        fs.writeFileSync(PATH_STRATEGIES, toLines(strategySum));
        fs.writeFileSync(PATH_EVS, toLines(evSum));
    }

    // console.log(`[MCCFR] flushed ${regretSum.size} regrets to disk`);
    // console.log(`[MCCFR] flushed ${strategySum.size} strategies to disk`);
    // console.log(`[MCCFR] flushed ${evSum.size} evs to disk`);
}

function getDataFlushedMerged(dir) {
    if (!fs.existsSync(dir)) {
        console.log(`getDataFlushedMerged.Directory(${dir}).Error`);
        return;
    }

    const files = fs.readdirSync(dir);
    const results = files.reduce((map, filePath) => {
        const filePathParsed = path.parse(filePath);
        if (filePathParsed.ext === '.ndjson') {
            const data = fs.readFileSync(path.join(dir, filePath), 'utf8');
            const lines = data.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();
                if (!trimmed) continue;
                const { key, values } = JSON.parse(line);
                if (!map.has(key)) {
                    if (values instanceof Float64Array) map.set(key, Float64Array.from(values));
                    else map.set(key, values);
                } else {
                    const arr = map.get(key);
                    for (let j = 0; j < arr.length; j++) {
                        arr[j] += values[j];
                    }
                }
            }

        }
        return map;
    }, new Map())

    const outPath = path.join(dir, '__merged__.ndjson');
    let outData = "";
    for (const [key, values] of results.entries()) {
        outData += JSON.stringify({ key, values: [...values] }) + '\n';
    }
    fs.writeFileSync(outPath, outData, 'utf8');
}

function getDataNashed() {
    getDataLoaded();

    let regretSumAvg = 0;
    let regretMaxAvg = 0;
    for (const [key, values] of regretSum.entries()) {
        const visitAcc = strategySum.get(key).reduce((acc, strat) => acc + strat, 0);
        const regretMax = Math.max(0, ...values);
        const regretAvg = regretMax / visitAcc;
        if (regretAvg <= 0.02 && visitAcc > 10_000) console.log(`[MCCFR] ${key} | count = ${visitAcc} | regretAvg = ${regretAvg}`);
        regretSumAvg += regretAvg;
        if (regretAvg > regretMaxAvg) regretMaxAvg = regretAvg;
    }
    console.log(`[MCCFR] max avg regret per node: ${regretMaxAvg}`);
    console.log(`[MCCFR] sum avg regret (≤ exploit): ${regretSumAvg}`);
}

function getScores(handA, handB) {
    const keyA = keysMap.get([...handA].sort().join('')).value;
    const scoreA = scoresMap.get(keyA).value;
    const keyB = keysMap.get([...handB].sort().join('')).value;
    const scoreB = scoresMap.get(keyB).value;
    return scoreA === scoreB ? 0 : scoreA > scoreB ? 1 : -1;
}

function getActionApplied(hand, deck, actionIdx) {
    const discardIndices = ACTIONS[actionIdx];
    const cardsKept = hand.filter((_, idx) => !discardIndices.includes(idx));
    const cardsReceived = deck.splice(0, discardIndices.length);
    const handNew = [...cardsKept, ...cardsReceived];
    const handNewKey = keysMap.get([...handNew].sort().join(''));
    return handNewKey;
}

function regretMatching(regrets) {
    const strat = new Float64Array(ACTION_COUNT);
    let normaliser = 0;
    for (let i = 0; i < ACTION_COUNT; ++i) {
        strat[i] = Math.max(0, regrets[i]);
        normaliser += strat[i];
    }
    if (normaliser === 0) {
        for (let i = 0; i < ACTION_COUNT; ++i) strat[i] = 1 / ACTION_COUNT;
    } else {
        for (let i = 0; i < ACTION_COUNT; ++i) strat[i] /= normaliser;
    }
    return strat;
}

function getBestActionIndex(strat) {
    const result = strat.reduce((obj, value, index) => {
        if (value > (obj.value ?? 0)) {
            obj.index = index;
        }
        return obj;
    }, {});
    return result.index;
}

function getRandomActionIndex(strat) {
    return (Math.random() * strat.length).safe("FLOOR", 0);
}

function getDiscardsSimulated(hkey0, hkey1, deck, roundNumber, roundNumbersFrozen) {
    const isRoundNumberFrozen = roundNumbersFrozen?.includes(roundNumber);
    const key0 = `${hkey0.value}:R${roundNumber}`;
    const key1 = `${hkey1.value}:R${roundNumber}`;

    if (!evSum.has(key0)) evSum.set(key0, [0, 0]);
    if (!evSum.has(key1)) evSum.set(key1, [0, 0]);

    if (isRoundNumberFrozen) {
        let util0 = 0;
        for (let a0 = 0; a0 < ACTION_COUNT; ++a0) {
            const p0 = strat0[a0];
            if (p0 === 0) continue;
            for (let a1 = 0; a1 < ACTION_COUNT; ++a1) {
                const p1 = strat1[a1];
                if (p1 === 0) continue;
                const pj = p0 * p1;
    
                const deckNext  = [...deck];
                const hkey0Next = getActionApplied(hkey0.hand, deckNext, a0);
                const hkey1Next = getActionApplied(hkey1.hand, deckNext, a1);
    
                const leaf = roundNumber <= 1
                    ? getScores(hkey0Next.hand, hkey1Next.hand)
                    : getDiscardsSimulated(hkey0Next, hkey1Next, deckNext, roundNumber - 1, roundNumbersFrozen);
    
                util0 += pj * leaf;
            }
        }
    
        const util1 = -util0;

        evSum.get(key0)[0]++;
        evSum.get(key1)[0]++;

        evSum.get(key0)[1] += util0;
        evSum.get(key1)[1] += util1;
    
        return util0;
    }

    ++evSum.get(key0)[0];
    ++evSum.get(key1)[0];

    const reg0 = regretSum.get(key0) || (regretSum.set(key0, new Float64Array(ACTION_COUNT)), regretSum.get(key0));
    const reg1 = regretSum.get(key1) || (regretSum.set(key1, new Float64Array(ACTION_COUNT)), regretSum.get(key1));

    const strat0 = regretMatching(reg0);
    const strat1 = regretMatching(reg1);

    const sum0 = strategySum.get(key0) || (strategySum.set(key0, new Float64Array(ACTION_COUNT)), strategySum.get(key0));
    const sum1 = strategySum.get(key1) || (strategySum.set(key1, new Float64Array(ACTION_COUNT)), strategySum.get(key1));

    for (let i = 0; i < ACTION_COUNT; ++i) {
        sum0[i] += strat0[i];
        sum1[i] += strat1[i];
    }

    const a0 = getRandomActionIndex(strat0);
    const a1 = getRandomActionIndex(strat1);

    const deckNext = [...deck];
    const hkey0Next = getActionApplied(hkey0.hand, deckNext, a0);
    const hkey1Next = getActionApplied(hkey1.hand, deckNext, a1);
    // if (!hkey0Next?.hand || !hkey1Next?.hand) console.log(deckNext.length, hkey0Next?.hand, hkey1Next?.hand)

    const util0 = roundNumber <= 1
        ? getScores(hkey0Next.hand, hkey1Next.hand)
        : getDiscardsSimulated(hkey0Next, hkey1Next, deckNext, roundNumber - 1, roundNumbersFrozen);
    const util1 = -util0;

    if (isRoundNumberFrozen) { return util0; }

    const altUtil0 = new Float64Array(ACTION_COUNT);
    const altUtil1 = new Float64Array(ACTION_COUNT);

    for (let ai = 0; ai < ACTION_COUNT; ++ai) {
        const deckA = [...deck];
        const hkey0Alt = getActionApplied(hkey0.hand, deckA, ai);
        const hkey1Fix = getActionApplied(hkey1.hand, deckA, a1);
        // if (!hkey0Alt?.hand || !hkey1Fix?.hand) console.log(deckA.length, hkey0Alt?.hand, hkey1Fix?.hand)

        altUtil0[ai] = roundNumber <= 1
            ? getScores(hkey0Alt.hand, hkey1Fix.hand)
            : getDiscardsSimulated(hkey0Alt, hkey1Fix, deckA, roundNumber - 1, roundNumbersFrozen);
    }

    for (let ai = 0; ai < ACTION_COUNT; ++ai) {
        const deckA = [...deck];
        const hkey0Fix = getActionApplied(hkey0.hand, deckA, a0);
        const hkey1Alt = getActionApplied(hkey1.hand, deckA, ai);
        // if (!hkey0Fix?.hand || !hkey1Alt?.hand) console.log(deckA.length, hkey0Fix?.hand, hkey1Alt?.hand)

        altUtil1[ai] = roundNumber <= 1
            ? -getScores(hkey0Fix.hand, hkey1Alt.hand)
            : -getDiscardsSimulated(hkey0Fix, hkey1Alt, deckA, roundNumber - 1, roundNumbersFrozen);
    }

    for (let ai = 0; ai < ACTION_COUNT; ++ai) {
        reg0[ai] += altUtil0[ai] - util0;
        reg1[ai] += altUtil1[ai] - util1;
    }

    evSum.get(key0)[1] += util0;
    evSum.get(key1)[1] += util1;

    return util0;
}

function train(iterations = 1_000_000, flushInterval = 999_999) {
    getCacheLoadedFromNDJSON([PATH_KEYS, PATH_SCORES]);
    getDataLoaded();
    let timeStart = performance.now();

    const handsAll = Array.from(scoresMap.entries());
    const hands = handsAll.map(([key, value]) => value);
    flushInterval = 999

    for (let s = 0; s < iterations; ++s) {
        for (let i = 0; i < hands.length; ++i) {
            const h0 = hands[i].hand;
            const deck = Object.values(DECK).filter(card => !h0.includes(card));
            getArrayShuffled(deck);
            const h1 = deck.splice(0, 5);
            const hkey0 = keysMap.get([...h0].sort().join(''));
            const hkey1 = keysMap.get([...h1].sort().join(''));
            getDiscardsSimulated(hkey0, hkey1, deck, 2, [1]);
        }

        if (s > 0 && s % flushInterval === 0) {
            getDataFlushed();
            const timeEnd = performance.now();
            console.log(`[MCCFR] train(${(hands.length)}/${s}) took ${(timeEnd - timeStart).safe("ROUND", 2)}ms`);
            timeStart = performance.now();
        }
    }
}

const getMCCFRComputed = async (roundNumber, roundNumbersFrozen) => {
    if (cluster.isMaster) {
        const cpuCount = (os.cpus().length * 1).safe("ROUND", 0);

        for (let id = 0; id < cpuCount; id++) {
            cluster.fork({ WORKER_ID: id });
        }

        cluster.on('exit', (worker, code) => {
            console.log(`[MCCFR] WORKER | PID=${worker.process.pid} | EXIT_CODE=${code}`);
        });
    } else {
        const workerId = Number(process.env.WORKER_ID);
        console.log(`[MCCFR] WORKER_ID=${workerId} | PID=${process.pid} | START`);

        getCacheLoadedFromNDJSON([PATH_KEYS, PATH_SCORES, PATH_EVS]);
        // const hands = Array.from(scoresMap.values()).map(entry => entry.hand);
        const hands = Array.from(scoresMap.entries()).reduce((arr, entry) => {
            const key = entry[0];
            const hand = entry[1].hand;
            const evKey = `${key}:R1`;
            const ev = evsMap.get(evKey);
            if (!ev || ev[0] < 700_000) arr.push(hand);
            return arr;
        }, []);

        const flushInterval = 100;
        const iterations = 100_000;
        let timeNow = performance.now();
        for (let s = 0; s < iterations; ++s) {
            for (let i = 0; i < hands.length; ++i) {
                const h0 = hands[i];
                const deck = Object.values(DECK).filter(card => !h0.includes(card));
                getArrayShuffled(deck);
                const h1 = deck.splice(0, 5);
                const hkey0 = keysMap.get([...h0].sort().join(''));
                const hkey1 = keysMap.get([...h1].sort().join(''));
                getDiscardsSimulated(hkey0, hkey1, deck, roundNumber, roundNumbersFrozen);
            }

            if ((s+1) % flushInterval === 0) {
                await getDataFlushed(workerId);
                const timeElapsed = (performance.now() - timeNow).safe("ROUND", 0);
                timeNow = performance.now();
                console.log(`[MCCFR] WORKER_ID=${workerId} | ITERATION=${s+1} | TIME_ELAPSED=${timeElapsed}ms`);
            }
        }
    }       
};
                
(async () => {
    // train();
    getMCCFRComputed(2, [1]);
    // getDataFlushedMerged(".results/mccfr/evs")
    // getDataFlushedMerged(".results/mccfr/regrets")
    // getDataFlushedMerged(".results/mccfr/strategies")
    // getDataLoaded();
    // getDataNashed();
})();


// const getLeafExpectedValue = () => {
//     getCacheLoadedFromNDJSON([PATH_KEYS, PATH_SCORES]);
//     getDataLoaded();
//     const leafsMap = new Map();

//     for (const [keyRA, stratA] of strategySum) {
//         if (!keyRA.endsWith(':R1')) continue;
//         const keyA = keyRA.slice(0, -3);

//         let evAcc = 0, oount = 0;
//         for (let s = 0; s < 1000; ++s) {
//             const deck = Object.values(DECK);
//             getArrayShuffled(deck);
//             const handA = scoresMap.get(keyA).hand;
//             const deckAfterHandA = deck.filter(card => !handA.includes(card));
//             const evMap = new Map();

//             const handsB = getAllCombinations(deckAfterHandA, 5);
//             for (let h = 0; h < handsB.length; ++h) {
//                 const handB = handsB[h];
//                 const deckAfterHandB = deckAfterHandA.filter(card => !handB.includes(card));
//                 const hkeyB = keysMap.get([...handB].sort().join(''));
//                 const keyRB = `${hkeyB.value}:R1`;

//                 if (evMap.has(keyRB)) {
//                     evAcc += evMap.get(keyRB);
//                     ++oount;
//                     continue;
//                 }

//                 const stratB = getStrategyAverage(keyRB);

//                 let evEnum = 0;
//                 for (let ai = 0; ai < ACTION_COUNT; ++ai) {
//                     for (let bi = 0; bi < ACTION_COUNT; ++bi) {
//                         const p = stratA[ai] * stratB[bi];
//                         if (p === 0) {
//                             console.log(ai, bi, p);
//                             continue;
//                         }

//                         const deckEnum = [...deckAfterHandB];
//                         const hkeyAEnum = getActionApplied(handA, deckEnum, ai);
//                         const hkeyBEnum = getActionApplied(hkeyB.hand, deckEnum, bi);
//                         const scores = getScores(hkeyAEnum.hand, hkeyBEnum.hand);
//                         evEnum += p * scores;
//                     }
//                 }

//                 evMap.set(keyRB, evEnum);

//                 evAcc += evEnum;
//                 ++oount;
//             }
//         }


//         const ev = (evAcc / oount).safe("ROUND", 4);
//         console.log("____", keyRA, ev);
//         leafsMap.set(keyRA, ev);
//     }
// }