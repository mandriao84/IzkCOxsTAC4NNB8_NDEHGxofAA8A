const fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const { LRUCache } = require('lru-cache');
const path = require('path');
const { randomUUID } = require('crypto');
const PATH_KEYS = path.join(process.cwd(), '.results/mccfr/keys.ndjson');
const PATH_SCORES = path.join(process.cwd(), '.results/mccfr/scores.ndjson');
const PATH_DISCARDSK = path.join(process.cwd(), '.results/mccfr/discardsk.ndjson');
const PATH_DISCARDSEV = path.join(process.cwd(), '.results/mccfr/discardsev.ndjson');
const PATH_STRATEGIES = path.join(process.cwd(), '.results/mccfr/strategies.ndjson');
const PATH_EVS = path.join(process.cwd(), '.results/mccfr/evs.ndjson');
const DECK = {
    1: '2s', 2: '3s', 3: '4s', 4: '5s', 5: '6s', 6: '7s', 7: '8s', 8: '9s', 9: '10s', 10: 'Js', 11: 'Qs', 12: 'Ks', 13: 'As',
    14: '2h', 15: '3h', 16: '4h', 17: '5h', 18: '6h', 19: '7h', 20: '8h', 21: '9h', 22: '10h', 23: 'Jh', 24: 'Qh', 25: 'Kh', 26: 'Ah',
    27: '2d', 28: '3d', 29: '4d', 30: '5d', 31: '6d', 32: '7d', 33: '8d', 34: '9d', 35: '10d', 36: 'Jd', 37: 'Qd', 38: 'Kd', 39: 'Ad',
    40: '2c', 41: '3c', 42: '4c', 43: '5c', 44: '6c', 45: '7c', 46: '8c', 47: '9c', 48: '10c', 49: 'Jc', 50: 'Qc', 51: 'Kc', 52: 'Ac'
};
const CARDS = { 'A': 13, 'K': 12, 'Q': 11, 'J': 10, '10': 9, '9': 8, '8': 7, '7': 6, '6': 5, '5': 4, '4': 3, '3': 2, '2': 1 };
const cardsLength = Object.keys(CARDS).length
const CACHE = new LRUCache ({
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

        const filePathNew = path.join(path.dirname(dir), 'discardsev.ndjson');
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
        else if (isFour) return { type: 'four', ranks: [...cardsCountKey4,...cardsCountKey1] };
        else if (isFull) return { type: 'full', ranks: [...cardsCountKey3,...cardsCountKey2] };
        else if (isFlush) return { type: 'flush', ranks: [...cardsCountKey1] };
        else if (isStraight) return { type: 'straight', ranks: [...cardsCountKey1] };
        else if (isThree) return { type: 'three', ranks: [...cardsCountKey3,...cardsCountKey1] };
        else if (isPairs) return { type: 'pairs', ranks: [...cardsCountKey2,...cardsCountKey1] };
        else if (isPair) return { type: 'pair', ranks: [...cardsCountKey2,...cardsCountKey1] };
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

    const cardsSuitPattern = function() {
        // const cardsSuitCountValues = Object.values(cardsSuitCount).sort((a, b) => b - a);
        // const special1 = cardsSuitCountSize === 2 && cardsSuitCountValues.at(0) === 4 && details.type === "high";
        // if (cardsSuitCountSize === 1) {
        //     return '-'; // flush
        // } else if (special1) {
        //     // const cardsSuitCountKey1 = cardsSuitCountKeys.find(key => cardsSuitCount[key] === 1);
        //     // const i = handCopy.findIndex(card => card.slice(-1) === cardsSuitCountKey1);
        //     // return `p${i}`
        //     return 's';
        // } else {
        //     return '*'; // unrelevant
        // }
        if (cardsSuitCountSize === 1) {
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
    results.key = keysMap.get(hand.sort().join(''));

    if (evsMap.has(results.key)) {
        results.score = evsMap.get(results.key);
        return results;
    }

    const allHandsX = getAllCombinations(deckLeft, 5);
    const score = scoresMap.get(results.key).value;

    const scores = allHandsX.reduce((acc, handX) => {
        const keyX = keysMap.get(handX.sort().join(''));
        const scoreX = scoresMap.get(keyX).value;
        const result = function() {
            if (scoreX < score) return 1;
            else if (score === scoreX) return 0.5;
            else return 0;
        }()
        acc += result
        return acc;
    }, 0);
  
    results.score = (scores / allHandsX.length).safe("ROUND", 5);
    const timeEnd = performance.now();
    console.log(`getHandExpectedValue (round ${roundNumber}) took ${(timeEnd - timeStart).toFixed(2)}ms`);
    return results;
}
const getHandWithDiscardsExpectedValue = (hand, discards, deckLeft, roundNumber) => {
    const timeStart = performance.now();
    const results = {};
    results.key = keysMap.get(hand.sort().join(''));

    if (evsMap.has(results.key)) {
        results.score = evsMap.get(results.key);
        return results;
    }

    const allCardsReceived = getAllCombinations(deckLeft, discards.length);
    const cardsKept = hand.filter(card => !discards.includes(card));

    const scores = allCardsReceived.reduce((acc, cardsReceived) => {
        const handNew = [...cardsKept,...cardsReceived];
        const deckLeftNew = deckLeft.filter(card => !handNew.includes(card));
        acc += getHandExpectedValue(handNew, deckLeftNew, roundNumber).score;
        return acc;
    }, 0);

    results.score = (scores / allCardsReceived.length).safe("ROUND", 5);
    const timeEnd = performance.now();
    console.log(`getHandWithDiscardsExpectedValue (round ${roundNumber}) took ${(timeEnd - timeStart).toFixed(2)}ms`);
    return results;
}
function evDiscardCall(myHand, keepIdx, Pot) {
    const ed = getHandWithDiscardsExpectedValue(myHand, keepIdx);
    return ed*(Pot+1) - 1;
}
function shouldPlay(hand, pot = 3, bet = 1) {
    const evHand = getHandExpectedValue(hand);
    const evPot = bet / (pot + bet);    // = 1/(3+1) = 0.25
    return evHand >= evPot;
  }





const getAllCombinations = (arr, k) => {
    let result;
    if (k === 0) {
        result = [[]];
    } else if (arr.length < k) {
        result = [];
    } else {
        const [first, ...rest] = arr;
        const withFirst = getAllCombinations(rest, k - 1).map(c => [first, ...c]);
        const withoutFirst = getAllCombinations(rest, k);
        result = [...withFirst, ...withoutFirst];
    }
    
    return result;
};
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
        const { key } = keyDetails;
        arr.push({ key: hand.sort().join(''), value: key });
        return arr;
    }, []);
    fs.writeFileSync(PATH_KEYS, data.map(d => JSON.stringify(d)).join('\n') + '\n', 'utf8');
}
const getAllHandsScoreSaved = () => {
    fs.mkdirSync(path.dirname(PATH_SCORES), { recursive: true });
    fs.closeSync(fs.openSync(PATH_SCORES, 'a'));

    const entries = getNDJSONRead(PATH_SCORES);
    const allHandsRaw = getAllHandsPossible();
    const handsMap = allHandsRaw.reduce((map, hand) => {
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
    data.forEach((entry, index) => { 
        entry.value = (1 - (index / (data.length - 1))).safe("ROUND", 5);
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
const getAllHandsWithDiscardsExpectedValueSaved = (handCardsNumber = 5) => {
    // MUST ALWAYS BE CALLED AFTER (getCacheLoadedFromNDJSON() > getAllHandsScoreSaved()> getAllHandsExpectedValueSaved())
    const content = fs.readFileSync(PATH_SCORES, 'utf8');
    const lines = content.split('\n');
    const linesNew = [];
    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) {
            console.log(`getAllHandsWithDiscardsExpectedValueSaved.LineEmpty`);
            return;
        }
        try {
            const entry = JSON.parse(trimmed);
            if (entry.key) {
                const hand = getHandFromKey(entry.key);
                const ev = getHandWithDiscardsExpectedValue(hand, );
                entry.ev = ev;
                const lineNew = JSON.stringify(entry);
                linesNew.push(lineNew);
            }
        } catch (error) {
            console.log(`getAllHandsWithDiscardsExpectedValueSaved.Error: ${error}`)
        }
    });
    fs.writeFileSync(PATH_SCORES, linesNew.join('\n'));
}





const getDiscardsDetailsForGivenHand = (type, hand, roundNumber, simulationNumber = 100000) => {
    const deck = Object.values(DECK);
    getArrayShuffled(deck);
    const deckLeft = deck.filter(card => !hand.includes(card));
    if (type === "MCS") {
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
    const handEv = evsMap.get(result.key);
    result.key = keysMap.get(hand.sort().join(''));
    result.keyDiscards = `${result.key}:R${roundNumber}`;

    if (discardsMap.has(result.keyDiscards)) {
        result.ev = discardsMap.get(result.keyDiscards);
        return result;
    }

    result.ev = -Infinity;
    const discardsK = discardskMap.get(result.key);
    
    for (let discardCount = 0; discardCount <= hand.length; discardCount++) {
        for (const discards of discardsK[discardCount]) {
            const cardsKept = hand.filter(card => !discards.includes(card));
            const allCardsReceived = getAllCombinations(deckLeft, discardCount);

            const scoreAcc = allCardsReceived.reduce((acc, cardsReceived) => {
                const handNew = [...cardsKept, ...cardsReceived];
                const key = keysMap.get(handNew.sort().join(''));

                if (roundNumber <= 1) {
                    acc += scoresMap.get(key).value;
                } else {
                    const deckNew = deckLeft.filter(card => !cardsReceived.includes(card));
                    const roundNext = getEnumDiscardsDetails(handNew, deckNew, roundNumber - 1);
                    acc += roundNext.ev;
                }

                return acc;
            }, 0);

            // IF (allCardsReceived.length === 0) MEANING STAND PAT MEANING WE TAKE THE EV OF THE HAND
            const ev = allCardsReceived.length === 0 ? handEv : scoreAcc / allCardsReceived.length;
            if (ev > result.ev) {
                result.ev = ev.safe("ROUND", 5);
                result.cards = discards;
            }
        }
    }
    
    const timeEnd = performance.now();
    console.log(`getEnumDiscardsDetails (round ${roundNumber}) took ${(timeEnd - timeStart).toFixed(2)}ms`);
    discardsMap.set(result.keyDiscards, result.ev);
    return result;
};




const getEnumDiscardsComputed = async (roundNumber) => {
    if (isMainThread) {
        getCacheLoadedFromNDJSON([PATH_KEYS, PATH_SCORES, PATH_EVS, PATH_DISCARDSK, PATH_DISCARDSEV]);
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
        getCacheLoadedFromNDJSON([PATH_KEYS, PATH_SCORES, PATH_EVS, PATH_DISCARDSK, PATH_DISCARDSEV]);
        const { id, hands } = workerData;

        const pathParsed = path.parse(PATH_DISCARDSEV);
        const pathDir = path.join(pathParsed.dir, `discards`);
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
            discardsMap.set(result.keyDiscards, result.ev);
            writeStream.write(JSON.stringify({ key: result.keyDiscards, cards: result.cards, value: result.ev }) + '\n');

            index++;
            setImmediate(getHandsProcessed);
        }

        setImmediate(getHandsProcessed);
    }
};




const getExpectedValueDataComputed = async (roundNumber) => {
    if (isMainThread) {
        getCacheLoadedFromNDJSON([PATH_KEYS, PATH_SCORES, PATH_EVS]);
        const handsAll = Array.from(scoresMap.entries());
        const handsMissing = handsAll.reduce((arr, [key, value]) => {
            const { hand } = value;
            if (!evsMap.has(key)) {
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
        getCacheLoadedFromNDJSON([PATH_KEYS, PATH_SCORES, PATH_EVS]);
        const { id, hands } = workerData;

        const pathParsed = path.parse(PATH_EVS);
        const pathDir = path.join(pathParsed.dir, `evs`);
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
            evsMap.set(result.key, result.score);
            writeStream.write(JSON.stringify({ key: result.key, value: result.score }) + '\n');

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
                    keysMap.set(entry.key, entry.value);
                } else if (p.includes("scores.ndjson")) {
                    scoresMap.set(entry.key, { hand: entry.hand, value: entry.value });
                } else if (p.includes("discardsk.ndjson")) {
                    discardskMap.set(entry.key, entry.value);
                } else if (p.includes("discardsev.ndjson")) {
                    discardsMap.set(entry.key, entry.value);
                } else if (p.includes("evs.ndjson")) {
                    evsMap.set(entry.key, entry.value);
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


(async () => {
    // getNDJSONKeysDuplicatedDeleted(PATH_DISCARDSEV);
    // getAllHandsKeySaved();
    // getAllHandsScoreSaved();
    // getAllDiscardsKSaved();
    // getNDJSONDirRead('.results/mccfr/evs')

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
    // await getEnumDiscardsComputed(3);
    // getExpectedValueDataComputed(1);

    // const a = ["10h", "6s", "5h", "4h", "3h"]
    // const b = ["10s", "Js", "Qs", "Ks", "Kc"]
    // const c = ["Js","Jh","3s","3h","2s"]
    const d = ["Qh","7s","4s","3s","2s"]
    getCacheLoadedFromNDJSON([PATH_KEYS, PATH_SCORES, PATH_EVS, PATH_DISCARDSK, PATH_DISCARDSEV]);

    getDiscardsDetailsForGivenHand("ENUM", d, 1);
    // getDiscardsDetailsForGivenHand("MCS", b, 1);
    // getAllHandsPossibleScoreSaved()
    // getTimeElapsed(timeStart, 'END', null);
})();