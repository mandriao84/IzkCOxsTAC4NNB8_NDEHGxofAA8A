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
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANKS_REF = { 'A': 13, 'K': 12, 'Q': 11, 'J': 10, 'T': 9, '9': 8, '8': 7, '7': 6, '6': 5, '5': 4, '4': 3, '3': 2, '2': 1 };
const RANKS_REF_FROM_VALUE = { 13: 'A', 12: 'K', 11: 'Q', 10: 'J', 9: 'T', 8: '9', 7: '8', 6: '7', 5: '6', 4: '5', 3: '4', 2: '3', 1: '2' };
const SUITS = ['c', 'd', 'h', 's'];
const SUITS_REF = { 'c': 0, 'd': 1, 'h': 2, 's': 3 };
const SUITS_PATTERN = {
    '00000': 0,
    '00001': 1,
    '00010': 2,
    '00011': 3,
    '00012': 4,
    '00100': 5,
    '00101': 6,
    '00102': 7,
    '00110': 8,
    '00111': 9,
    '00112': 10,
    '00120': 11,
    '00121': 12,
    '00122': 13,
    '00123': 14,
    '01000': 15,
    '01001': 16,
    '01002': 17,
    '01010': 18,
    '01011': 19,
    '01012': 20,
    '01020': 21,
    '01021': 22,
    '01022': 23,
    '01023': 24,
    '01100': 25,
    '01101': 26,
    '01102': 27,
    '01110': 28,
    '01111': 29,
    '01112': 30,
    '01120': 31,
    '01121': 32,
    '01122': 33,
    '01123': 34,
    '01200': 35,
    '01201': 36,
    '01202': 37,
    '01203': 38,
    '01210': 39,
    '01211': 40,
    '01212': 41,
    '01213': 42,
    '01220': 43,
    '01221': 44,
    '01222': 45,
    '01223': 46,
    '01230': 47,
    '01231': 48,
    '01232': 49,
    '01233': 50,
    'XXXXX': 51,
}
const SUITS_PATTERN_KEYS = Object.keys(SUITS_PATTERN);
const cardsLength = Object.keys(RANKS_REF).length
let HANDS_UINT32, HANDS_DETAILS_UINT32, HANDS_SCORE, HANDS_EV, HANDS_CANONICAL_INDEX, HAND_CANONICAL_INDEX;

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

Array.prototype.shuffleByFisherYates = function () {
    for (let i = this.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = this[i];
        this[i] = this[j];
        this[j] = tmp;
    }
    // return this;
};

Array.prototype.sortByCardRankValue = function(descending = true) {
    return this.sort((a, b) => {
        const valueA = RANKS_REF[a[0]];
        const valueB = RANKS_REF[b[0]];
        
        if (valueA !== valueB) {
            return descending ? valueB - valueA : valueA - valueB;
        }

        const suitA = SUITS_REF[a[1]];
        const suitB = SUITS_REF[b[1]];
        return descending ? suitB - suitA : suitA - suitB;
    });
};

Set.prototype.reallocate = function (array) {
    this.clear();
    for (let i = 0; i < array.length; ++i) {
        this.add(array[i]);
    }
    return this;
};

const getAllCanonicalSuitPatterns = () => {
    const patterns = new Map();

    const normalize = (pattern) => {
        const map = new Map();
        let counter = 0;
        return pattern.map(suit => {
            if (!map.has(suit)) map.set(suit, counter++);
            return map.get(suit);
        }).join('');
    };

    const generate = (pattern = []) => {
        if (pattern.length === 5) {
            const key = normalize(pattern);
            if (!patterns.has(key)) {
                patterns.set(key, patterns.size);
            }
            return;
        }
        for (let s = 0; s < 4; s++) {
            generate([...pattern, s]);
        }
    };

    generate();

    return patterns;
};

const getNDJSONAsMap = (filePath, map = new Map(), mapValuesType = Float32Array) => {
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const entries = data.split('\n');
        for (let i = 0; i < entries.length; i++) {
            const trimmed = entries[i].trim();
            if (!trimmed) continue;
            const { key, values } = JSON.parse(trimmed);
            const valuesTyped = new mapValuesType(values);
            map.set(key, valuesTyped);
        }
        // return map;
    } else {
        console.error(`getNDJSONRead.Path.Error: ${filePath}`);
    }
}

const getStrategiesReadableSaved = (strategiesMap) => {
    const getStrategyReadable = (key) => {
        const keyParts = key.split(',');
        const hd = getHandDetailsUint32AsReadable(parseInt(keyParts[0]));
        const keyDecoded = hd.ranksValue.map(r => RANKS_REF_FROM_VALUE[r]).join('') + ":" + SUITS_PATTERN_KEYS[hd.suitPatternIndex] + ',' + keyParts[1];

        const getStrategyAveraged = (key) => {
            const values = strategiesMap.get(key);
            if (!values) return Array(ACTION_COUNT).fill(1 / ACTION_COUNT);
            const total = values.reduce((acc, value) => acc + value, 0);
            return values.map(v => v / total);
        };

        const strat = getStrategyAveraged(key);
        const result = strat.reduce((obj, value, index) => {
            obj.key = keyDecoded
            obj.values = obj.values || [];
            const d = ACTIONS[index].length ? ACTIONS[index].join('') : '-';
            const v = value.safe("ROUND", 4);
            obj.values.push([d, v]);
            return obj;
        }, {});
        result.values.sort((a, b) => b[1] - a[1]);

        return result;
    }

    // const strategiesMap = getNDJSONAsMap(PATH_STRATEGIES);
    let ndjson = "";
    for (const [key, value] of strategiesMap) {
        const strategy = getStrategyReadable(key);
        ndjson += (JSON.stringify(strategy) + '\n');
    }
    fs.writeFileSync(`${PATH_STRATEGIES}-readable`, ndjson, 'utf8');
}

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

const getHandDetailsReadableAsUint32 = ({ ranksValue, suitPatternIndex }) => {
    let uint32 = 0;
    for (let i = 0; i < ranksValue.length; i++) {
        uint32 |= (ranksValue[i] & 0b11111) << (5 * (4 - i)); // 25BITS
    }
    uint32 = (uint32 << 6) | (suitPatternIndex & 0b111111); // 6BITS > (2⁶ = UPTO 64)
    return uint32 >>> 0; // FORCE UNSIGNED 32BITS
};

const getHandDetailsUint32AsReadable = (uint32) => {
    const suitPatternIndex = uint32 & 0b111111;
    const rankBits = uint32 >>> 6;
    const ranksValue = new Array(5);
    for (let i = 0; i < 5; i++) {
        const shift = 5 * (4 - i);
        ranksValue[i] = (rankBits >>> shift) & 0b11111;
    }
    return { ranksValue, suitPatternIndex };
};

const getHandDetails = (hand) => {
    let cardsRankValue = [];
    const cardsRankValueWithSuitString = [];
    const cardsRankCount = [];
    const cardsSuitCount = [];

    for (let i = 0; i < hand.length; i++) {
        const rankChar = hand[i][0];
        const rankValue = RANKS_REF[rankChar];
        const suitChar = hand[i][1];

        cardsRankValueWithSuitString.push([rankValue, suitChar]);

        cardsRankCount[rankValue] = cardsRankCount[rankValue] ?? [];
        cardsRankCount[rankValue][0] = (cardsRankCount[rankValue][0] ?? 0) + 1;
        cardsRankCount[rankValue][1] = rankValue;
        cardsRankValue.push(rankValue);

        cardsSuitCount[SUITS_REF[suitChar]] = cardsSuitCount[SUITS_REF[suitChar]] ?? [];
        cardsSuitCount[SUITS_REF[suitChar]][0] = (cardsSuitCount[SUITS_REF[suitChar]][0] ?? 0) + 1;
        cardsSuitCount[SUITS_REF[suitChar]][1] = suitChar;
    }

    const straightWithAs = [13, 4, 3, 2, 1];
    const isStraightWithAs = straightWithAs.every(v => cardsRankValue.includes(v));

    cardsRankValue.sort((a, b) => b - a);
    cardsRankValueWithSuitString.sort((a, b) => b[0] - a[0]);
    cardsRankCount.sort((a, b) => b[0] - a[0]);
    cardsSuitCount.sort((a, b) => b[0] - a[0]);

    const isHigh = cardsRankCount[0][0] === 1;
    const isPair = cardsRankCount[0][0] === 2 && cardsRankCount[1][0] === 1;
    const isPairs = cardsRankCount[0][0] === 2 && cardsRankCount[1][0] === 2;
    const isThree = cardsRankCount[0][0] === 3 && cardsRankCount[1][0] === 1;
    const isStraight = cardsRankValue.every((val, index, arr) => index === 0 || val === arr[index - 1] - 1) || isStraightWithAs  // (-1) BECAUSE (cardsValue.sort((a, b) => b - a))
    const isFlush = cardsRankCount[0][0] === 1 && cardsSuitCount[0][0] === 5;
    const isFull = cardsRankCount[0][0] === 3 && cardsRankCount[1][0] === 2;
    const isFour = cardsRankCount[0][0] === 4 && cardsRankCount[1][0] === 1;
    const isStraightFlush = isStraight && isFlush;

    const type = function () {
        if (isStraightFlush) return 8; // STRAIGHTFLUSH
        else if (isFour) return 7; // FOUR
        else if (isFull) return 6; // FULL
        else if (isFlush) return 5; // FLUSH
        else if (isStraight) return 4; // STRAIGHT
        else if (isThree) return 3; // THREE
        else if (isPairs) return 2; // PAIRS
        else if (isPair) return 1; // PAIR
        else if (isHigh) return 0; // HIGH
    }();

    const getSuitCanonicalIndex = () => {
        const map = new Map();
        let counter = 0;
        let value0count = 0;
        let value1count = 0;
        let value2count = 0;
        const result = [];
        for (let i = 0; i < cardsRankValueWithSuitString.length; i++) {
            const suit = cardsRankValueWithSuitString[i][1];
            if (!map.has(suit)) {
                map.set(suit, counter++);
            }
            const value = map.get(suit);
            result.push(value);

            if (value === 0) value0count++;
            if (i > 1) {
                if (value === 1) value1count++;
                if (value === 2) value2count++;
            }
        }

        const patternIsRelevant = value0count === 5 || value1count === 3 || value2count === 3;
        let pattern = result.join('');
        if (!patternIsRelevant) pattern = 'XXXXX';
        return SUITS_PATTERN[pattern];
    }

    const score = getHandScore({ type: type, ranksValue: cardsRankValue });
    const detailsUint32 = getHandDetailsReadableAsUint32({ ranksValue: cardsRankValue, suitPatternIndex: getSuitCanonicalIndex() });
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

    let ndjson = "";
    for (let i = 0; i < ALL_HANDS_UINT32.length; i++) {
        const hand = getHandUint32AsReadable(ALL_HANDS_UINT32[i]).sort();
        const { detailsUint32, score } = getHandDetails(hand);
        const handUint32 = getHandReadableAsUint32(hand);
        ndjson += JSON.stringify({ hand, handUint32, detailsUint32, score }) + "\n";
    }
    fs.writeFileSync(PATH_KEYS, ndjson, 'utf8');
}

const getCacheCreated = (roundNumber) => {
    const ALL_HANDS_UINT32 = getAllHandsAsUint32();
    getNDJSONAsMap(".results/mccfr/evs/__REF.ndjson", evSum, Int32Array);
    getNDJSONAsMap(".results/mccfr/regrets/__REF.ndjson", regretSum, Float32Array);
    getNDJSONAsMap(".results/mccfr/strategies/__REF.ndjson", strategySum, Float32Array);
    const evSumBottomLow = (evSum.size * 0.1).safe("ROUND", 0);
    const evSumEntries = Array.from(evSum.entries());
    evSumEntries.sort((a, b) => a[1][0] - b[1][0]);
    // const ndjson = evSumEntries.reduce((acc, r, i) => {
    //     acc += JSON.stringify(r[1][0]) + "\n";
    //     return acc
    // }, "")
    // fs.writeFileSync(`.results/mccfr/evs/tmp_evs-visit-sorted.ndjson`, ndjson, 'utf8');
    // return

    /** FIND ELBOW POINT */
    // const evSumEntriesPoints = evSumEntries.map(([key, values], i) => ({ x: i, y: Math.log(values[0] + 1), key }));
    // const pointFirst = evSumEntriesPoints[0];
    // const pointLast = evSumEntriesPoints[evSumEntriesPoints.length - 1];
    // function distanceToLine(pt, a, b) {
    //   const numerator = Math.abs((b.y - a.y) * pt.x - (b.x - a.x) * pt.y + b.x * a.y - b.y * a.x);
    //   const denominator = Math.sqrt((b.y - a.y) ** 2 + (b.x - a.x) ** 2);
    //   return numerator / denominator;
    // }
    
    // let maxDist = -Infinity;
    // let elbowIndex = -1;
    // for (let i = 1; i < evSumEntriesPoints.length - 1; i++) {
    //   const dist = distanceToLine(evSumEntriesPoints[i], pointFirst, pointLast);
    //   if (dist > maxDist) {
    //     maxDist = dist;
    //     elbowIndex = i;
    //   }
    // }
    
    // const elbowPoint = evSumEntriesPoints[elbowIndex];
    // return console.log(elbowPoint, elbowIndex);

    const evVisitBottomLowAvg = evSumEntries[evSumBottomLow - 1][1][0];

    const cache = [];
    for (let r = 0; r < roundNumber; r++) {
        for (let i = 0; i < ALL_HANDS_UINT32.length; i++) {
            const hand = getHandUint32AsReadable(ALL_HANDS_UINT32[i]).sortByCardRankValue();
            const handUint32 = getHandReadableAsUint32(hand);
            const { detailsUint32, score } = getHandDetails(hand);
            // const a = getHandDetailsUint32AsReadable(detailsUint32);
            // if (a.ranksValue[0] === 13 
            //     && a.ranksValue[1] === 13
            //     && a.ranksValue[2] === 8
            //     && a.ranksValue[3] === 8
            //     && a.ranksValue[4] === 4) console.log(hand, handUint32, detailsUint32, score);

            const key = `${detailsUint32 + "," + (r + 1)}`;
            const evValues = evSum?.get(key) || new Int32Array([1, 0]);
            const ev = (evValues[1] / evValues[0]).safe("ROUND", 6);

            cache.push([handUint32, detailsUint32, score, ev, evValues[0] <= evVisitBottomLowAvg]);
        }
    }

    /** ALWAYS ASCENDING ORDER FOR BINARY SEARCH */ 
    cache.sort((a, b) => a[0] - b[0]);
    const N = cache.length;
    HANDS_UINT32 = new Uint32Array(N);
    HANDS_DETAILS_UINT32 = new Uint32Array(N);
    HANDS_SCORE = new Uint32Array(N);
    HANDS_EV = new Float32Array(N);

    const handsCanonicalSeen = new Set();
    const handsCanonical = [];
    for (let i = 0; i < N; i++) {
        HANDS_UINT32[i] = cache[i][0];
        HANDS_DETAILS_UINT32[i] = cache[i][1];

        HANDS_SCORE[i] = cache[i][2];
        HANDS_EV[i] = cache[i][3];
        if (!handsCanonicalSeen.has(cache[i][1]) && cache[i][4]) {
            handsCanonicalSeen.add(cache[i][1]);
            handsCanonical.push(i);
            // /** DEBUG */ if (HANDS_DETAILS_UINT32[i] === 899879005) HAND_CANONICAL_INDEX = i;
        }
    }

    // fs.writeFileSync(`.results/mccfr/keys2.ndjson`, ndjson_debug, 'utf8');
    HANDS_CANONICAL_INDEX = Uint32Array.from(handsCanonical);
    // console.log(HANDS_CANONICAL_INDEX);
};

const getHu32IndexByBinarySearch = (arr, target) => {
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
                values: [...values] /** MANDATORY TO GET AN ARRAY OTHERWISE WE GET AN OBJECT EVEN WITH .slice() */ 
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

    const refMap = new Map();
    const refFilePath = files.find(file => path.parse(file).name === "__REF" && path.parse(file).ext === '.ndjson');
    if (refFilePath) {
        const data = fs.readFileSync(path.join(dir, refFilePath), 'utf8');
        const entries = data.split('\n');
        for (let i = 0; i < entries.length; i++) {
            const trimmed = entries[i].trim();
            if (!trimmed) continue;
            const { key, values } = JSON.parse(trimmed);
            refMap.set(key, values);
        }
    }

    const outName = "__MERGED";
    const mergedMap = new Map();
    for (let f = 0; f < files.length; f++) {
        const filePath = files[f];
        const filePathParsed = path.parse(filePath);
        const fileName = filePathParsed.name;
        if (filePathParsed.ext !== '.ndjson') continue;
        if (fileName === outName || fileName === "__REF.ndjson") continue;

        const data = fs.readFileSync(path.join(dir, filePath), 'utf8');
        const entries = data.split('\n');

        for (let i = 0; i < entries.length; i++) {
            const trimmed = entries[i].trim();
            if (!trimmed) continue;
            const { key, values } = JSON.parse(trimmed);
            const refValues = refMap.get(key);
            if (refValues) {
                for (let j = 0; j < values.length; j++) {
                    values[j] -= refValues[j];
                }
            }

            if (!mergedMap.has(key)) {
                mergedMap.set(key, values);
            } else {
                const arr = mergedMap.get(key);
                for (let j = 0; j < arr.length; j++) {
                    arr[j] += values[j];
                }
            }
        }
    }

    const outPath = path.join(dir, `${outName}.ndjson`);
    let outData = "";
    for (const [key, values] of mergedMap) {
        if (key.length === 4) { console.log(key); }
        const refValues = refMap.get(key);
        if (refValues) {
            for (let j = 0; j < values.length; j++) {
                values[j] += refValues[j];
            }
        }
        outData += JSON.stringify({ key, values: values }) + '\n';
    }
    fs.writeFileSync(outPath, outData, 'utf8');

    if (dir.includes('strategies')) {
        getStrategiesReadableSaved(mergedMap);
    }
}


function getDataNashed() {
    getNDJSONAsMap(".results/mccfr/regrets/__REF.ndjson", regretSum, Float32Array);
    getNDJSONAsMap(".results/mccfr/strategies/__REF.ndjson", strategySum, Float32Array);
    // getNDJSONAsMap(".results/mccfr/evs/__REF.ndjson", evSum, Int32Array);

    let regretSumAvg = 0;
    let regretMaxAvg = 0;
    let count = 0;
    let countBelow02 = 0;
    let countBelow05 = 0;
    for (const [key, values] of regretSum) {
        const strat = strategySum.get(key);
        if (!strat) continue;

        const visitAcc = strat.reduce((acc, strat) => acc + strat, 0);
        if (visitAcc === 0) continue;

        const regretAcc = values.reduce((acc, value) => acc + Math.max(0, value), 0);
        const regretAvg = regretAcc / (values.length * visitAcc);
        regretSumAvg += regretAvg;
        regretMaxAvg = Math.max(regretMaxAvg, regretAvg);
        count++;

        if (regretAvg <= 0.02) countBelow02++;
        if (regretAvg <= 0.05) countBelow05++;
        console.log(`[MCCFR] ${key} | count = ${visitAcc} | regretAvg = ${regretAvg}`);
    }

    const regretAvgMean = count > 0 ? regretSumAvg / count : 0;

    console.log(`[MCCFR] NASH_BELOW_0.02=${countBelow02} / ${count}`);
    console.log(`[MCCFR] NASH_BELOW_0.05=${countBelow05} / ${count}`);
    console.log(`[MCCFR] NASH_AVERAGE=${regretAvgMean}`);
    console.log(`[MCCFR] NASH_MAX=${regretMaxAvg}`);
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

function getActionApplied(hand, deck, deckOffset = 0, actionIndex) {
    const discardIndices = ACTIONS[actionIndex];
    const cardsKept = hand.filter((_, idx) => !discardIndices.includes(idx));
    const deckOffsetNew = deckOffset + discardIndices.length;
    if (deckOffsetNew > deck.length) throw new Error("DECK.EXHAUSTED");
    const cardsReceived = deck.slice(deckOffset, deckOffsetNew);
    const handNew = [...cardsKept, ...cardsReceived];
    handNew.sortByCardRankValue();
    // console.log(hand, discardIndices, cardsKept, handNew);

    const handUint32 = getHandReadableAsUint32(handNew);
    const handIndex = getHu32IndexByBinarySearch(HANDS_UINT32, handUint32);
    if (handIndex < 0) throw new Error("HAND.INDEX.NOT.FOUND");
    const handObj = { index: handIndex, hand: handNew, deckOffset: deckOffsetNew };
    return handObj;
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
    const n = strat.length;
    let total = 0;
    
    const arr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        total += strat[i];
        arr[i] = total;
    }

    if (total <= 0) {
        return (Math.random() * 32).safe("FLOOR", 0);
    }

    const r = Math.random() * total;
    let low = 0, high = n - 1;
    while (low < high) {
        const mid = (low + high) >>> 1;
        arr[mid] < r ? (low = mid + 1) : (high = mid);
    }
    return low;
}

function getDiscardsSimulated(h0, h1, deck, deckOffset = 0, roundNumber, roundNumbersFrozen) {
    // if (roundNumbersFrozen[roundNumber]) {
    //     const ev = HANDS_EV[h0.index];
    //     return ev;
    // }

    const p0key = `${HANDS_DETAILS_UINT32[h0.index]},${roundNumber}`;
    const p1key = `${HANDS_DETAILS_UINT32[h1.index]},${roundNumber}`;

    if (!evSum.has(p0key)) evSum.set(p0key, new Int32Array([0, 0]));
    if (!evSum.has(p1key)) evSum.set(p1key, new Int32Array([0, 0]));

    ++evSum.get(p0key)[0];
    ++evSum.get(p1key)[0];

    const p0reg = regretSum.get(p0key) || (regretSum.set(p0key, new Float32Array(ACTION_COUNT)), regretSum.get(p0key));
    const p1reg = regretSum.get(p1key) || (regretSum.set(p1key, new Float32Array(ACTION_COUNT)), regretSum.get(p1key));

    const p0strat = getStrategyFromRegret(p0reg);
    const p1strat = getStrategyFromRegret(p1reg);

    const p0stratsum = strategySum.get(p0key) || (strategySum.set(p0key, new Float32Array(ACTION_COUNT)), strategySum.get(p0key));
    const p1stratsum = strategySum.get(p1key) || (strategySum.set(p1key, new Float32Array(ACTION_COUNT)), strategySum.get(p1key));

    for (let i = 0; i < ACTION_COUNT; ++i) {
        p0stratsum[i] += p0strat[i];
        p1stratsum[i] += p1strat[i];
    }

    const p0aRnd = getRandomActionIndex(p0strat);
    const p1aRnd = getRandomActionIndex(p1strat);

    const p0hRnd = getActionApplied(h0.hand, deck, deckOffset, p0aRnd);
    const p1hRnd = getActionApplied(h1.hand, deck, p0hRnd.deckOffset, p1aRnd);
    // if (!p0hRnd?.hand || !p1hRnd?.hand) console.log(deck.length, p0hRnd?.hand, p1hRnd?.hand)

    const p0util = roundNumber <= 1
        ? getScores(p0hRnd.index, p1hRnd.index)
        : getDiscardsSimulated(p0hRnd, p1hRnd, deck, p1hRnd.deckOffset, roundNumber - 1, roundNumbersFrozen);
    const p1util = -p0util;

    // if (isRoundNumberFrozen) { return p0util; }

    const p0utilAlt = new Float32Array(ACTION_COUNT);
    const p1utilAlt = new Float32Array(ACTION_COUNT);

    if (roundNumber <= 1) {
        for (let ai = 0; ai < ACTION_COUNT; ++ai) {
            const p0hAlt = getActionApplied(h0.hand, deck, deckOffset, ai); // ALT
            const p1hFix = getActionApplied(h1.hand, deck, p0hAlt.deckOffset, p1aRnd); // FIX
            // if (!p0hAlt?.hand || !p1hFix?.hand) console.log(deck.length, p0hAlt?.hand, p1hFix?.hand)
            p0utilAlt[ai] = getScores(p0hAlt.index, p1hFix.index);
        }

        for (let ai = 0; ai < ACTION_COUNT; ++ai) {
            const p1hAlt = getActionApplied(h1.hand, deck, p0hRnd.deckOffset, ai); // ALT
            // if (!p0hRnd?.hand || !p1hAlt?.hand) console.log(deck.length, p0hRnd?.hand, p1hAlt?.hand)
            p1utilAlt[ai] = -getScores(p0hRnd.index, p1hAlt.index);
        }
    } else {
        for (let ai = 0; ai < ACTION_COUNT; ++ai) {
            const p0hAlt = getActionApplied(h0.hand, deck, deckOffset, ai); // ALT
            const p1hFix = getActionApplied(h1.hand, deck, p0hAlt.deckOffset, p1aRnd); // FIX
            // if (!p0hAlt?.hand || !p1hFix?.hand) console.log(deck.length, p0hAlt?.hand, p1hFix?.hand)
            p0utilAlt[ai] = getDiscardsSimulated(p0hAlt, p1hFix, deck, p1hFix.deckOffset, roundNumber - 1, roundNumbersFrozen);
        }

        for (let ai = 0; ai < ACTION_COUNT; ++ai) {
            const p1hAlt = getActionApplied(h1.hand, deck, p0hRnd.deckOffset, ai); // ALT
            // if (!p0hRnd?.hand || !p1hAlt?.hand) console.log(deck.length, p0hRnd?.hand, p1hAlt?.hand)
            p1utilAlt[ai] = -getDiscardsSimulated(p0hRnd, p1hAlt, deck, p1hAlt.deckOffset, roundNumber - 1, roundNumbersFrozen);
        }
    }

    for (let ai = 0; ai < ACTION_COUNT; ++ai) {
        p0reg[ai] += p0utilAlt[ai] - p0util;
        p1reg[ai] += p1utilAlt[ai] - p1util;
    }

    evSum.get(p0key)[1] += p0util;
    evSum.get(p1key)[1] += p1util;

    return p0util;
}

const getMCCFRComputed = async (roundNumber, roundNumbersFrozen) => {
    if (cluster.isMaster) {
        const cpuCount = (os.cpus().length * 10/10).safe("ROUND", 0);

        for (let id = 0; id < cpuCount; id++) {
            cluster.fork({ WORKER_ID: id });
        }

        cluster.on('exit', (worker, code) => {
            console.log(`[MCCFR] WORKER | PID=${worker.process.pid} | EXIT_CODE=${code}`);
        });
    } else {
        const workerId = Number(process.env.WORKER_ID);
        console.log(`[MCCFR] WORKER_ID=${workerId} | PID=${process.pid} | START`);
        getCacheCreated(roundNumber);

        // /** DEBUG */ HANDS_CANONICAL_INDEX = [HAND_CANONICAL_INDEX]

        const flushInterval = HANDS_CANONICAL_INDEX.length;
        const iterations = 100_000;
        let timeNow = performance.now();

        const deckRef = Object.values(DECK);

        for (let s = 0; s < iterations; ++s) {
            for (let i = 0; i < HANDS_CANONICAL_INDEX.length; ++i) {
                const p0hi = HANDS_CANONICAL_INDEX[i];
                const p0hu32 = HANDS_UINT32[p0hi];
                const p0h = getHandUint32AsReadable(p0hu32);
                const p0 = { index: p0hi, hand: p0h };

                deckRef.shuffleByFisherYates();
                const deck = deckRef.filter(card => !p0h.includes(card))

                const deckOffset = 5;
                const p1h = deck.slice(0, deckOffset);
                p1h.sortByCardRankValue();
                const p1hu32 = getHandReadableAsUint32(p1h);
                const p1hi = getHu32IndexByBinarySearch(HANDS_UINT32, p1hu32);
                const p1 = { index: p1hi, hand: p1h, deckOffset: deckOffset };

                getDiscardsSimulated(
                    p0,
                    p1,
                    deck,
                    p1.deckOffset,
                    roundNumber,
                    roundNumbersFrozen
                );

                if ((i + 1) % flushInterval === 0 || s === iterations - 1) {
                    await getDataFlushed(workerId);
                    const timeElapsed = (performance.now() - timeNow).safe("ROUND", 0);
                    timeNow = performance.now();
                    console.log(`[MCCFR] WORKER_ID=${workerId} | ITERATION=${s + 1} | HAND_ITERATION=${i + 1} | TIME_ELAPSED=${timeElapsed}ms`);
                }
            }
        }
    }
};

// pgrep -fl "caffeinate|MCCFR27Discards2.js"
// sudo pkill -9 -f "MCCFR27Discards2.js"
// sudo sh -c "nohup caffeinate -dims nice -n -20 node tests/MCCFR27Discards2.js > mccfr.log 2>&1 &"
// sudo caffeinate -dims nice -n -20 node tests/MCCFR27Discards2.js
// ps ax -o pid,pcpu,pmem,command | grep 'MCCFR27Discards2.js'

(async () => {
    // getCacheSaved();
    // getCacheCreated(1);
    // console.log(HANDS_CANONICAL_INDEX.length);


    const roundNumber = 1;
    /** (roundNumbersFrozen) >>
     * PUT 1 ON ARRAY INDEX THAT MATCH ROUND TO FREEZE
     * INDEX 0 === 0 */ 
    const roundNumbersFrozen = new Uint8Array([0, 0, 0, 0]); 
    getMCCFRComputed(roundNumber, roundNumbersFrozen);


    // [
    //     ".results/mccfr/evs",
    //     ".results/mccfr/regrets",
    //     ".results/mccfr/strategies"
    // ].forEach(dir => {
    //     getDataFlushedMerged(dir)
    // })

    // getDataNashed();
    // [MCCFR] NASH_BELOW_0.02=12859 / 14469
    // [MCCFR] NASH_BELOW_0.05=14469 / 14469
    // [MCCFR] NASH_AVERAGE=0.011055163834647268
    // [MCCFR] NASH_MAX=0.038817248740901845
})();

// const hand = ["6s", "4h", "6d", "4s", "7c"]
// const { detailsUint32, score } = getHandDetails(hand)
// console.log(hand, detailsUint32);
// console.log(getHandDetailsUint32AsReadable(detailsUint32));

// const iterations = 10000000;
// const ref = [1,2,3,4,5,6,7,8,9,10];
// const a = [1,2,3,4,5];
// const aSet = new Set(a);

// for (let i = 0; i < iterations; ++i) {
//     aSet.clear();
//     for (let j = 0; j < a.length; ++j) aSet.add(a[j]);
// }

// console.time('Array.filter performance');
// for (let i = 0; i < iterations; ++i) {
//     const r = ref.filter(x => !a.includes(x));
// }
// console.timeEnd('Array.filter performance');

/** TU START */
// getCacheCreated(1);
// const hand = [ 'Ac', 'Ad', '9s', '9h', '5s' ];
// hand.sortByCardRankValue();
// const hu32 = getHandReadableAsUint32(hand);
// const hi = getHu32IndexByBinarySearch(HANDS_UINT32, hu32);
// // const hi = HANDS_UINT32.indexOf(hu32);
// const hdu32 = getHandDetails(hand);
// const hd = getHandDetailsUint32AsReadable(hdu32.detailsUint32);
// const h = getHandUint32AsReadable(HANDS_UINT32[hi]);
// const hs = HANDS_SCORE[hi];
// const hkey = hd.ranksValue.map(r => RANKS_REF_FROM_VALUE[r]).join('') + ":" + SUITS_PATTERN_KEYS[hd.suitPatternIndex];
// console.log("hdu32_from_hand >>", hdu32);
// console.log("hd_from_hdu32 >>", hd);
// console.log("hi_from_cache >>", hi);
// console.log("hu32_from_hi >>", HANDS_UINT32[hi]);
// console.log("h_from_hi >>", h);
// console.log("hs_from_hi >>", hs);
// console.log("hkey_from_hd >>", hkey);
/** TU END */

// const hand = ["2s", "3s", "4s", "Ac", "As"];
// hand.sort();
// const hdu32 = getHandDetails(hand);
// const hd = getHandDetailsUint32AsReadable(hdu32.detailsUint32);
// const keyDecoded = hd.ranksValue.map(r => RANKS_REF_FROM_VALUE[r]).join('') + ":" + SUITS_PATTERN_KEYS[hd.suitPatternIndex] + ',';
// console.log(hdu32, hd);
// console.log(keyDecoded);


// const stratReadSum = getNDJSONAsMap(".results/mccfr/strategies-readable.ndjson");
// const keysCanonicalSet = new Map();
// for (const [key, values] of stratReadSum) {
//     const keyParts = key.split(':');
//     const rankCanonicalArr = keyParts[0].split('');
//     const suitCanonical = keyParts[1].split(',')[0];
//     const indicesString = values[0][0];
//     const indicesStringIsEmpty = indicesString === "-";
//     const indicesSet = new Set([...indicesString].map(Number));
//     let keyCanonicalNew = [];
//     let keyCanonicalNewHasX = false;
//     for (let i = 0; i < rankCanonicalArr.length; i++) {
//         if (indicesSet.has(i)) {
//             keyCanonicalNew.push('X');
//             keyCanonicalNewHasX = true;
//         } else {
//             keyCanonicalNew.push(rankCanonicalArr[i]);
//         }
//     }
//     keyCanonicalNew = keyCanonicalNew.join('') + ':' + suitCanonical;
//     if (!keysCanonicalSet.has(keyCanonicalNew)) {
//         // keysCanonicalSet.set(keyCanonicalNew, structuredClone(values));
//         keysCanonicalSet.set(keyCanonicalNew, indicesString);
//     } else {
//         // const valuesPrev = keysCanonicalSet.get(keyCanonicalNew);
//         // for (let j = 0; j < valuesPrev.length; j++) {
//         //     arr[j] += values[j];
//         // }
//         // for (let i = 0; i < valuesPrev.length; i++) {
//         //     const prevRow = valuesPrev[i];
//         //     const newRow = values[i];
//         //     for (let j = 0; j < prevRow.length; j++) {
//         //         prevRow[j] += newRow[j];
//         //     }
//         // }
//     }
// }
// console.log(keysCanonicalSet.size);
// fs.writeFileSync(`${PATH_STRATEGIES}-readable2`, [...keysCanonicalSet].sort().join('\n'), 'utf8');
