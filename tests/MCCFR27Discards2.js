const fs = require('fs');
const os = require('os');
const cluster = require('cluster');
const path = require('path');

const PATH_RESULTS = path.join(process.cwd(), '.results/mccfr');
const PATH_KEYS = path.join(PATH_RESULTS, 'keys.ndjson');
const PATH_STRATEGIES = path.join(PATH_RESULTS, 'strategies.ndjson');
const PATH_REGRETS = path.join(PATH_RESULTS, 'regrets.ndjson');
const PATH_EVS = path.join(PATH_RESULTS, 'evs.ndjson');
const DECK = {
    1: '2s', 2: '3s', 3: '4s', 4: '5s', 5: '6s', 6: '7s', 7: '8s', 8: '9s', 9: 'Ts', 10: 'Js', 11: 'Qs', 12: 'Ks', 13: 'As',
    14: '2h', 15: '3h', 16: '4h', 17: '5h', 18: '6h', 19: '7h', 20: '8h', 21: '9h', 22: 'Th', 23: 'Jh', 24: 'Qh', 25: 'Kh', 26: 'Ah',
    27: '2d', 28: '3d', 29: '4d', 30: '5d', 31: '6d', 32: '7d', 33: '8d', 34: '9d', 35: 'Td', 36: 'Jd', 37: 'Qd', 38: 'Kd', 39: 'Ad',
    40: '2c', 41: '3c', 42: '4c', 43: '5c', 44: '6c', 45: '7c', 46: '8c', 47: '9c', 48: 'Tc', 49: 'Jc', 50: 'Qc', 51: 'Kc', 52: 'Ac'
};
const CARDS = { 'A': 13, 'K': 12, 'Q': 11, 'J': 10, 'T': 9, '9': 8, '8': 7, '7': 6, '6': 5, '5': 4, '4': 3, '3': 2, '2': 1 };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['c', 'd', 'h', 's'];
const cardsLength = Object.keys(CARDS).length
let HANDS_UINT32, HANDS_DETAILS_UINT32, HANDS_SCORE, HANDS_CANONICAL_INDEX;

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

Array.prototype.filterBySet = function (set) {
    const result = new Array(this.length);
    let index = 0;
    for (let i = 0; i < this.length; ++i) {
        const value = this[i];
        if (!set.has(value)) result[index++] = value;
    }
    result.length = index;
    return result;
};

Set.prototype.reallocate = function (array) {
    this.clear();
    for (let i = 0; i < array.length; ++i) {
        this.add(array[i]);
    }
    return this;
};

function getArrayCopied(from, to) {
    for (let i = 0; i < from.length; ++i) {
        to[i] = from[i];
    }
}

const getNDJSONAsMap = (filePath) => {
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const entries = data.split('\n');
        const map = new Map();
        for (let i = 0; i < entries.length; i++) {
            const trimmed = entries[i].trim();
            if (!trimmed) continue;
            const { key, values } = JSON.parse(trimmed);
            map.set(key, values);
        }
        return map;
    } else {
        console.error(`getNDJSONRead.Path.Error: ${filePath}`);
    }
}

const getStrategiesReadableSaved = () => {
    const getStrategyReadable = (key) => {
        const getStrategyAveraged = (key) => {
            const values = strategySum.get(key);
            if (!values) return Array(ACTION_COUNT).fill(1 / ACTION_COUNT);
            const total = values.reduce((acc, value) => acc + value, 0);
            return values.map(v => v / total);
        };
    
        const strat = getStrategyAveraged(key);
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
    
    const strategiesAsMap = getNDJSONAsMap(PATH_STRATEGIES);
    let ndjson = "";
    for (const [key, value] of strategiesAsMap) {
        const strategy = getStrategyReadable(key);
        ndjson += (JSON.stringify(strategy) + '\n');
    }
    fs.writeFileSync(`${PATH_STRATEGIES}-readable`, ndjson, 'utf8');
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

const getDeckAsUint8 = () => {
    return Uint8Array.from({ length: 52 }, (_, i) => i);
};

const getAllHandsAsUint32 = () => {
    const getHandAsUint32 = (hand) => {
        let key = 0;
        for (let i = 0; i < 5; i++) {
            key |= hand[i] << (6 * (4 - i));
        }
        return key >>> 0;
    };

    const DECK = Uint8Array.from({ length: 52 }, (_, i) => i);
    const k = 5;
    const n = DECK.length;

    const total = (52 * 51 * 50 * 49 * 48) / (5 * 4 * 3 * 2 * 1); // C(52, 5)
    const result = new Uint32Array(total);

    const idx = new Uint8Array(k);
    for (let i = 0; i < k; i++) idx[i] = i;

    const hand = new Uint8Array(k);
    let pos = 0;
    while (true) {
        for (let i = 0; i < k; i++) hand[i] = DECK[idx[i]];
        result[pos++] = getHandAsUint32(hand);

        let i = k - 1;
        while (i >= 0 && idx[i] === n - k + i) i--;
        if (i < 0) break;
        idx[i]++;
        for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }

    return result;
};

const getHandReadableAsUint32 = (hand) => {
    let uint32 = 0;
    for (let i = 0; i < hand.length; i++) {
        const rank = RANKS.indexOf(hand[i][0]);
        const suit = SUITS.indexOf(hand[i][1]);
        const cardIndex = suit * RANKS.length + rank;
        uint32 |= cardIndex << (6 * (4 - i));
    }
    return uint32 >>> 0;
};

const getHandUint32AsReadable = (uint32) => {
    const hand = new Array(5);
    for (let i = 0; i < 5; i++) {
        const shift = 6 * (4 - i);
        const cardIndex = (uint32 >>> shift) & 0b111111;
        const rank = RANKS[cardIndex % RANKS.length];
        const suit = SUITS[(cardIndex / RANKS.length).safe("FLOOR", 0)];
        hand[i] = rank + suit;
    }
    return hand;
};

const getHandReadableAsUint8 = (hand) => {
    const uint8 = new Uint8Array(hand.length);
    for (let i = 0; i < hand.length; i++) {
        const rank = RANKS.indexOf(hand[i][0]);
        const suit = SUITS.indexOf(hand[i][1]);
        const cardIndex = suit * RANKS.length + rank;
        uint8[i] = cardIndex;
    }
    return uint8;
}

const getHandUint8AsReadable = (uint8) => {
    const hand = new Array(uint8.length);
    for (let i = 0; i < uint8.length; i++) {
        const cardIndex = uint8[i];
        const rank = RANKS[cardIndex % RANKS.length];
        const suit = SUITS[Math.floor(cardIndex / RANKS.length)];
        hand[i] = rank + suit;
      }
    return hand;
};

const getHandDetailsReadableAsUint32 = ({ type, ranksValue, suitPattern }) => {
    let uint32 = 0;
    for (let i = 0; i < ranksValue.length; i++) {
        uint32 |= (ranksValue[i] & 0b11111) << (5 * (4 - i));
    }
    uint32 = (uint32 << 2) | (suitPattern & 0b11);
    uint32 = (uint32 << 4) | (type & 0b1111);
    return uint32 >>> 0;
};

const getHandDetailsUint32AsReadable = (uint32) => {
    const type = uint32 & 0b1111;
    const suitPattern = (uint32 >>> 4) & 0b11;
    const rankBits = uint32 >>> 6;
    const ranksValue = new Array(5);
    for (let i = 0; i < 5; i++) {
        const shift = 5 * (4 - i);
        ranksValue[i] = (rankBits >>> shift) & 0b11111;
    }
    return { type, ranksValue, suitPattern };
};

const getHandDetails = (hand) => {
    let cardsRankValue = [];
    const cardsSuitValue = [];

    let cardRankValueMax = -1;
    let cardSuitByRankValueMax = null;
    for (let i = 0; i < hand.length; i++) {
        const rankChar = hand[i][0];
        const rankValue = CARDS[rankChar];
        const suitChar = hand[i][1];
        if (rankValue > cardRankValueMax) {
            cardRankValueMax = rankValue;
            cardSuitByRankValueMax = suitChar;
        }
        cardsRankValue.push(rankValue);
        cardsSuitValue.push(suitChar);
    }
    cardsRankValue.sort((a, b) => b - a);
    cardsSuitValue.sort((a, b) => b - a);

    const cardsRankValueCount = cardsRankValue.reduce((obj, rank) => {
        obj[rank] = (obj[rank] || 0) + 1;
        return obj
    }, {})
    const cardsSuitValueCount = cardsSuitValue.reduce((obj, suit) => {
        obj[suit] = (obj[suit] || 0) + 1;
        return obj;
    }, {});

    const cardsSuitValueCountKeys = Object.keys(cardsSuitValueCount);
    const straightWithAs = [13, 4, 3, 2, 1];
    const isStraightWithAs = straightWithAs.every(v => cardsRankValue.includes(v));
    if (isStraightWithAs) { cardsRankValue = [4, 3, 2, 1, 0]; }

    const cardsRankValueCountKeys = Object.keys(cardsRankValueCount);
    const cardsRankValueCountKey1 = cardsRankValueCountKeys.filter(r => cardsRankValueCount[r] === 1).sort((a, b) => b - a);
    const cardsRankValueCountKey2 = cardsRankValueCountKeys.filter(r => cardsRankValueCount[r] === 2).sort((a, b) => b - a);
    const cardsRankValueCountKey3 = cardsRankValueCountKeys.filter(r => cardsRankValueCount[r] === 3).sort((a, b) => b - a);
    const cardsRankValueCountKey4 = cardsRankValueCountKeys.filter(r => cardsRankValueCount[r] === 4).sort((a, b) => b - a);

    const isHigh = cardsRankValueCountKey1.length === 5;
    const isPair = cardsRankValueCountKey2.length === 1 && cardsRankValueCountKey1.length === 3;
    const isPairs = cardsRankValueCountKey2.length === 2 && cardsRankValueCountKey1.length === 1;
    const isThree = cardsRankValueCountKey3.length === 1 && cardsRankValueCountKey1.length === 2;
    const isStraight = cardsRankValue.every((val, index, arr) => index === 0 || val === arr[index - 1] - 1) // (-1) BECAUSE (cardsValue.sort((a, b) => b - a))
    const isFlush = cardsSuitValue.every(suit => suit === cardsSuitValue[0]);
    const isFull = cardsRankValueCountKey3.length === 1 && cardsRankValueCountKey2.length === 1;
    const isFour = cardsRankValueCountKey4.length === 1 && cardsRankValueCountKey1.length === 1;
    const isStraightFlush = isStraight && isFlush;
    const details = function () {
        if (isStraightFlush) return { type: 8, ranks: [...cardsRankValueCountKey1] }; // STRAIGHTFLUSH
        else if (isFour) return { type: 7, ranks: [...cardsRankValueCountKey4, ...cardsRankValueCountKey1] }; // FOUR
        else if (isFull) return { type: 6, ranks: [...cardsRankValueCountKey3, ...cardsRankValueCountKey2] }; // FULL
        else if (isFlush) return { type: 5, ranks: [...cardsRankValueCountKey1] }; // FLUSH
        else if (isStraight) return { type: 4, ranks: [...cardsRankValueCountKey1] }; // STRAIGHT
        else if (isThree) return { type: 3, ranks: [...cardsRankValueCountKey3, ...cardsRankValueCountKey1] }; // THREE
        else if (isPairs) return { type: 2, ranks: [...cardsRankValueCountKey2, ...cardsRankValueCountKey1] }; // PAIRS
        else if (isPair) return { type: 1, ranks: [...cardsRankValueCountKey2, ...cardsRankValueCountKey1] }; // PAIR
        else if (isHigh) return { type: 0, ranks: [...cardsRankValueCountKey1] }; // HIGH
    }();

    const cardsSuitPattern = function () {
        const cardsSuitByRankValueMax = cardsSuitValue.filter(suit => suit === cardSuitByRankValueMax);
        if (cardsRankValueCountKey1.length === 5 && cardsSuitValueCountKeys.length === 2 && cardsSuitByRankValueMax.length === 1) {
            return 2; // 4 SUITED + 1 OFFSUITED (HIGHEST CARD)
        } else if (cardsSuitValueCountKeys.length === 1) {
            return 1; // SUITED
        } else {
            return 0; // OFFSUITED
        }
    }()

    const score = getHandScore({ type: details.type, ranksValue: cardsRankValue });
    const detailsUint32 = getHandDetailsReadableAsUint32({ type: details.type, ranksValue: cardsRankValue, suitPattern: cardsSuitPattern });
    return { detailsUint32, score };
}

const getHandScore = ({ type, ranksValue }) => {
    let score = 0
    const multiplier = cardsLength + 1
    if (type === 8) { // STRAIGHTFLUSH
        score = 8000000 + ranksValue.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranksValue.length - 1 - index)), 0);
    } else if (type === 7) { // FOUR
        score = 7000000 + ranksValue.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranksValue.length - 1 - index)), 0);
    } else if (type === 6) { // FULL
        score = 6000000 + ranksValue.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranksValue.length - 1 - index)), 0);
    } else if (type === 5) { // FLUSH
        score = 5000000 + ranksValue.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranksValue.length - 1 - index)), 0);
    } else if (type === 4) { // STRAIGHT
        score = 4000000 + ranksValue.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranksValue.length - 1 - index)), 0);
    } else if (type === 3) { // THREE
        score = 3000000 + ranksValue.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranksValue.length - 1 - index)), 0);
    } else if (type === 2) { // PAIRS
        score = 2000000 + ranksValue.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranksValue.length - 1 - index)), 0);
    } else if (type === 1) { // PAIR
        score = 1000000 + ranksValue.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranksValue.length - 1 - index)), 0);
    } else if (type === 0) { // HIGH
        score = ranksValue.reduce((acc, val, index) => acc + (val * Math.pow(multiplier, ranksValue.length - 1 - index)), 0);
    }

    return score;
}

const getCacheSaved = () => {
    fs.mkdirSync(path.dirname(PATH_KEYS), { recursive: true });
    fs.closeSync(fs.openSync(PATH_KEYS, 'a'));
    const ALL_HANDS_UINT32 = getAllHandsAsUint32();
    ALL_HANDS_UINT32.sort();

    let ndjson = "";
    for (let i = 0; i < ALL_HANDS_UINT32.length; i++) {
        const hand = getHandUint32AsReadable(ALL_HANDS_UINT32[i]).sort();
        const handId = hand.join('');
        const { detailsUint32, score } = getHandDetails(hand);
        const handUint32 = getHandReadableAsUint32(hand);
        ndjson += JSON.stringify({ handId, hand, handUint32, detailsUint32, score }) + "\n";
    }
    fs.writeFileSync(PATH_KEYS, ndjson, 'utf8');
}

const getCacheCreated = () => {
    const allHands = getAllHandsAsUint32();
    const cache = [];
    for (let i = 0; i < allHands.length; i++) {
        const hand = getHandUint32AsReadable(allHands[i]).sort();
        const handUint32 = getHandReadableAsUint32(hand);
        const { detailsUint32, score } = getHandDetails(hand);
        cache.push([handUint32, detailsUint32, score]);
    }

    cache.sort((a, b) => a[0] - b[0]);
    const N = cache.length;
    HANDS_UINT32 = new Uint32Array(N);
    HANDS_DETAILS_UINT32 = new Uint32Array(N);
    HANDS_SCORE = new Uint32Array(N);

    const handsCanonicalSeen = new Set();
    const handsCanonical = [];
    for (let i = 0; i < N; i++) {
        HANDS_UINT32[i] = cache[i][0];
        HANDS_DETAILS_UINT32[i] = cache[i][1];
        HANDS_SCORE[i] = cache[i][2];
        if (!handsCanonicalSeen.has(cache[i][1])) {
            handsCanonicalSeen.add(cache[i][1]);
            handsCanonical.push(i);
        }
    }

    HANDS_CANONICAL_INDEX = Uint32Array.from(handsCanonical);
};

const getIndexByBinarySearch = (arr, target) => {
    let low = 0;
    let high = arr.length - 1;
    while (low <= high) {
        const mid = (low + high) >>> 1;
        const val = arr[mid];
        if (val === target) return mid;
        if (val < target) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return -1;
};

// pgrep -fl "caffeinate|MCCFR27Discards2.js"
// sudo pkill -9 -f "MCCFR27Discards2.js"
// sudo sh -c "nohup caffeinate -dims nice -n -20 node tests/MCCFR27Discards2.js > mccfr.log 2>&1 &"
// ps ax -o pid,pcpu,pmem,command | grep 'MCCFR27Discards2.js'










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

async function getDataFlushed(threadId = null) {
    const toLines = (map) => {
        let lines = '';
        for (const [key, values] of map) {
            const entry = { 
                key, 
                values: values instanceof Float32Array ? [...values] : values 
            };
            lines += JSON.stringify(entry) + '\n';
        }
        return lines;
    };

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
}

function getDataFlushedMerged(dir) {
    if (!fs.existsSync(dir)) {
        console.log(`getDataFlushedMerged.Dir(${dir}).Error`);
        return;
    }

    const files = fs.readdirSync(dir);
    const result = files.reduce((map, filePath) => {
        const filePathParsed = path.parse(filePath);
        if (filePathParsed.ext === '.ndjson') {
            const data = fs.readFileSync(path.join(dir, filePath), 'utf8');
            const entries = data.split('\n');

            for (let i = 0; i < entries.length; i++) {
                const trimmed = entries[i].trim();
                if (!trimmed) continue;
                const { key, values } = JSON.parse(trimmed);
                if (!map.has(key)) {
                    if (values instanceof Float32Array) map.set(key, Float32Array.from(values));
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
    for (const [key, values] of result) {
        outData += JSON.stringify({ key, values: [...values] }) + '\n';
    }
    fs.writeFileSync(outPath, outData, 'utf8');
}

function getDataNashed() {
    let regretSumAvg = 0;
    let regretMaxAvg = 0;
    let count = 0;
    for (const [key, values] of regretSum.entries()) {
        const visitAcc = strategySum.get(key).reduce((acc, strat) => acc + strat, 0);
        const regretAcc = values.reduce((acc, value) => acc + Math.max(0, value), 0);
        const regretAvg = regretAcc / (values.length * visitAcc);
        regretSumAvg += regretAvg;
        regretMaxAvg = Math.max(regretMaxAvg, regretAvg);
        count++;
        console.log(`[MCCFR] ${key} | count = ${visitAcc} | regretAvg = ${regretAvg}`);
        if (regretAvg <= 0.02 && visitAcc > 10_000) console.log(`[MCCFR] ${key} | count = ${visitAcc} | regretAvg = ${regretAvg}`);
    }

    const regretAvgMean = count > 0 ? regretSumAvg / count : 0;

    console.log(`[MCCFR] max avg regret per node: ${regretMaxAvg}`);
    console.log(`[MCCFR] sum avg regret (≤ exploit): ${regretAvgMean}`);
}

function getNashEquilibrium(key, regret, strategy) {
    const visitAcc = strategy.reduce((acc, strat) => acc + strat, 0);
    const regretAcc = regret.reduce((acc, value) => acc + Math.max(0, value), 0);
    const regretAvg = regretAcc / (regret.length * visitAcc);
    console.log(`[MCCFR] ${key} | COUNT=${visitAcc} | REGRETAVG=${regretAvg}`);
}

function getScores(p0i, p1i) {
    const p0s = HANDS_SCORE[p0i];
    const p1s = HANDS_SCORE[p1i];
    return p0s === p1s ? 0 : p0s < p1s ? 1 : -1;
}

function getActionApplied(hand, deck, actionIndex) {
    const discardIndices = ACTIONS[actionIndex];
    const cardsKept = hand.filter((_, idx) => !discardIndices.includes(idx));
    const cardsReceived = deck.splice(0, discardIndices.length);
    const handNew = [...cardsKept, ...cardsReceived];
    handNew.sort();

    const handUint32 = getHandReadableAsUint32(handNew);
    const handIndex = getIndexByBinarySearch(HANDS_UINT32, handUint32);
    const handDetailsUint32 = HANDS_DETAILS_UINT32[handIndex];
    const handDetails = getHandDetailsUint32AsReadable(handDetailsUint32);
    const handObj = { index: handIndex, hand: handNew, details: handDetails };
    return handObj;
}
function getActionApplied2(hand, deck, actionIndex, p) {
    const discardIndices = ACTIONS[actionIndex];
    const cardsKept = hand.filter((_, idx) => !discardIndices.includes(idx));
    const cardsReceived = deck.splice(0, discardIndices.length);
    const handNew = [...cardsKept, ...cardsReceived];
    handNew.sort();
    p.hand = handNew;

    const handUint32 = getHandReadableAsUint32(handNew);
    p.index = getIndexByBinarySearch(HANDS_UINT32, handUint32);
    const handDetailsUint32 = HANDS_DETAILS_UINT32[p.index];
    p.details  = getHandDetailsUint32AsReadable(handDetailsUint32);
}

function getStrategyFromRegret(regret) {
    const strat = new Float32Array(ACTION_COUNT);
    let normaliser = 0;
    for (let i = 0; i < ACTION_COUNT; ++i) {
        strat[i] = Math.max(0, regret[i]);
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

function getDiscardsSimulated(h0, h1, deck, roundNumber, roundNumbersFrozen) {
    const isRoundNumberFrozen = roundNumbersFrozen?.includes(roundNumber);
    const key0 = `${HANDS_DETAILS_UINT32[h0.index]},${roundNumber}`;
    const key1 = `${HANDS_DETAILS_UINT32[h1.index]},${roundNumber}`;

    if (!evSum.has(key0)) evSum.set(key0, [0, 0]);
    if (!evSum.has(key1)) evSum.set(key1, [0, 0]);

    ++evSum.get(key0)[0];
    ++evSum.get(key1)[0];

    const reg0 = regretSum.get(key0) || (regretSum.set(key0, new Float32Array(ACTION_COUNT)), regretSum.get(key0));
    const reg1 = regretSum.get(key1) || (regretSum.set(key1, new Float32Array(ACTION_COUNT)), regretSum.get(key1));

    const strat0 = getStrategyFromRegret(reg0);
    const strat1 = getStrategyFromRegret(reg1);

    // getNashEquilibrium(key0, reg0, strat0);
    // getNashEquilibrium(key1, reg1, strat1);

    const sum0 = strategySum.get(key0) || (strategySum.set(key0, new Float32Array(ACTION_COUNT)), strategySum.get(key0));
    const sum1 = strategySum.get(key1) || (strategySum.set(key1, new Float32Array(ACTION_COUNT)), strategySum.get(key1));

    for (let i = 0; i < ACTION_COUNT; ++i) {
        sum0[i] += strat0[i];
        sum1[i] += strat1[i];
    }

    // if (isRoundNumberFrozen) {
    //     let util0 = 0;
    //     for (let a0 = 0; a0 < ACTION_COUNT; ++a0) {
    //         const p0 = strat0[a0];
    //         if (p0 === 0) continue;
    //         for (let a1 = 0; a1 < ACTION_COUNT; ++a1) {
    //             const p1 = strat1[a1];
    //             if (p1 === 0) continue;
    //             const pj = p0 * p1;
    
    //             getArrayCopied(deck, deckNext);
    //             const h0Next = getActionApplied(h0.hand, deckNext, a0);
    //             const h1Next = getActionApplied(h1.hand, deckNext, a1);
    
    //             const leaf = roundNumber <= 1
    //                 ? getScores(h0Next.index, h1Next.index)
    //                 : getDiscardsSimulated(h0Next, h1Next, deckNext, roundNumber - 1, roundNumbersFrozen);
    
    //             util0 += pj * leaf;
    //         }
    //     }
    
    //     const util1 = -util0;
    //     evSum.get(key0)[1] += util0;
    //     evSum.get(key1)[1] += util1;
    
    //     return util0;
    // }

    const a0 = getRandomActionIndex(strat0);
    const a1 = getRandomActionIndex(strat1);

    const deckNext = deck.slice();
    const h0Next = getActionApplied(h0.hand, deckNext, a0);
    const h1Next = getActionApplied(h1.hand, deckNext, a1);
    // if (!h0Next?.hand || !h1Next?.hand) console.log(deckNext.length, h0Next?.hand, h1Next?.hand)

    const util0 = roundNumber <= 1
        ? getScores(h0Next.index, h1Next.index)
        : getDiscardsSimulated(h0Next, h1Next, deckNext, roundNumber - 1, roundNumbersFrozen);
    const util1 = -util0;

    if (isRoundNumberFrozen) { return util0; }

    const altUtil0 = new Float32Array(ACTION_COUNT);
    const altUtil1 = new Float32Array(ACTION_COUNT);

    if (roundNumber <= 1) {
        for (let ai = 0; ai < ACTION_COUNT; ++ai) {
            const deckNext = deck.slice();
            const h0Alt = getActionApplied(h0.hand, deckNext, ai); // ALT
            const h1Fix = getActionApplied(h1.hand, deckNext, a1); // FIX
            // if (!h0Alt?.hand || !h1Fix?.hand) console.log(deckNext.length, h0Alt?.hand, h1Fix?.hand)
            altUtil0[ai] = getScores(h0Alt.index, h1Fix.index)
        }

        for (let ai = 0; ai < ACTION_COUNT; ++ai) {
            const deckNext = deck.slice();
            const h0Fix = getActionApplied(h0.hand, deckNext, a0); // FIX
            const h1Alt = getActionApplied(h1.hand, deckNext, ai); // ALT
            // if (!h0Fix?.hand || !h1Alt?.hand) console.log(deckNext.length, h0Fix?.hand, h1Alt?.hand)
            altUtil1[ai] = -getScores(h0Fix.index, h1Alt.index)
        }
    } else {
        for (let ai = 0; ai < ACTION_COUNT; ++ai) {
            const deckNext = deck.slice();
            const h0Alt = getActionApplied(h0.hand, deckNext, ai); // ALT
            const h1Fix = getActionApplied(h1.hand, deckNext, a1); // FIX
            // if (!h0Alt?.hand || !h1Fix?.hand) console.log(deckNext.length, h0Alt?.hand, h1Fix?.hand)
            altUtil0[ai] = getDiscardsSimulated(h0Alt, h1Fix, deckNext, roundNumber - 1, roundNumbersFrozen);
        }
    
        for (let ai = 0; ai < ACTION_COUNT; ++ai) {
            const deckNext = deck.slice();
            const h0Fix = getActionApplied(h0.hand, deckNext, a0); // FIX
            const h1Alt = getActionApplied(h1.hand, deckNext, ai); // ALT
            // if (!h0Fix?.hand || !h1Alt?.hand) console.log(deckNext.length, h0Fix?.hand, h1Alt?.hand)
            altUtil1[ai] = -getDiscardsSimulated(h0Fix, h1Alt, deckNext, roundNumber - 1, roundNumbersFrozen);
        }
    }

    for (let ai = 0; ai < ACTION_COUNT; ++ai) {
        reg0[ai] += altUtil0[ai] - util0;
        reg1[ai] += altUtil1[ai] - util1;
    }

    evSum.get(key0)[1] += util0;
    evSum.get(key1)[1] += util1;

    return util0;
}

const getMCCFRComputed = async (roundNumber, roundNumbersFrozen) => {
    if (cluster.isMaster) {
        const cpuCount = (os.cpus().length * 4/7).safe("ROUND", 0);

        for (let id = 0; id < cpuCount; id++) {
            cluster.fork({ WORKER_ID: id });
        }

        cluster.on('exit', (worker, code) => {
            console.log(`[MCCFR] WORKER | PID=${worker.process.pid} | EXIT_CODE=${code}`);
        });
    } else {
        const workerId = Number(process.env.WORKER_ID);
        console.log(`[MCCFR] WORKER_ID=${workerId} | PID=${process.pid} | START`);
        getCacheCreated();

        const flushInterval = HANDS_CANONICAL_INDEX.length;
        const iterations = 100_000;
        let timeNow = performance.now();

        const deckRef = Object.values(DECK);
        const p0hSet = new Set();

        for (let s = 0; s < iterations; ++s) {
            for (let i = 0; i < HANDS_CANONICAL_INDEX.length; ++i) {
                const p0hi = HANDS_CANONICAL_INDEX[i];
                const p0hu32 = HANDS_UINT32[p0hi];
                const p0h = getHandUint32AsReadable(p0hu32);
                const p0hObj = { index: p0hi, hand: p0h };

                // (RE)ALLOCATE (p0hSet)
                p0hSet.reallocate(p0h);

                const deck = deckRef.slice();
                getArrayShuffled(deck);

                const deckNext = deck.filterBySet(p0hSet);

                const p1h = deckNext.splice(0, 5);
                p1h.sort();
                const p1hu32 = getHandReadableAsUint32(p1h);
                const p1hi = getIndexByBinarySearch(HANDS_UINT32, p1hu32);
                const p1hObj = { index: p1hi, hand: p1h };

                getDiscardsSimulated(
                    p0hObj, 
                    p1hObj, 
                    deckNext, 
                    roundNumber, 
                    roundNumbersFrozen
                );

                if ((i+1) % flushInterval === 0) {
                    await getDataFlushed(workerId);
                    const timeElapsed = (performance.now() - timeNow).safe("ROUND", 0);
                    timeNow = performance.now();
                    console.log(`[MCCFR] WORKER_ID=${workerId} | ITERATION=${s+1} | HAND_ITERATION=${i+1} | TIME_ELAPSED=${timeElapsed}ms`);
                }
            }
        }
    }       
};
                
(async () => {
    // getCacheSaved();
    // getStrategiesReadableSaved()
    getMCCFRComputed(1, []);
    // getDataFlushedMerged(".results/mccfr/evs")
    // getDataFlushedMerged(".results/mccfr/regrets")
    // getDataFlushedMerged(".results/mccfr/strategies")
    // getDataLoaded();
    // getDataNashed();
})();

// const hand = ["6s", "4h", "6d", "4s", "7c"]
// const a = hand.spliceFromStart(2);
// const { detailsUint32, score } = getHandDetails(hand)
// console.log(hand, detailsUint32);
// console.log(getHandDetailsUint32AsReadable(detailsUint32));

// const iterations = 100;
// const ref = [1,2,3,4,5,6,7,8,9,10];
// const a = [1,2,3,4,5];
// const aSet = new Set(a);

// for (let i = 0; i < iterations; ++i) {
//     aSet.clear();
//     for (let j = 0; j < a.length; ++j) aSet.add(a[j]);
//     console.log([...aSet])
// }

// for (let i = 0; i < iterations; ++i) {
//     const n = ref.filterBySet(aSet);
//     console.log(n)
// }
