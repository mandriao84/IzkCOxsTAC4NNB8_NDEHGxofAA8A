const fs = require('fs');
const os = require('os');
const cluster = require('cluster');
const readline = require('readline');
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
const CARDS_KEYS = function () {
    const result = {};
    for (const card of Object.values(DECK)) {
        const r = RANKS_REF[card[0]];
        const s = SUITS_REF[card[1]];
        result[card] = (r << 2) | s;
    }
    return result;
}();
const KEY_SHIFT_MULTIPLIER = 16;
let HANDS_UINT32, HANDS_DETAILS_UINT32, HANDS_SCORE, HANDS_EV_FLAT, HANDS_CANONICAL_INDEX;

Number.prototype.safe = function (method = "FLOOR", decimals = 2) {
  const v = +this;
  let f;

  if (decimals >>> 0 <= 6) {
    f = [1, 10, 100, 1000, 10000, 100000, 1000000][decimals >>> 0];
  } else {
    decimals |= 0;
    if (decimals < 0) decimals = -decimals;
    f = 10 ** decimals;
  }

  switch (method) {
    case "ROUND":
      return Math.round((v + Number.EPSILON) * f) / f;
    case "CEIL":
      return Math.ceil(v * f) / f;
    case "FLOOR":
      return Math.floor(v * f) / f;
    default:
      throw new Error("Number.prototype.safe.method.Error: ['round', 'floor', 'ceil']");
  }
};

Float64Array.prototype.getflat = function(index, roundNumber, roundNumberMax) {
    const flatindex = index * roundNumberMax + (roundNumber - 1);
    return this[flatindex].safe("ROUND", 6);
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

// Array.prototype.sortByCardRankValue = function(descending = true) {
//     return this.sort((a, b) => {
//         const valueA = RANKS_REF[a[0]];
//         const valueB = RANKS_REF[b[0]];
        
//         if (valueA !== valueB) {
//             return descending ? valueB - valueA : valueA - valueB;
//         }

//         const suitA = SUITS_REF[a[1]];
//         const suitB = SUITS_REF[b[1]];
//         return descending ? suitB - suitA : suitA - suitB;
//     });
// };

Array.prototype.sortByCardRankValue = (function () {
    const k = CARDS_KEYS;

    function desc(a, b) {
        return k[b] - k[a];
    }

    function asc(a, b) {
        return k[a] - k[b];
    }

    function desc5(arr) {
        const keys = [
            k[arr[0]],
            k[arr[1]],
            k[arr[2]],
            k[arr[3]],
            k[arr[4]],
        ];
        let t, tk;

        function swap(i, j) {
            t = arr[i];
            arr[i] = arr[j];
            arr[j] = t;
            tk = keys[i];
            keys[i] = keys[j];
            keys[j] = tk;
        }

        if (keys[0] < keys[1]) swap(0, 1);
        if (keys[3] < keys[4]) swap(3, 4);
        if (keys[2] < keys[4]) swap(2, 4);
        if (keys[2] < keys[3]) swap(2, 3);
        if (keys[1] < keys[4]) swap(1, 4);
        if (keys[0] < keys[3]) swap(0, 3);
        if (keys[0] < keys[2]) swap(0, 2);
        if (keys[1] < keys[3]) swap(1, 3);
        if (keys[1] < keys[2]) swap(1, 2);

        return arr;
    }

    return function sortByCardRankValue(descending = true) {
        if (this.length === 5 && descending) {
            return desc5(this);
        }
        return this.sort(descending ? desc : asc);
    };
})();

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

const getNDJSONAsMap = (filePath, map = new Map(), mapValuesType = Float64Array) => {
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
        // const roundNumber = key % KEY_SHIFT_MULTIPLIER;
        // const detailsUint32 = (key / KEY_SHIFT_MULTIPLIER).safe("FLOOR", 0);
        // const hd = getHandDetailsUint32AsReadable(detailsUint32);
        // const keyDecoded = hd.ranksValue.map(r => RANKS_REF_FROM_VALUE[r]).join('') + ":" + SUITS_PATTERN_KEYS[hd.suitPatternIndex] + ',' + roundNumber;
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
    const roundNumberIndexMax = roundNumber + 1;
    const ALL_HANDS_UINT32 = getAllHandsAsUint32();
    getNDJSONAsMap(".results/mccfr/evs/__REF.ndjson", evSum, Float64Array);
    getNDJSONAsMap(".results/mccfr/regrets/__REF.ndjson", regretSum, Float64Array);
    getNDJSONAsMap(".results/mccfr/strategies/__REF.ndjson", strategySum, Float64Array);
    // const evSumBottomLow = (evSum.size * 1).safe("ROUND", 0);
    // const evSumEntries = Array.from(evSum.entries());
    // evSumEntries.sort((a, b) => a[1][0] - b[1][0]);
    // const evVisitBottomLowAvg = evSumEntries[evSumBottomLow - 1][1][0];

    const cache = [];
    for (let i = 0; i < ALL_HANDS_UINT32.length; i++) {
        const hand = getHandUint32AsReadable(ALL_HANDS_UINT32[i]).sortByCardRankValue();
        const handUint32 = getHandReadableAsUint32(hand);
        const { detailsUint32, score } = getHandDetails(hand);
        const visits = new Uint8Array(roundNumberIndexMax); /** PUT 1 ON INDEX THAT MATCH THE ROUND */
        const evs = new Float64Array(roundNumberIndexMax); /** PUT VALUE ON INDEX THAT MATCH THE ROUND */

        for (let r = roundNumber; r > 0; r--) { 
            const key = `${detailsUint32 + "," + r}`;
            // const key = (detailsUint32 * KEY_SHIFT_MULTIPLIER) + r;
            const evValues = evSum.get(key) || new Float64Array([1, 0]);
            const evVisit = evValues[0];
            const ev = (evValues[1] / evVisit);
            evs[r] = ev;

            if (evVisit === 1) {
                console.log(`EV_VISIT_IS_ONE=${key}`);
                visits[r] = 1;
                continue;
            }

            /** CHECK REGRET AVERAGE */
            const strategyValues = strategySum.get(key);
            const visitAcc = strategyValues.reduce((acc, strat) => acc + strat, 0);
            const regretValues = regretSum.get(key);

            let rvmax = 0;
            for (let rv = 0; rv < regretValues.length; rv++) {
                const v = regretValues[rv];
                if (v > rvmax) rvmax = v;
            }
            const rva = rvmax / visitAcc;
            if (rva > 0.05) {
                visits[r] = 1;
                continue;
            }
        }
        cache.push([handUint32, detailsUint32, score, evs, visits]);
    }

    /** DEBUG_START - EVS */
    // const evscache = cache.slice().sort((a, b) => b[3] - a[3]); // need to sort by evs to get top evs
    // const evsoutputdir = path.join(PATH_RESULTS, 'evs');
    // let evsoutput = '';
    // const evsseen = new Set();
    // for (const [handUint32, detailsUint32, score, evs, visits] of evscache) {
    //     if (evsseen.has(key)) continue;
    //     const keyparts = key.split(',');
    //     const hd = getHandDetailsUint32AsReadable(parseInt(keyparts[0]));
    //     const keystring = hd.ranksValue.map(r => RANKS_REF_FROM_VALUE[r]).join('') + ":" + SUITS_PATTERN_KEYS[hd.suitPatternIndex] + ',' + keyparts[1];
    //     evsoutput += JSON.stringify({ key: key, values: [keystring, evs] }) + '\n';
    //     evsseen.add(key);
    // }
    // fs.mkdirSync(evsoutputdir, { recursive: true });
    // fs.writeFileSync(path.join(evsoutputdir, 'readable.ndjson'), evsoutput);
    /** DEBUG_END - EVS */

    /** ALWAYS ASCENDING ORDER FOR BINARY SEARCH (BY HANDS_UINT32 THEN ROUND) */ 
    const N = cache.length;
    cache.sort((a, b) => a[0] - b[0]);
    HANDS_UINT32 = new Uint32Array(N);
    HANDS_DETAILS_UINT32 = new Uint32Array(N);
    HANDS_SCORE = new Uint32Array(N);
    HANDS_EV_FLAT = new Float64Array(N * roundNumber);

    const handsCanonicalSeen = new Set();
    const handsCanonical = [];
    for (let i = 0; i < N; i++) {
        const [handUint32, detailsUint32, score, evs, visits] = cache[i];
        HANDS_UINT32[i] = handUint32;
        HANDS_DETAILS_UINT32[i] = detailsUint32;
        HANDS_SCORE[i] = score;
        for (let r = roundNumber; r > 0; r--) {
            HANDS_EV_FLAT[(i * roundNumber) + (r - 1)] = evs[r];
        }

        /** WE FORCE ITERATE OVER LOW VISIT COUNTS TO EXPLORE RARE HANDS FROM THE LAST ROUND
         * (LAST_ROUND || roundNumber) === 1 */
        const needsVisit = visits[roundNumber] === 1;
        if (needsVisit) {
            if (!handsCanonicalSeen.has(detailsUint32)) {
                handsCanonicalSeen.add(detailsUint32);
                handsCanonical.push(i);
            }
        }
    }

    HANDS_CANONICAL_INDEX = Uint32Array.from(handsCanonical);
    console.log(`HANDS_CANONICAL_INDEX_LENGTH=${HANDS_CANONICAL_INDEX.length}`);
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
const STRAT_VALUE_DEFAULT = 1 / ACTION_COUNT;
const ACTIONS_DISCARDS = (() => {
    const out = new Int8Array(32);
    for (let mask = 0; mask < 32; ++mask) {
        let x = mask;
        let c = 0;
        while (x) {
            x &= x - 1;
            ++c;
        }
        out[mask] = c;
    }
    return out;
})();
const regretSum = new Map();
const strategySum = new Map();
const evSum = new Map();

async function getDataFlushed(threadId = null) {
    const toLines = (map) => {
        const lines = [];
        for (const [key, values] of map) {
            const valuesarr = new Array(values.length);
            for (let i = 0; i < values.length; i++) {
                valuesarr[i] = values[i];
            }
            lines.push(JSON.stringify({ key, values: valuesarr }));
        }
        return lines.join('\n');
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

function getAverageNash() {
    getNDJSONAsMap(".results/mccfr/regrets/__REF.ndjson", regretSum, Float64Array);
    getNDJSONAsMap(".results/mccfr/strategies/__REF.ndjson", strategySum, Float64Array);
    // getNDJSONAsMap(".results/mccfr/evs/__REF.ndjson", evSum, Float64Array);

    let regretSumAvg = 0;
    let regretMaxAvg = 0;
    let count = 0;
    let count00 = 0;
    let countBelow02 = 0;
    let countBelow05 = 0;
    const count00keys = [];

    for (const [key, values] of regretSum) {
        const strat = strategySum.get(key);
        if (!strat) continue;

        const visitAcc = strat.reduce((acc, val) => acc + val, 0);
        if (visitAcc <= 0) continue; 

        let regretMax = 0;
        for (let i = 0; i < values.length; i++) {
            if (values[i] > regretMax) {
                regretMax = values[i];
            }
        }

        const regretAvg = regretMax / visitAcc;
        regretSumAvg += regretAvg;
        regretMaxAvg = Math.max(regretMaxAvg, regretAvg);
        count++;

        if (regretAvg === 0) {
            count00++;
            count00keys.push(key);
        } else {
            if (regretAvg <= 0.02) countBelow02++;
            if (regretAvg <= 0.05) countBelow05++;
        }
    }

    const regretAvgMean = count > 0 ? regretSumAvg / count : 0;

    console.log(`[MCCFR] NASH_0.00=${count00} / ${count}`);
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
    // const discardIndices = ACTIONS[actionIndex];
    // const cardsKept = hand.filter((_, idx) => !discardIndices.includes(idx));

    // const deckOffsetNew = deckOffset + discardIndices.length;
    // if (deckOffsetNew > deck.length) throw new Error("DECK.EXHAUSTED");
    // const cardsReceived = deck.slice(deckOffset, deckOffsetNew);
    // const handNew = [...cardsKept, ...cardsReceived];
    // handNew.sortByCardRankValue();

    const mask = actionIndex | 0;
    let deckOffsetNew = deckOffset;
    const handNew = new Array(5); /** 5 === hand.length */
    for (let i = 0; i < 5; ++i) { /** 5 === hand.length */
        if (mask & (1 << i)) {
            handNew[i] = deck[deckOffsetNew++];
        } else {
            handNew[i] = hand[i];
        }
    }

    if (deckOffsetNew > deck.length) throw new Error("DECK.EXHAUSTED");

    handNew.sortByCardRankValue();

    const handUint32 = getHandReadableAsUint32(handNew);
    const handIndex = getHu32IndexByBinarySearch(HANDS_UINT32, handUint32);
    if (handIndex < 0) throw new Error("HAND.INDEX.NOT.FOUND");
    const handObj = { index: handIndex, hand: handNew, deckOffset: deckOffsetNew };
    return handObj;
}

function getStrategyFromRegret(regret) {
    const strat = new Float64Array(ACTION_COUNT);
    let normaliser = 0;
    for (let i = 0; i < ACTION_COUNT; ++i) {
        strat[i] = Math.max(0, regret[i]);
        normaliser += strat[i];
    }
    if (normaliser === 0) {
        for (let i = 0; i < ACTION_COUNT; ++i) strat[i] = STRAT_VALUE_DEFAULT;
    } else {
        for (let i = 0; i < ACTION_COUNT; ++i) strat[i] /= normaliser;
    }
    return strat;
}

function getRandomActionIndex(strat) {
    const arr = new Float64Array(ACTION_COUNT);
    let total = 0;
    for (let i = 0; i < ACTION_COUNT; i++) {
        total += strat[i];
        arr[i] = total;
    }

    if (total <= 0) {
        return (Math.random() * ACTION_COUNT).safe("FLOOR", 0);
    }

    const r = Math.random() * total;
    let low = 0, high = ACTION_COUNT - 1;
    while (low < high) {
        const mid = (low + high) >>> 1;
        arr[mid] < r ? (low = mid + 1) : (high = mid);
    }
    return low;
}

function getDiscardsSimulated(h0, h1, deck, deckOffset = 0, roundNumber, roundNumbersFrozen, roundNumberMax) {
    const p0key = `${HANDS_DETAILS_UINT32[h0.index]},${roundNumber}`;
    const p1key = `${HANDS_DETAILS_UINT32[h1.index]},${roundNumber}`;
    // const p0key_ = (HANDS_DETAILS_UINT32[h0.index] * KEY_SHIFT_MULTIPLIER) + roundNumber;
    // const p0key_roundnumber = p0key_ % KEY_SHIFT_MULTIPLIER;
    // const p0key_details = (p0key_ / KEY_SHIFT_MULTIPLIER).safe("FLOOR", 0);
    // console.log("p0details", HANDS_DETAILS_UINT32[h0.index], roundNumber);
    // console.log("p0key_", p0key_);
    // console.log("p0key_roundnumber", p0key_roundnumber);
    // console.log("p0key_details", p0key_details, "\n");
    // const p0key = HANDS_DETAILS_UINT32[h0.index] + roundNumber; 
    // const p1key = HANDS_DETAILS_UINT32[h1.index] + roundNumber;

    let p0evsum = evSum.get(p0key) || (evSum.set(p0key, new Float64Array([0, 0])), evSum.get(p0key));
    let p1evsum = evSum.get(p1key) || (evSum.set(p1key, new Float64Array([0, 0])), evSum.get(p1key));

    // if (roundNumbersFrozen[roundNumber]) {
    //     const ev = HANDS_EV_FLAT.getflat(h0.index, roundNumber, roundNumberMax);
    //     /** DEBUG_START */
    //     // const evsafe = (p0evsum[1] / p0evsum[0]).safe("ROUND", 6);
    //     // if (ev !== evsafe) console.log(`EV: ${ev} || EV_SAFE: ${evsafe}`);
    //     /** DEBUG_END */
    //     return ev;
    // }

    const ROUND_IS_FROZEN = roundNumbersFrozen[roundNumber] === 1;
    const p0utilfrozen = ROUND_IS_FROZEN ? HANDS_EV_FLAT.getflat(h0.index, roundNumber, roundNumberMax) : null;

    if (!ROUND_IS_FROZEN) {
        p0evsum[0]++;
        p1evsum[0]++;
    }

    const p0reg = regretSum.get(p0key) || (regretSum.set(p0key, new Float64Array(ACTION_COUNT)), regretSum.get(p0key));
    const p1reg = regretSum.get(p1key) || (regretSum.set(p1key, new Float64Array(ACTION_COUNT)), regretSum.get(p1key));

    const p0strat = getStrategyFromRegret(p0reg);
    const p1strat = getStrategyFromRegret(p1reg);

    const p0stratsum = strategySum.get(p0key) || (strategySum.set(p0key, new Float64Array(ACTION_COUNT)), strategySum.get(p0key));
    const p1stratsum = strategySum.get(p1key) || (strategySum.set(p1key, new Float64Array(ACTION_COUNT)), strategySum.get(p1key));

    for (let i = 0; i < ACTION_COUNT; ++i) {
        p0stratsum[i] += p0strat[i];
        p1stratsum[i] += p1strat[i];
    }

    const p0aRnd = getRandomActionIndex(p0strat);
    const p1aRnd = getRandomActionIndex(p1strat);

    const p0hRnd = getActionApplied(h0.hand, deck, deckOffset, p0aRnd);
    const p1hRnd = getActionApplied(h1.hand, deck, p0hRnd.deckOffset, p1aRnd);
    // if (!p0hRnd?.hand || !p1hRnd?.hand) console.log(deck.length, p0hRnd?.hand, p1hRnd?.hand)

    const p0util = !ROUND_IS_FROZEN
        ? roundNumber <= 1
            ? getScores(p0hRnd.index, p1hRnd.index)
            : getDiscardsSimulated(p0hRnd, p1hRnd, deck, p1hRnd.deckOffset, roundNumber - 1, roundNumbersFrozen, roundNumberMax)
        : p0utilfrozen;
    const p1util = -p0util;

    if (!ROUND_IS_FROZEN) {
        p0evsum[1] += p0util;
        p1evsum[1] += p1util;
    }

    const p0utilAlt = new Float64Array(ACTION_COUNT);
    const p1utilAlt = new Float64Array(ACTION_COUNT);

    if (!ROUND_IS_FROZEN) {
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
                p0utilAlt[ai] = getDiscardsSimulated(p0hAlt, p1hFix, deck, p1hFix.deckOffset, roundNumber - 1, roundNumbersFrozen, roundNumberMax);
            }

            for (let ai = 0; ai < ACTION_COUNT; ++ai) {
                const p1hAlt = getActionApplied(h1.hand, deck, p0hRnd.deckOffset, ai); // ALT
                // if (!p0hRnd?.hand || !p1hAlt?.hand) console.log(deck.length, p0hRnd?.hand, p1hAlt?.hand)
                p1utilAlt[ai] = -getDiscardsSimulated(p0hRnd, p1hAlt, deck, p1hAlt.deckOffset, roundNumber - 1, roundNumbersFrozen, roundNumberMax);
            }
        }
    } else {
        for (let ai = 0; ai < ACTION_COUNT; ++ai) {
            p0utilAlt[ai] = p0util;
            p1utilAlt[ai] = -p1util;
        }
    }

    for (let ai = 0; ai < ACTION_COUNT; ++ai) {
        p0reg[ai] += p0utilAlt[ai] - p0util;
        p1reg[ai] += p1utilAlt[ai] - p1util;
    }

    // evSum.get(p0key)[1] += p0util;
    // evSum.get(p1key)[1] += p1util;
    // p0evsum[1] += p0util;
    // p1evsum[1] += p1util;

    return p0util;
}

const getMCCFRComputed = async (roundNumber, roundNumbersFrozen) => {
    if (cluster.isMaster) {
        const cpuCount = (os.cpus().length * 2/32).safe("ROUND", 0);

        for (let id = 0; id < cpuCount; id++) {
            cluster.fork({ WORKER_ID: id });
        }

        let workerscount = cpuCount;

        const shutdown = () => {
            console.log('[MCCFR] MASTER | SHUTDOWN');
            for (const id in cluster.workers) {
                cluster.workers[id].send({ cmd: 'shutdown' });
            }
        };

        ['SIGINT', 'SIGTERM'].forEach(signal => {
            process.on(signal, () => {
                shutdown();
            });
        });

        if (process.platform === 'win32') {
            const readline = require('readline');
            readline.createInterface({ input: process.stdin, output: process.stdout }).on('SIGINT', shutdown);
        }

        cluster.on('exit', (worker, code) => {
            console.log(`[MCCFR] WORKER | PID=${worker.process.pid} | EXIT_CODE=${code}`);
            workerscount--;
            if (workerscount === 0) {
                console.log('[MCCFR] MASTER | EXIT');
                process.exit(0);
            }
        });
    } else {
        let stop = false;

        ['message', 'SIGINT', 'SIGTERM'].forEach(signal => {
            process.on(signal, (msg) => {
                if (signal === 'message' && msg.cmd !== 'shutdown') {
                    console.log(`[MCCFR] WORKER_ID=${workerId} | ${signal.toUpperCase()} | CMD=${msg.cmd}`);
                    return;
                }
                console.log(`[MCCFR] WORKER_ID=${workerId} | ${signal.toUpperCase()} | FINISHING_CURRENT_ITERATION`);
                stop = true;
            });
        }); 

        const workerId = Number(process.env.WORKER_ID);
        console.log(`[MCCFR] WORKER_ID=${workerId} | PID=${process.pid} | START`);
        getCacheCreated(roundNumber);

        const flushInterval = HANDS_CANONICAL_INDEX.length * 100;
        const iterations = 100;
        const timenow = performance.now();
        let timenow1 = performance.now();

        const deckRef = Object.values(DECK);

        for (let s = 0; s < iterations; ++s) {
            for (let i = 0; i < HANDS_CANONICAL_INDEX.length; ++i) {
                const p0hi = HANDS_CANONICAL_INDEX[i];
                const p0hu32 = HANDS_UINT32[p0hi];
                const p0h = getHandUint32AsReadable(p0hu32);
                const p0hset = new Set(p0h);
                /** DEBUG_START - CANONICAL_INDEX */
                // const p0hisafe = HANDS_UINT32.indexOf(p0hu32);
                // const p0hu32safe = HANDS_UINT32[p0hisafe];
                // const p0hsafe = getHandUint32AsReadable(p0hu32safe);
                // if (p0hi !== p0hisafe) console.log(`p0hi=${p0hi},${p0h} || p0hisafe=${p0hisafe},p0hsafe=${p0hsafe}`);
                // continue;
                /** DEBUG_END - CANONICAL_INDEX */
                const p0 = { index: p0hi, hand: p0h };

                deckRef.shuffleByFisherYates();
                const deck = deckRef.filter(card => !p0hset.has(card));

                const deckOffset = 5; /** 5 === hand.length */
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
                    roundNumbersFrozen,
                    roundNumber
                );

                if ((s * HANDS_CANONICAL_INDEX.length + i + 1) % flushInterval === 0 || (s === iterations - 1 && i === HANDS_CANONICAL_INDEX.length - 1)) {
                    await getDataFlushed(workerId);
                    const elapsed = (performance.now() - timenow1).safe("ROUND", 0);
                    timenow1 = performance.now();
                    console.log(`[MCCFR] WORKER_ID=${workerId} | ITERATION=${s + 1} | HAND_ITERATION=${i + 1} | TIME_ELAPSED=${elapsed}ms`);
                }
            }

            if (stop) break;
        }

        if (stop) {
            await getDataFlushed(workerId);
            const elapsed = (performance.now() - timenow).safe("ROUND", 0);
            console.log(`[MCCFR] WORKER_ID=${workerId} | FINAL_FLUSH | TIME_ELAPSED=${elapsed}ms`);
        }
        console.log(`[MCCFR] WORKER_ID=${workerId} | PID=${process.pid} | EXIT`);
        process.exit(0);
    }
};

const convertKeysToNumerical = (filePath) => {
    const data = fs.readFileSync(filePath, 'utf8');
    const entries = data.split('\n');
    let ndjson = "";

    for (let i = 0; i < entries.length; i++) {
        const trimmed = entries[i].trim();
        if (!trimmed) continue;

        const { key, values } = JSON.parse(trimmed);
        const keyParts = key.split(',');
        const details = Number(keyParts[0]);
        const round = Number(keyParts[1]);
        const newkey = (details * KEY_SHIFT_MULTIPLIER) + round;
        const entry = JSON.stringify({ key: newkey, values: Array.from(values) });
        ndjson += entry + '\n';
    }

    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const newFilePath = path.join(dir, `${baseName}_NEW${ext}`);
    fs.writeFileSync(newFilePath, ndjson, 'utf8');
}

/**
 * Verifies the integrity of the key conversion process between an old string-key file 
 * and a new numerical-key file.
 * * @param {string} oldFilePath - Path to the original string-key NDJSON file.
 * @param {string} newFilePath - Path to the converted numerical-key NDJSON file.
 * @returns {object} The test results.
 */
function testKeyConversionIntegrity(oldFilePath, newFilePath) {
    console.log(`\nStarting Integrity Check: ${path.basename(oldFilePath)} vs ${path.basename(newFilePath)}`);

    // --- 1. Load the new (numerical) file into a Map for quick lookup ---
    const newFileMap = new Map();
    if (!fs.existsSync(newFilePath)) {
        console.error(`Error: New numerical file not found at ${newFilePath}. Cannot test.`);
        return { success: false, totalEntries: 0, failedKeys: 0, failedValues: 0 };
    }
    
    const newFileContent = fs.readFileSync(newFilePath, 'utf8');
    const newFileEntries = newFileContent.split('\n');

    for (const entry of newFileEntries) {
        const trimmed = entry.trim();
        if (!trimmed) continue;
        // Key is read as a string because it's JSON output, but represents the numerical key
        const { key, values } = JSON.parse(trimmed); 
        newFileMap.set(key, values);
    }

    // --- 2. Read the old (string) file sequentially and perform checks ---
    if (!fs.existsSync(oldFilePath)) {
        console.error(`Error: Old string file not found at ${oldFilePath}. Cannot test.`);
        return { success: false, totalEntries: 0, failedKeys: 0, failedValues: 0 };
    }

    const oldFileContent = fs.readFileSync(oldFilePath, 'utf8');
    const oldFileEntries = oldFileContent.split('\n');

    let totalEntries = 0;
    let failedKeyChecks = 0;
    let failedValueChecks = 0;

    for (const entry of oldFileEntries) {
        const trimmed = entry.trim();
        if (!trimmed) continue;
        
        totalEntries++;
        const { key: stringKey, values: oldValues } = JSON.parse(trimmed);

        // 2a. Parse old key
        const keyParts = stringKey.split(',');
        const originalDetails = Number(keyParts[0]);
        const originalRound = Number(keyParts[1]);

        // 2b. Calculate expected new key (numerical and string representation)
        const numericalKey = (originalDetails * KEY_SHIFT_MULTIPLIER) + originalRound;
        const expectedNumericalKeyStr = numericalKey;

        // 2c. Lookup the corresponding entry in the new file map
        const newValues = newFileMap.get(expectedNumericalKeyStr);

        if (!newValues) {
            console.error(`Integrity Check Failed: Missing numerical key ${expectedNumericalKeyStr} (Original: ${stringKey}) in the new file.`);
            failedKeyChecks++;
            continue;
        }

        // --- TEST 1: Key Integrity Check (Decoding) ---
        // Verify that decoding the numerical key reconstructs the original parts.
        const decodedRound = numericalKey % KEY_SHIFT_MULTIPLIER;
        const decodedDetails = (numericalKey / KEY_SHIFT_MULTIPLIER).safe("FLOOR", 0);

        if (decodedDetails !== originalDetails || decodedRound !== originalRound) {
            console.error(`Key Integrity Mismatch for ${stringKey}: Decoded (${decodedDetails}, ${decodedRound}) != Original (${originalDetails}, ${originalRound})`);
            failedKeyChecks++;
        }
        
        // --- TEST 2: Value Integrity Check (Data) ---
        // Compare values array element-by-element
        if (oldValues.length !== newValues.length) {
            console.error(`Value Integrity Mismatch for ${stringKey}: Lengths differ (${oldValues.length} vs ${newValues.length})`);
            failedValueChecks++;
        } else {
            for (let i = 0; i < oldValues.length; i++) {
                // Using a small tolerance (1e-9) for robust floating-point comparison
                if (Math.abs(oldValues[i] - newValues[i]) > 1e-9) { 
                    console.error(`Value Integrity Mismatch for ${stringKey}: Value at index ${i} differs (${oldValues[i]} vs ${newValues[i]})`);
                    failedValueChecks++;
                    break;
                }
            }
        }
    }

    const success = failedKeyChecks === 0 && failedValueChecks === 0;
    console.log(`\n--- Integrity Test Results for ${path.basename(oldFilePath)} ---`);
    console.log(`Total Entries Checked: ${totalEntries}`);
    console.log(`Key Mismatches (Conversion/Decoding): ${failedKeyChecks}`);
    console.log(`Value Mismatches (Data Corruption): ${failedValueChecks}`);
    console.log(`Overall Status: ${success ? 'PASSED ✅' : 'FAILED ❌'}`);
    console.log('----------------------------------------------------');

    return { success, totalEntries, failedKeyChecks, failedValueChecks };
}

// pgrep -fl "caffeinate|MCCFR27Discards2.js"
// sudo pkill -9 -f "MCCFR27Discards2.js"
// sudo sh -c "nohup caffeinate -dims nice -n -20 node tests/MCCFR27Discards2.js > mccfr.log 2>&1 &"
// sudo caffeinate -dims nice -n -20 node tests/MCCFR27Discards2.js
// ps ax -o pid,pcpu,pmem,command | grep 'MCCFR27Discards2.js'
// win/ $ pm2 start tests/MCCFR27Discards2.js  --no-autorestart --no-daemon

/** PROFILING CODE :
 * node --prof tests/MCCFR27Discards2.js
 * node --prof-process isolate-0xnnnnnnnnnnnn-v8.log > processed.txt
 */

/** KILL ANY NODE PROCESSES ON PWSL :
 * taskkill /F /IM node.exe
 */

// const CARD_SORT_LOOKUP = new Uint8Array(52);
// const DECK_INTS = new Uint8Array(52); 

// (() => {
//     for (let i = 0; i < 52; i++) {
//         DECK_INTS[i] = i;
//         const rankValue = (i % 13) + 1; // 1 to 13
//         const suitValue = (i / 13) | 0; // 0 to 3
//         CARD_SORT_LOOKUP[i] = (rankValue << 2) | suitValue;
//     }
// })();

const encodeNewKey = ({ ranks_value, suit_pattern_idx, round_int }) => {
    const key_u32 = 
        ((ranks_value[0] & 0x0F) << 22) |
        ((ranks_value[1] & 0x0F) << 18) |
        ((ranks_value[2] & 0x0F) << 14) |
        ((ranks_value[3] & 0x0F) << 10) |
        ((ranks_value[4] & 0x0F) << 6)  |
        (suit_pattern_idx & 0x3F);
    
    return (key_u32 * KEY_SHIFT_MULTIPLIER) + round_int;
};

const getHandDetailsUint32AsReadable2 = (u32) => {
    const suit_pattern_idx = u32 & 0b111111;
    const rank_bits = u32 >>> 6;
    const ranks_value = new Array(5);
    for (let i = 0; i < 5; i++) {
        const shift = 5 * (4 - i);
        ranks_value[i] = (rank_bits >>> shift) & 0b11111;
    }
    return { ranks_value, suit_pattern_idx };
};

const transformFile = async (file_path_in, file_path_out) => {
    if (!fs.existsSync(file_path_in)) return console.log(`>>> File not found: ${file_path_in}`);

    const stream_in = fs.createReadStream(file_path_in);
    const stream_out = fs.createWriteStream(file_path_out, { flags: 'w', highWaterMark: 1024 * 1024 });

    const rl = readline.createInterface({
        input: stream_in,
        crlfDelay: Infinity
    });

    const write = (str) => {
        const ok = stream_out.write(str);
        if (!ok) return new Promise(r => stream_out.once('drain', r));
        return Promise.resolve();
    };

    let count = 0;

    for await (const line of rl) {
        if (!line.trim()) continue;

        const { key, values } = JSON.parse(line);

        const round_int = key % KEY_SHIFT_MULTIPLIER;
        const key_u32_old = (key / KEY_SHIFT_MULTIPLIER) | 0;
        const key_u32_old_decoded = getHandDetailsUint32AsReadable2(key_u32_old);

        const key_new = encodeNewKey({ 
            ranks_value: key_u32_old_decoded.ranks_value.map(r => r - 1), 
            suit_pattern_idx: key_u32_old_decoded.suit_pattern_idx, 
            round_int 
        });
        const key_u32_new = (key_new / KEY_SHIFT_MULTIPLIER) | 0;
        const rank0 = (key_u32_new >>> 22) & 0x0F;
        const rank1 = (key_u32_new >>> 18) & 0x0F;
        const rank2 = (key_u32_new >>> 14) & 0x0F;
        const rank3 = (key_u32_new >>> 10) & 0x0F;
        const rank4 = (key_u32_new >>> 6) & 0x0F;
        const suit_pattern_idx = key_u32_new & 0x3F;

        const key_u32_new_decoded = {
            ranks_value: [rank0, rank1, rank2, rank3, rank4],
            suit_pattern_idx
        }

        for (let i = 0; i < 5; i++) {
            if (key_u32_old_decoded.ranks_value[i] - 1 !== key_u32_new_decoded.ranks_value[i]) {
                console.log(`RANK MISMATCH at index ${i}: OLD=${key_u32_old_decoded.ranks_value[i]} vs NEW=${key_u32_new_decoded.ranks_value[i]}`);
            }
        }
        if (key_u32_old_decoded.suit_pattern_idx !== key_u32_new_decoded.suit_pattern_idx) {
            console.log(`SUIT PATTERN MISMATCH: OLD=${key_u32_old_decoded.suit_pattern_idx} vs NEW=${key_u32_new_decoded.suit_pattern_idx}`);
        }

        const line_new = `{"key":${key_new},"values":[${values.join(',')}]}\n`;
        await write(line_new);
        
        count++;
        if (count % 100000 === 0) process.stdout.write(`\rConverted ${count} lines...`);
    }

    stream_out.end();
    await new Promise(r => stream_out.on('finish', r));
};

const runMigration = async () => {
    await transformFile(path.join(PATH_RESULTS, 'regrets/__REF.ndjson'), path.join(PATH_RESULTS, 'regrets/__REF_U32_NEW.ndjson'));
    await transformFile(path.join(PATH_RESULTS, 'strategies/__REF.ndjson'), path.join(PATH_RESULTS, 'strategies/__REF_U32_NEW.ndjson'));
    await transformFile(path.join(PATH_RESULTS, 'evs/__REF.ndjson'), path.join(PATH_RESULTS, 'evs/__REF_U32_NEW.ndjson'));
};

(async () => {
    // convertKeysToNumerical(".results/mccfr/evs/__REF.ndjson")
    // convertKeysToNumerical(".results/mccfr/regrets/__REF.ndjson")
    // convertKeysToNumerical(".results/mccfr/strategies/__REF.ndjson")
    // testKeyConversionIntegrity(
    //     ".results/mccfr/evs/__REF.ndjson",
    //     ".results/mccfr/evs/__REF_NEW.ndjson"
    // );
    // testKeyConversionIntegrity(
    //     ".results/mccfr/regrets/__REF.ndjson",
    //     ".results/mccfr/regrets/__REF_NEW.ndjson"
    // );
    // testKeyConversionIntegrity(
    //     ".results/mccfr/strategies/__REF.ndjson",
    //     ".results/mccfr/strategies/__REF_NEW.ndjson"
    // );
    // await runMigration()
})();