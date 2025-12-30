const fs = require('fs');
const readline = require('readline');
const os = require('os');
const cluster = require('cluster');
const path = require('path');

const DIR_PATH_RESULTS = path.join(process.cwd(), '.results/mccfr');
const DIR_PATH_STRATEGIES_READABLE = path.join(DIR_PATH_RESULTS, 'strategies_readable');
const DIR_PATH_STRATEGIES = path.join(DIR_PATH_RESULTS, 'strategies');
const DIR_PATH_REGRETS = path.join(DIR_PATH_RESULTS, 'regrets');
const DIR_PATH_EVS = path.join(DIR_PATH_RESULTS, 'evs');
// const FILE_PATH_KEYS = path.join(DIR_PATH_RESULTS, 'keys/__REF.ndjson');
const FILE_PATH_STRATEGIES = path.join(DIR_PATH_RESULTS, 'strategies/__REF.ndjson');
const FILE_PATH_REGRETS = path.join(DIR_PATH_RESULTS, 'regrets/__REF.ndjson');
const FILE_PATH_EVS = path.join(DIR_PATH_RESULTS, 'evs/__REF.ndjson');

let RNG_A = 123456789;
let RNG_B = 987654321;
let RNG_C = 567891234;
let RNG_D = 432198765;
const RNG_SCALE = 2.3283064365386963e-10; /* (1 / 2**32) */

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANKS_LENGTH = RANKS.length;
const RANKS_VALUE_MAP = new Uint8Array(64); /** 64 INSTEAD OF 52 (DECK LENGTH) FOR MAXIMUM SPEED */

const SUITS = ['c', 'd', 'h', 's'];
const SUITS_LENGTH = SUITS.length;
const SUITS_VALUE_MAP = new Uint8Array(64); /** 64 INSTEAD OF 52 (DECK LENGTH) FOR MAXIMUM SPEED */
const SUITS_PATTERN_KEYS = [
    '00000', '00001', '00010', '00011', '00012', '00100', '00101', '00102', '00110', '00111', 
    '00112', '00120', '00121', '00122', '00123', '01000', '01001', '01002', '01010', '01011', 
    '01012', '01020', '01021', '01022', '01023', '01100', '01101', '01102', '01110', '01111', 
    '01112', '01120', '01121', '01122', '01123', '01200', '01201', '01202', '01203', '01210', 
    '01211', '01212', '01213', '01220', '01221', '01222', '01223', '01230', '01231', '01232', 
    '01233', 'XXXXX'
];
const SUITS_PATTERN = {};
const SUITS_PATTERN_LUT = new Uint8Array(1024); /** 1024 = 5CARDS ** 4SUITS */

const SCORE_MULTIPLIER = RANKS_LENGTH + 2; /** +2 FOR SAFETY */
const SCORE_BASES = [
    0,          /** HIGH */
    1_000_000,  /** 1PAIR */
    2_000_000,  /** 2PAIR */
    3_000_000,  /** 3KIND */
    4_000_000,  /** STRAIGHT */
    5_000_000,  /** FLUSH */
    6_000_000,  /** FULL */
    7_000_000,  /** 4KIND */
    8_000_000   /** STRAIGHT_FLUSH */
];

const DECK_LENGTH = 52;
const DECK_UINT8 = new Uint8Array(DECK_LENGTH);
const DECK_STR = new Array(DECK_LENGTH);

const CARDS_UINT8_SORTED = new Uint8Array(DECK_LENGTH);
const CARDS_STR_TO_UINT8_MAP = new Map();

const ALL_HANDS_LENGTH = 2598960; /** (52 * 51 * 50 * 49 * 48) / (5 * 4 * 3 * 2 * 1) >> C(52, 5) */
const ALL_HANDS_IDX_LUT = new Uint32Array(ALL_HANDS_LENGTH).fill(0xFFFFFFFF);

const COMBINADIC_K = new Uint32Array(53 * 6);

const KEY_SHIFT_MULTIPLIER = 16;

const REGRETS_MAP = new Map();
const STRATEGIES_MAP = new Map();
const EVS_MAP = new Map();

const seedSuitsPatternLut = () => {
    const pattern = new Uint8Array(5);
    const map = new Int8Array(4);

    for (let i = 0; i < SUITS_PATTERN_LUT.length; i++) {
        const s0 = (i >>> 8) & 0x3;
        const s1 = (i >>> 6) & 0x3;
        const s2 = (i >>> 4) & 0x3;
        const s3 = (i >>> 2) & 0x3;
        const s4 = i & 0x3;

        /** MAP RESET */
        map[0] = -1;
        map[1] = -1;
        map[2] = -1;
        map[3] = -1;
        
        let code_next = 0;
        let pattern_is_relevant = false;

        /** CARD 0 */
        map[s0] = code_next++;
        pattern[0] = 0; /** ALWAYS ZERO */

        /** CARD 1 */
        let code = map[s1];
        if (code === -1) { 
            code = code_next++; 
            map[s1] = code; 
        }
        pattern[1] = code;

        /** CARD 2 */
        code = map[s2];
        if (code === -1) { 
            code = code_next++; 
            map[s2] = code; 
        }
        pattern[2] = code;

        /** CARD 3 */
        code = map[s3];
        if (code === -1) { 
            code = code_next++; 
            map[s3] = code; 
        }
        pattern[3] = code;

        /** CARD 4 */
        code = map[s4];
        if (code === -1) { 
            code = code_next++; 
            map[s4] = code; 
        }
        pattern[4] = code;

        if (pattern[1] === 0 && pattern[2] === 0 && pattern[3] === 0 && pattern[4] === 0) {
            pattern_is_relevant = true;
        } else if (pattern[2] !== 0 && pattern[2] === pattern[3] && pattern[3] === pattern[4]) {
            pattern_is_relevant = true;
        }

        if (pattern_is_relevant) {
            const key = "" + pattern[0] + pattern[1] + pattern[2] + pattern[3] + pattern[4];
            SUITS_PATTERN_LUT[i] = SUITS_PATTERN[key]; 
        } else {
            SUITS_PATTERN_LUT[i] = SUITS_PATTERN['XXXXX'];
        }
    }
};

Number.prototype.safe = function (method = "FLOOR", decimals = 2) {
    const v = +this;
    let f;
    if (decimals >>> 0 <= 6) f = [1, 10, 100, 1000, 10000, 100000, 1000000][decimals >>> 0];
    else f = 10 ** decimals;
    switch (method) {
        case "ROUND": return Math.round((v + Number.EPSILON) * f) / f;
        case "CEIL": return Math.ceil(v * f) / f;
        case "FLOOR": return Math.floor(v * f) / f;
        default: throw new Error("Number.prototype.safe Error");
    }
};

Float64Array.prototype.flatten = function(idx, round_int, round_int_max) {
    const flat_idx = idx * round_int_max + (round_int - 1);
    return this[flat_idx].safe("ROUND", 6);
};

Uint8Array.prototype.shuffleUint8Array = function () {
    for (let i = this.length - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        const tmp = this[i];
        this[i] = this[j];
        this[j] = tmp;
    }
};

Uint8Array.prototype.handUint8ArraySorted = function () {
    let c0 = this[0];
    let c1 = this[1];
    let c2 = this[2];
    let c3 = this[3];
    let c4 = this[4];
    let v0 = CARDS_UINT8_SORTED[c0];
    let v1 = CARDS_UINT8_SORTED[c1];
    let v2 = CARDS_UINT8_SORTED[c2];
    let v3 = CARDS_UINT8_SORTED[c3];
    let v4 = CARDS_UINT8_SORTED[c4];

    let tc, tv;
    if (v0 < v1) { tc = c0; c0 = c1; c1 = tc; tv = v0; v0 = v1; v1 = tv; }
    if (v3 < v4) { tc = c3; c3 = c4; c4 = tc; tv = v3; v3 = v4; v4 = tv; }
    if (v2 < v4) { tc = c2; c2 = c4; c4 = tc; tv = v2; v2 = v4; v4 = tv; }
    if (v2 < v3) { tc = c2; c2 = c3; c3 = tc; tv = v2; v2 = v3; v3 = tv; }
    if (v1 < v4) { tc = c1; c1 = c4; c4 = tc; tv = v1; v1 = v4; v4 = tv; }
    if (v0 < v3) { tc = c0; c0 = c3; c3 = tc; tv = v0; v0 = v3; v3 = tv; }
    if (v0 < v2) { tc = c0; c0 = c2; c2 = tc; tv = v0; v0 = v2; v2 = tv; }
    if (v1 < v3) { tc = c1; c1 = c3; c3 = tc; tv = v1; v1 = v3; v3 = tv; }
    if (v1 < v2) { tc = c1; c1 = c2; c2 = tc; tv = v1; v1 = v2; v2 = tv; }

    this[0] = c0;
    this[1] = c1;
    this[2] = c2;
    this[3] = c3;
    this[4] = c4;
};

Uint8Array.prototype.handArray = function () {
    const result = [];
    for (let i = 0; i < this.length; i++) {
        const idx = this[i];
        result.push(DECK_STR[idx]);
    }
    return result;
};

Uint8Array.prototype.handUint32 = function () {
    return ((this[0] << 24) | (this[1] << 18) | (this[2] << 12) | (this[3] << 6) | this[4]) >>> 0;
};

const handUint8ArrayFromUint32 = (hand_u8_arr_buffer, hand_u32) => {
    hand_u8_arr_buffer[0] = (hand_u32 >>> 24) & 0x3F;
    hand_u8_arr_buffer[1] = (hand_u32 >>> 18) & 0x3F;
    hand_u8_arr_buffer[2] = (hand_u32 >>> 12) & 0x3F;
    hand_u8_arr_buffer[3] = (hand_u32 >>> 6) & 0x3F;
    hand_u8_arr_buffer[4] = hand_u32 & 0x3F;
}

Array.prototype.handUint8Array = function () {
    const result = new Uint8Array(5);
    for (let i = 0; i < this.length; i++) {
        const str = this[i];
        const idx = CARDS_STR_TO_UINT8_MAP.get(str);
        result[i] = idx;
    }
    return result;
}

Uint8Array.prototype.deckUint8FilledAndShuffled = function (hand_u8_arr) { 
    let c0 = hand_u8_arr[0];
    let c1 = hand_u8_arr[1];
    let c2 = hand_u8_arr[2];
    let c3 = hand_u8_arr[3];
    let c4 = hand_u8_arr[4];

    /** DECK ALGO NEEDS HAND SORTED BY INDEX ASC NOT BY VALUE
     * eg : hand_u8_arr = [A, 2, ...] > [51, 0, ...] >>> ALGO WILL STOP BECAUSE 51 IS LAST INDEX
     */
    let tmp;
    if (c0 > c1) { tmp = c0; c0 = c1; c1 = tmp; }
    if (c3 > c4) { tmp = c3; c3 = c4; c4 = tmp; }
    if (c2 > c4) { tmp = c2; c2 = c4; c4 = tmp; }
    if (c2 > c3) { tmp = c2; c2 = c3; c3 = tmp; }
    if (c1 > c4) { tmp = c1; c1 = c4; c4 = tmp; }
    if (c0 > c3) { tmp = c0; c0 = c3; c3 = tmp; }
    if (c0 > c2) { tmp = c0; c0 = c2; c2 = tmp; }
    if (c1 > c3) { tmp = c1; c1 = c3; c3 = tmp; }
    if (c1 > c2) { tmp = c1; c1 = c2; c2 = tmp; }

    let k = 0;
    let d = 0;

    while (k < c0) this[d++] = k++; 
    k++;
    while (k < c1) this[d++] = k++;
    k++;
    while (k < c2) this[d++] = k++;
    k++;
    while (k < c3) this[d++] = k++;
    k++;
    while (k < c4) this[d++] = k++;
    k++;
    while (k < 52) this[d++] = k++;

    this.shuffleUint8Array();
}

const score = (hand_u32) => {
    let card0 = (hand_u32 >>> 24) & 0x3F;
    let card1 = (hand_u32 >>> 18) & 0x3F;
    let card2 = (hand_u32 >>> 12) & 0x3F;
    let card3 = (hand_u32 >>> 6)  & 0x3F;
    let card4 = hand_u32 & 0x3F;

    let rank0 = RANKS_VALUE_MAP[card0];
    let rank1 = RANKS_VALUE_MAP[card1];
    let rank2 = RANKS_VALUE_MAP[card2];
    let rank3 = RANKS_VALUE_MAP[card3];
    let rank4 = RANKS_VALUE_MAP[card4];

    let suit0 = SUITS_VALUE_MAP[card0];
    let suit1 = SUITS_VALUE_MAP[card1];
    let suit2 = SUITS_VALUE_MAP[card2];
    let suit3 = SUITS_VALUE_MAP[card3];
    let suit4 = SUITS_VALUE_MAP[card4];

    /** DESC SORT */
    let rank_tmp, suit_tmp;
    if (rank0 < rank1) { 
        rank_tmp = rank0; rank0 = rank1; rank1 = rank_tmp;
        suit_tmp = suit0; suit0 = suit1; suit1 = suit_tmp;
    }
    if (rank3 < rank4) { 
        rank_tmp = rank3; rank3 = rank4; rank4 = rank_tmp;
        suit_tmp = suit3; suit3 = suit4; suit4 = suit_tmp;
    }
    if (rank2 < rank4) { 
        rank_tmp = rank2; rank2 = rank4; rank4 = rank_tmp;
        suit_tmp = suit2; suit2 = suit4; suit4 = suit_tmp;
    }
    if (rank2 < rank3) { 
        rank_tmp = rank2; rank2 = rank3; rank3 = rank_tmp;
        suit_tmp = suit2; suit2 = suit3; suit3 = suit_tmp;
    }
    if (rank1 < rank4) { 
        rank_tmp = rank1; rank1 = rank4; rank4 = rank_tmp;
        suit_tmp = suit1; suit1 = suit4; suit4 = suit_tmp;
    }
    if (rank0 < rank3) { 
        rank_tmp = rank0; rank0 = rank3; rank3 = rank_tmp;
        suit_tmp = suit0; suit0 = suit3; suit3 = suit_tmp;
    }
    if (rank0 < rank2) { 
        rank_tmp = rank0; rank0 = rank2; rank2 = rank_tmp;
        suit_tmp = suit0; suit0 = suit2; suit2 = suit_tmp;
    }
    if (rank1 < rank3) {
        rank_tmp = rank1; rank1 = rank3; rank3 = rank_tmp;
        suit_tmp = suit1; suit1 = suit3; suit3 = suit_tmp;
    }
    if (rank1 < rank2) { 
        rank_tmp = rank1; rank1 = rank2; rank2 = rank_tmp;
        suit_tmp = suit1; suit1 = suit2; suit2 = suit_tmp;
    }

    const suit_key = (suit0 << 8) | (suit1 << 6) | (suit2 << 4) | (suit3 << 2) | suit4;
    const suit_pattern_idx = SUITS_PATTERN_LUT[suit_key];

    const is_flush = (suit0 === suit1 && suit0 === suit2 && suit0 === suit3 && suit0 === suit4);
    let is_straight = (rank0 === rank1 + 1 && rank1 === rank2 + 1 && rank2 === rank3 + 1 && rank3 === rank4 + 1);
    if (!is_straight && rank0 === 12 && rank1 === 3 && rank2 === 2 && rank3 === 1 && rank4 === 0) is_straight = true;

    const duplicate1 = rank0 === rank1;
    const duplicate2 = rank1 === rank2;
    const duplicate3 = rank2 === rank3;
    const duplicate4 = rank3 === rank4;

    let value0 = rank0, value1 = rank1, value2 = rank2, value3 = rank3, value4 = rank4;
    let type = 0;

    if (is_straight && is_flush) { /** STRAIGHT FLUSH */
        type = 8;
        if (rank0 === 12 && rank1 === 3) { /** STRAIGHT FLUSH AS LOW */
            value0 = 3; 
            value1 = 2; 
            value2 = 1; 
            value3 = 0; 
            value4 = -1;
        }
    } else if (duplicate1 && duplicate2 && duplicate3) { /** 4KIND DESC */
        type = 7;
    } else if (duplicate2 && duplicate3 && duplicate4) { /** 4KIND ASC */
        type = 7;
        value0 = rank1;
        value1 = rank2;
        value2 = rank3;
        value3 = rank4;
        value4 = rank0;
    } else if (duplicate1 && duplicate2 && duplicate4) { /** FULL DESC */
        type = 6;
    } else if (duplicate1 && duplicate3 && duplicate4) { /** FULL ASC */
        type = 6;
        value0 = rank2;
        value1 = rank3;
        value2 = rank4;
        value3 = rank0;
        value4 = rank1;
    } else if (is_flush) { /** FLUSH */
        type = 5;
    } else if (is_straight) { /** STRAIGHT */
        type = 4;
        if (rank0 === 12 && rank1 === 3) { /** STRAIGHT AS LOW */
            value0 = 3;
            value1 = 2;
            value2 = 1;
            value3 = 0;
            value4 = -1; 
        }
    } else if (duplicate1 && duplicate2) { /** 3KIND DESC */
        type = 3;
    } else if (duplicate2 && duplicate3) { /** 3KIND MIDDLE */
        type = 3;
        value0 = rank1;
        value1 = rank2;
        value2 = rank3;
        value3 = rank0;
        value4 = rank4;
    } else if (duplicate3 && duplicate4) { /** 3KIND ASC */
        type = 3;
        value0 = rank2;
        value1 = rank3;
        value2 = rank4;
        value3 = rank0;
        value4 = rank1;
    } else if (duplicate1 && duplicate3) { /** 2PAIR DESC */
        type = 2;
    } else if (duplicate1 && duplicate4) { /** 2PAIR SPLIT */
        type = 2;
        value0 = rank0;
        value1 = rank1;
        value2 = rank3;
        value3 = rank4;
        value4 = rank2;
    } else if (duplicate2 && duplicate4) { /** 2PAIR ASC */
        type = 2;
        value0 = rank1;
        value1 = rank2;
        value2 = rank3;
        value3 = rank4;
        value4 = rank0;
    } else if (duplicate1) { /** 1PAIR DESC */
        type = 1; 
    } else if (duplicate2) { /** 1PAIR MIDDLE LEFT */
        type = 1; 
        value0 = rank1;
        value1 = rank2;
        value2 = rank0;
        value3 = rank3;
        value4 = rank4;
    } else if (duplicate3) { /** 1PAIR MIDDLE RIGHT */
        type = 1; 
        value0 = rank2;
        value1 = rank3;
        value2 = rank0;
        value3 = rank1;
        value4 = rank4;
    } else if (duplicate4) { /** 1PAIR ASC */
        type = 1; 
        value0 = rank3;
        value1 = rank4;
        value2 = rank0;
        value3 = rank1;
        value4 = rank2;
    }

    /** +2 FOR SAFETY WHEN AS LOW = -1 */
    const weight0 = value0 + 2;
    const weight1 = value1 + 2;
    const weight2 = value2 + 2;
    const weight3 = value3 + 2;
    const weight4 = value4 + 2;

    let weight = weight0;
    weight = (weight * SCORE_MULTIPLIER) + weight1;
    weight = (weight * SCORE_MULTIPLIER) + weight2;
    weight = (weight * SCORE_MULTIPLIER) + weight3;
    weight = (weight * SCORE_MULTIPLIER) + weight4;

    const score = SCORE_BASES[type] + weight;
    /** KEY_UINT32 = RANKS = 5CARDS (0..12) * 4BITS >> 20BITS | SUITS_PATTERN_LENGTH = 52 >> 6BITS */
    const key_u32 = (rank0 << 22) | (rank1 << 18) | (rank2 << 14) | (rank3 << 10) | (rank4 << 6) | suit_pattern_idx;
    /** KEY_UINT32_DECODED :
     * rank0 = (key >>> 22) & 0x0F;
     * rank1 = (key >>> 18) & 0x0F;
     * rank2 = (key >>> 14) & 0x0F;
     * rank3 = (key >>> 10) & 0x0F;
     * rank4 = (key >>> 6) & 0x0F;
     * suit_pattern_idx = key & 0x3F;
     */
    return { key_u32, score };
}

const seedRng = (seed) => {
    if (seed === undefined) {
        const t = process.hrtime(); 
        const time_seed = (t[0] ^ t[1]);
        const worker_id = Number(process.env.WORKER_ID || 0);
        /** 0x9E3779B9 = 32BITS INTEGERS GOLDEN RATIO CONSTANT */ 
        const worker_seed = (worker_id * 0x9E3779B9) | 0;
        seed = time_seed ^ worker_seed;
    }

    let s = seed | 0;
    const next = () => {
        s = (s + 0x9e3779b9) | 0;
        let z = s;
        z = (z ^ (z >>> 16)) * 0x85ebca6b;
        z = (z ^ (z >>> 13)) * 0xc2b2ae35;
        return (z ^ (z >>> 16)) >>> 0;
    };

    RNG_A = next();
    RNG_B = next();
    RNG_C = next();
    RNG_D = next();

    /** SAFETY IF EVERYTHING EQUAL ZERO */
    if ((RNG_A | RNG_B | RNG_C | RNG_D) === 0) RNG_A = 123456789;
}

const rng = () => {
    let t = RNG_D;
    const s = RNG_A;
    RNG_D = RNG_C;
    RNG_C = RNG_B;
    RNG_B = s;
    t ^= t << 11;
    t ^= t >>> 8;
    RNG_A = t ^ s ^ (s >>> 19);
    return (RNG_A >>> 0) * RNG_SCALE;
}

const mapNdjson = async (file_path, map = new Map(), map_values_type = Float64Array) => {
    if (!fs.existsSync(file_path)) return console.error(`mapNdjson.Error: ${file_path}`);
    const file_stream = fs.createReadStream(file_path);
    const lines = readline.createInterface({
        input: file_stream,
        crlfDelay: Infinity
    });
    for await (const line of lines) {
        if (!line) continue;
        const { key, values } = JSON.parse(line.trim());
        map.set(key, new map_values_type(values));
    }
    return map;
};

const flushNdjson = async (thread_id = null) => {
    const streamWrite = async (file_path, map) => {
        const file_path_tmp = file_path + '.tmp';
        const stream = fs.createWriteStream(file_path_tmp, { flags: 'w', highWaterMark: 64 * 1024 }); /** 64KB BUFFER */ 

        const waitForDrain = () => new Promise(resolve => stream.once('drain', resolve));

        for (const [key, values] of map) {
            /** QUICKER THAN `JSON.stringify()` */
            const line = `{"key":${key},"values":[${values.join(',')}]}\n`;
            const buffer = stream.write(line);
            if (!buffer) await waitForDrain();
        }

        stream.end();
        
        await new Promise((resolve, reject) => {
            stream.on('finish', resolve);
            stream.on('error', reject);
        });

        await fs.promises.rename(file_path_tmp, file_path);
    };

    await Promise.all([
        fs.promises.mkdir(DIR_PATH_REGRETS, { recursive: true }),
        fs.promises.mkdir(DIR_PATH_STRATEGIES, { recursive: true }),
        fs.promises.mkdir(DIR_PATH_EVS, { recursive: true })
    ]);

    const id = (thread_id !== null && thread_id !== undefined) ? thread_id : "null";
    const path_regrets = path.join(DIR_PATH_REGRETS, `regrets-${id}.ndjson`);
    const path_strategies = path.join(DIR_PATH_STRATEGIES, `strategies-${id}.ndjson`);
    const path_evs = path.join(DIR_PATH_EVS, `evs-${id}.ndjson`);

    await Promise.all([
        streamWrite(path_regrets, REGRETS_MAP),
        streamWrite(path_strategies, STRATEGIES_MAP),
        streamWrite(path_evs, EVS_MAP)
    ]);
};

const readableNdjsonStrategies = async (strategies_map) => {
    const readable = (key) => {
        const round_int = key % KEY_SHIFT_MULTIPLIER;
        const key_u32 = (key / KEY_SHIFT_MULTIPLIER) | 0;

        const rank0 = (key_u32 >>> 22) & 0x0F;
        const rank1 = (key_u32 >>> 18) & 0x0F;
        const rank2 = (key_u32 >>> 14) & 0x0F;
        const rank3 = (key_u32 >>> 10) & 0x0F;
        const rank4 = (key_u32 >>> 6) & 0x0F;
        const suit_pattern_idx = key_u32 & 0x3F;

        const key_str = "" + RANKS[rank0] + RANKS[rank1] + RANKS[rank2] + RANKS[rank3] + RANKS[rank4] + ":" + SUITS_PATTERN_KEYS[suit_pattern_idx] + ',' + round_int;

        const strats_values = strategies_map.get(key) ?? new Float64Array(ACTIONS_LENGTH).fill(STRAT_VALUE_DEFAULT);

        let strats_values_sum = 0;
        for (let i = 0; i < strats_values.length; i++) strats_values_sum += strats_values[i];

        const result = { key: key_str, values: [] };

        for (let i = 0; i < strats_values.length; i++) {
            const discards_indices_str = ACTIONS[i].length ? ACTIONS[i].join('') : '-';

            let value_normalized = 0;
            if (strats_values_sum > 0) {
                value_normalized = (strats_values[i] / strats_values_sum).safe("ROUND", 4);
            } else {
                value_normalized = STRAT_VALUE_DEFAULT.safe("ROUND", 4);
            }

            result.values.push([discards_indices_str, value_normalized]);
        }

        result.values.sort((a, b) => b[1] - a[1]);

        return result;
    }

    const stream = fs.createWriteStream(path.join(DIR_PATH_STRATEGIES_READABLE, `__REF.ndjson`), { flags: 'w', highWaterMark: 1024 * 1024 }); /** 1MB BUFFER */ 

    const streamWrite = (str) => {
        const buffer = stream.write(str);
        if (!buffer) return new Promise(resolve => stream.once('drain', resolve));
        return Promise.resolve();
    };

    for (const [key, values] of strategies_map) {
        const line = (JSON.stringify(readable(key)) + '\n');
        await streamWrite(line);
    }

    stream.end();

    await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
    });
};

const mergeNdjson = async (dir) => {
    if (!fs.existsSync(dir)) return console.error(`mergeNdjson.Error: ${dir}`);

    const files = fs.readdirSync(dir);
    const file_ref = files.find(f => path.parse(f).name === "__REF" && f.endsWith('.ndjson'));
    const map_ref = new Map();
    
    if (file_ref) {
        const file_path = path.join(dir, file_ref);
        const file_stream = fs.createReadStream(file_path);
        const rl = readline.createInterface({
            input: file_stream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            if (!line) continue;
            const { key, values } = JSON.parse(line.trim());
            map_ref.set(key, new Float64Array(values));
        }
    }

    const file_merged = "__MERGED";
    const path_merged = path.join(dir, `${file_merged}.ndjson`);
    const map_merged = new Map();

    for (const file of files) {
        if (!file.endsWith('.ndjson')) continue;
        if (file === file_ref || file === `${file_merged}.ndjson`) continue;

        const file_path = path.join(dir, file);
        const file_stream = fs.createReadStream(file_path);
        const rl = readline.createInterface({
            input: file_stream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            if (!line) continue;
            const { key, values } = JSON.parse(line.trim());
            
            const values_ref = map_ref.get(key);
            if (values_ref) {
                for (let j = 0; j < values.length; j++) values[j] -= values_ref[j];
            }

            const values_merged = map_merged.get(key);
            if (!values_merged) {
                map_merged.set(key, new Float64Array(values));
            } else {
                for (let j = 0; j < values_merged.length; j++) values_merged[j] += values[j];
            }
        }
    }

    const stream = fs.createWriteStream(path_merged, { flags: 'w', highWaterMark: 1024 * 1024 }); /** 1MB BUFFER */ 

    const streamWrite = (str) => {
        const buffer = stream.write(str);
        if (!buffer) return new Promise(resolve => stream.once('drain', resolve));
        return Promise.resolve();
    };

    for (const [key, values] of map_merged) {
        const values_ref = map_ref.get(key);
        if (values_ref) {
            for (let j = 0; j < values.length; j++) values[j] += values_ref[j];
        }
        /** QUICKER THAN `JSON.stringify()` */
        const line = `{"key":${key},"values":[${values.join(',')}]}\n`;
        await streamWrite(line);
    }

    stream.end();

    await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
    });

    if (dir.includes('strategies')) {
        await readableNdjsonStrategies(map_merged);
    }
};

const nashAvg = async () => {
    await Promise.all([
        mapNdjson(FILE_PATH_REGRETS, REGRETS_MAP, Float64Array),
        mapNdjson(FILE_PATH_STRATEGIES, STRATEGIES_MAP, Float64Array)
        // mapNdjson(FILE_PATH_EVS, evSum, Float64Array);
    ]);
    
    let regret_sum_normalized = 0;
    let regret_max_normalized = 0;
    
    let count = 0;
    let count_zero05 = 0;
    let count_zero1 = 0;
    let count_zero2 = 0;
    let count_zero3 = 0;
    let count_zero4 = 0;
    let count_zero5 = 0;

    for (const [key, values] of REGRETS_MAP) {
        const strats_values = STRATEGIES_MAP.get(key);
        if (!strats_values) continue;

        let visit_count = 0;
        for (let i = 0; i < strats_values.length; i++) visit_count += strats_values[i];

        if (visit_count <= 0) continue; 

        let value_max = 0;
        for (let i = 0; i < values.length; i++) {
            const v = values[i];
            if (v > value_max) value_max = v;
        }

        const value_avg = value_max / visit_count;

        regret_sum_normalized += value_avg;
        if (value_avg > regret_max_normalized) regret_max_normalized = value_avg;
        
        count++;

        if (value_avg > 0) {
            if (value_avg <= 0.005) count_zero05++;
            if (value_avg <= 0.01) count_zero1++;
            if (value_avg <= 0.02) count_zero2++;
            if (value_avg <= 0.03) count_zero3++;
            if (value_avg <= 0.04) count_zero4++;
            if (value_avg <= 0.05) count_zero5++;
        }
    }

    const regret_avg_normalized = count > 0 ? regret_sum_normalized / count : 0;

    console.log(`>>> NASH_0.005=${count_zero05} / ${count}`);
    console.log(`>>> NASH_0.01=${count_zero1} / ${count}`);
    console.log(`>>> NASH_0.02=${count_zero2} / ${count}`);
    console.log(`>>> NASH_0.03=${count_zero3} / ${count}`);
    console.log(`>>> NASH_0.04=${count_zero4} / ${count}`);
    console.log(`>>> NASH_0.05=${count_zero5} / ${count}`);
    console.log(`>>> NASH_AVG=${regret_avg_normalized}`);
    console.log(`>>> NASH_MAX=${regret_max_normalized}`);
}

const allHandsUint32Sorted = () => {
    const k = 5;
    const n = 52;
    const result = new Uint32Array(ALL_HANDS_LENGTH);

    const idx = new Uint8Array(k);
    for (let i = 0; i < k; i++) idx[i] = i;

    const buffer = new Uint8Array(k);
    let pos = 0;
    
    while (true) {
        for (let i = 0; i < k; i++) buffer[i] = DECK_UINT8[idx[i]];
        buffer.handUint8ArraySorted();
        result[pos++] = buffer.handUint32();

        let i = k - 1;
        while (i >= 0 && idx[i] === n - k + i) i--;
        if (i < 0) break;
        idx[i]++;
        for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }

    /** ASC SORTING */
    result.sort();
    return result;
};

const seedCache = async (round_int) => {
    const round_int_idx_max = round_int + 1;
    const ALL_HANDS_UINT32 = allHandsUint32Sorted(); /** ASC SORTING */

    /** TU START */
    // const h8arr_from_h32 = new Uint8Array(5);
    // for (let i = 0; i < ALL_HANDS_UINT32.length; i++) {
    //     const hand_u32 = ALL_HANDS_UINT32[i];
    //     // const h32_score = score(hand_u32);
    //     handUint8ArrayFromUint32(h8arr_from_h32, hand_u32);
    //     const harr_from_h8 = h8arr_from_h32.handArray();
    //     // const harr_score = getHandScore(harr_from_h8)//harr_from_h8.score();
    //     // if (h32_score.score !== harr_score.score) console.log("SCORE_MISMATCH >>>", h32_score, harr_score, ">>>", harr_from_h8);
    //     // if (h32_score.suit_pattern_idx !== harr_score.suit_pattern_idx) console.log("SCORE_MISMATCH >>>", h32_score, harr_score, ">>>", harr_from_h8);
    //     const h8arr_from_harr = harr_from_h8.handUint8Array();
    //     const h32_from_h8arr = h8arr_from_harr.handUint32();
    //     if (hand_u32 !== h32_from_h8arr) console.log("H32_CONVERSION_MISMATCH >>>", hand_u32, h32_from_h8arr, ">>>", harr_from_h8);

    //     for (let j = 0; j < h8arr_from_h32.length; j++) {
    //         if (h8arr_from_h32[j] !== h8arr_from_harr[j]) console.log("H8_CONVERSION_MISMATCH >>>", h8arr_from_h32, h8arr_from_harr, ">>>", harr_from_h8);;
    //     }

    //     const h8arr_from_h32_copy = new Uint8Array(h8arr_from_h32);
    //     h8arr_from_h32_copy.shuffleUint8Array();
    //     h8arr_from_h32_copy.handUint8ArraySorted();
    //     for (let j = 0; j < h8arr_from_h32.length; j++) {
    //         if (h8arr_from_h32[j] !== h8arr_from_h32_copy[j]) console.log("H8_SORTED_1_MISMATCH >>>", h8arr_from_h32, h8arr_from_harr, ">>>", harr_from_h8);;
    //     }

    //     const h8arr_from_harr_copy = new Uint8Array(h8arr_from_harr);
    //     h8arr_from_harr_copy.shuffleUint8Array();
    //     h8arr_from_harr_copy.handUint8ArraySorted();
    //     for (let j = 0; j < h8arr_from_harr.length; j++) {
    //         if (h8arr_from_harr[j] !== h8arr_from_harr_copy[j]) console.log("H8_SORTED_2_MISMATCH >>>", h8arr_from_h32, h8arr_from_harr, ">>>", harr_from_h8);;
    //     }
    // }
    // return;
    /** TU END */

    await mapNdjson(FILE_PATH_EVS, EVS_MAP, Float64Array);
    await mapNdjson(FILE_PATH_REGRETS, REGRETS_MAP, Float64Array);
    await mapNdjson(FILE_PATH_STRATEGIES, STRATEGIES_MAP, Float64Array);

    const cache = [];
    for (let i = 0; i < ALL_HANDS_UINT32.length; i++) {
        const hand_u32 = ALL_HANDS_UINT32[i];
        const { key_u32, hand_u32_score } = score(hand_u32);
        const will_visits_per_round = new Uint8Array(round_int_idx_max);
        const evs_per_round = new Float64Array(round_int_idx_max);

        const hand_u32_combinadic_idx = combinadicHu32Idx(hand_u32);
        ALL_HANDS_IDX_LUT[hand_u32_combinadic_idx] = i;

        for (let r = round_int; r > 0; r--) {
            const key = (key_u32 * KEY_SHIFT_MULTIPLIER) + r;
            const ev_values = EVS_MAP.get(key) || new Float64Array([1, 0]);
            const ev_visit = ev_values[0];
            const ev = (ev_values[1] / ev_visit);
            evs_per_round[r] = ev;

            if (ev_visit === 1) {
                will_visits_per_round[r] = 1;
                continue;
            }

            const strategy_values = STRATEGIES_MAP.get(key);
            const visit_count = strategy_values ? strategy_values.reduce((acc, strats) => acc + strats, 0) : 0;
            const regret_values = REGRETS_MAP.get(key);

            let regret_value_max = 0;
            if (regret_values) {
                for (let rv = 0; rv < regret_values.length; rv++) {
                    const v = regret_values[rv];
                    if (v > regret_value_max) regret_value_max = v;
                }
            }
            const regret_value_max_avg = visit_count > 0 ? regret_value_max / visit_count : 0;
            if (regret_value_max_avg > 0.01) {
                will_visits_per_round[r] = 1;
                continue;
            }
        }
        cache.push([hand_u32, key_u32, hand_u32_score, evs_per_round, will_visits_per_round]);
    }

    /** MANDATORY : CACHE ALREADY SORTED ASCENDINGLY FOR BINARY SEARCH BECAUSE OF allHandsUint32Sorted() */
    const N = cache.length;
    HANDS_UINT32 = new Uint32Array(N);
    HANDS_KEYS_UINT32 = new Uint32Array(N);
    HANDS_SCORES = new Uint32Array(N);
    HANDS_EVS_FLAT = new Float64Array(N * round_int);

    const keys_seen = new Set();
    const keys_indices = [];
    
    for (let i = 0; i < N; i++) {
        const [hand_u32, key_u32, hand_u32_score, evs_per_round, will_visits_per_round] = cache[i];
        HANDS_UINT32[i] = hand_u32;
        HANDS_KEYS_UINT32[i] = key_u32;
        HANDS_SCORES[i] = hand_u32_score;
        for (let r = round_int; r > 0; r--) {
            HANDS_EVS_FLAT[(i * round_int) + (r - 1)] = evs_per_round[r];
        }

        const will_visit = will_visits_per_round[round_int] === 1;
        if (will_visit) {
            if (!keys_seen.has(key_u32)) {
                keys_seen.add(key_u32);
                keys_indices.push(i);
            }
        }
    }

    HANDS_INDICES = Uint32Array.from(keys_indices);
    console.log(`>>> HANDS_INDICES_LENGTH=${HANDS_INDICES.length}`);
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
    console.error(`FATAL >>> BINARY SEARCH OUT OF BOUNDS = -1`);
    return process.exit(1);
};

const combinadicHu32Idx = (hand_u32) => {
    const c0 = (hand_u32 >>> 24) & 0x3F;
    const c1 = (hand_u32 >>> 18) & 0x3F;
    const c2 = (hand_u32 >>> 12) & 0x3F;
    const c3 = (hand_u32 >>> 6)  & 0x3F;
    const c4 = hand_u32 & 0x3F;

    /** RELIES ON CARDS_UINT8_SORTED MEANING WE NEED TO NORMALIZE THE VALUE FROM 4..55 TO 0..51 */
    const v0 = CARDS_UINT8_SORTED[c0] - 4;
    const v1 = CARDS_UINT8_SORTED[c1] - 4;
    const v2 = CARDS_UINT8_SORTED[c2] - 4;
    const v3 = CARDS_UINT8_SORTED[c3] - 4;
    const v4 = CARDS_UINT8_SORTED[c4] - 4;

    /** WE START FROM v0 TO v4 BECAUSE HAND_U32 IS SORTED DESC */
    return COMBINADIC_K[v0 * 6 + 5] + 
           COMBINADIC_K[v1 * 6 + 4] + 
           COMBINADIC_K[v2 * 6 + 3] + 
           COMBINADIC_K[v3 * 6 + 2] + 
           COMBINADIC_K[v4 * 6 + 1];
};

const combinadicHu32LutIdx = (hand_u32) => {
    const idx = combinadicHu32Idx(hand_u32);
    /** SAFEGUARD START */
    // if (idx < 0 || idx >= ALL_HANDS_LENGTH) {
    //     console.error(`FATAL >>> COMBINATIC INDEX OUT OF BOUNDS = ${idx}`);
    //     process.exit(1);
    // }
    /** SAFEGUARD END */
    return ALL_HANDS_IDX_LUT[idx];
};

const util = (p0_hand_u32_idx, p1_hand_u32_idx) => {
    const p0_hand_score = HANDS_SCORES[p0_hand_u32_idx];
    const p1_hand_score = HANDS_SCORES[p1_hand_u32_idx];
    return p0_hand_score === p1_hand_score ? 0 : p0_hand_score < p1_hand_score ? 1 : -1;
}

const playerActs = (hand_u32_idx, deck_u8_arr, deck_offset, action_idx) => {
    const hand_u32 = HANDS_UINT32[hand_u32_idx];
    let deck_offset_new = deck_offset;

    let c0 = (action_idx & 1)  ? deck_u8_arr[deck_offset_new++] : (hand_u32 >>> 24) & 0x3F;
    let c1 = (action_idx & 2)  ? deck_u8_arr[deck_offset_new++] : (hand_u32 >>> 18) & 0x3F;
    let c2 = (action_idx & 4)  ? deck_u8_arr[deck_offset_new++] : (hand_u32 >>> 12) & 0x3F;
    let c3 = (action_idx & 8)  ? deck_u8_arr[deck_offset_new++] : (hand_u32 >>> 6)  & 0x3F;
    let c4 = (action_idx & 16) ? deck_u8_arr[deck_offset_new++] : hand_u32 & 0x3F;

    /** SAFEGUARD START */
    // if (c0 === undefined || c1 === undefined || c2 === undefined || c3 === undefined || c4 === undefined) {
    //     console.error("FATAL >>> DECK OVERFLOW");
    //     process.exit(1);
    // }
    // if (c0 === c1 || c0 === c2 || c0 === c3 || c0 === c4 || c1 === c2 || c1 === c3 || c1 === c4 || c2 === c3 || c2 === c4 || c3 === c4) {
    //     console.error(`FATAL >>> DUPLICATE CARDS : ${c0},${c1},${c2},${c3},${c4}`);
    //     process.exit(1);
    // }
    /** SAFEGUARD END */

    let v0 = CARDS_UINT8_SORTED[c0];
    let v1 = CARDS_UINT8_SORTED[c1];
    let v2 = CARDS_UINT8_SORTED[c2];
    let v3 = CARDS_UINT8_SORTED[c3];
    let v4 = CARDS_UINT8_SORTED[c4];

    let tc, tv;
    if (v0 < v1) { tc = c0; c0 = c1; c1 = tc; tv = v0; v0 = v1; v1 = tv; }
    if (v3 < v4) { tc = c3; c3 = c4; c4 = tc; tv = v3; v3 = v4; v4 = tv; }
    if (v2 < v4) { tc = c2; c2 = c4; c4 = tc; tv = v2; v2 = v4; v4 = tv; }
    if (v2 < v3) { tc = c2; c2 = c3; c3 = tc; tv = v2; v2 = v3; v3 = tv; }
    if (v1 < v4) { tc = c1; c1 = c4; c4 = tc; tv = v1; v1 = v4; v4 = tv; }
    if (v0 < v3) { tc = c0; c0 = c3; c3 = tc; tv = v0; v0 = v3; v3 = tv; }
    if (v0 < v2) { tc = c0; c0 = c2; c2 = tc; tv = v0; v0 = v2; v2 = tv; }
    if (v1 < v3) { tc = c1; c1 = c3; c3 = tc; tv = v1; v1 = v3; v3 = tv; }
    if (v1 < v2) { tc = c1; c1 = c2; c2 = tc; tv = v1; v1 = v2; v2 = tv; }

    const hand_u32_new = ((c0 << 24) | (c1 << 18) | (c2 << 12) | (c3 << 6) | c4) >>> 0;
    const hand_u32_idx_new = combinadicHu32LutIdx(hand_u32_new);

    /** SAFEGUARD START */
    // const hand_u32_idx_new_2 = getHu32IndexByBinarySearch(HANDS_UINT32, hand_u32_new);
    // if (hand_u32_idx_new !== hand_u32_idx_new_2) {
    //     console.error(`FATAL >>> MISMATCH : COMBINATIC = ${hand_u32_idx_new} | BINARY = ${hand_u32_idx_new_2}`);
    //     process.exit(1);
    // }
    /** SAFEGUARD END */

    return (hand_u32_idx_new << 6) | deck_offset_new;
};

const seedStratsFromRegrets = (strats_buffer, regrets) => {
    let sum = 0;
    for (let i = 0; i < ACTIONS_LENGTH; ++i) {
        const r = regrets[i];
        const v = (r > 0) ? r : 0; 
        strats_buffer[i] = v;
        sum += v;
    }

    if (sum > 0) {
        const scale = 1.0 / sum; 
        for (let i = 0; i < ACTIONS_LENGTH; ++i) {
            strats_buffer[i] *= scale;
        }
    } else {
        strats_buffer.fill(STRAT_VALUE_DEFAULT);
    }
}

const rngActionIdx = (strats) => {
    const r = rng(); 
    let sum = 0;
    for (let i = 0; i < ACTIONS_LENGTH; i++) {
        sum += strats[i];
        if (r < sum) return i;
    }
    return ACTIONS_LENGTH - 1;
}

const simulate = (p0_hand_u32_idx, p1_hand_u32_idx, deck, deck_offset = 0, round_int, rounds_frozen_u8_arr, round_int_max) => {
    const p0_key = (HANDS_KEYS_UINT32[p0_hand_u32_idx] * KEY_SHIFT_MULTIPLIER) + round_int;
    const p1_key = (HANDS_KEYS_UINT32[p1_hand_u32_idx] * KEY_SHIFT_MULTIPLIER) + round_int;

    let p0_ev_sum = EVS_MAP.get(p0_key) || (EVS_MAP.set(p0_key, new Float64Array([0, 0])), EVS_MAP.get(p0_key));
    let p1_ev_sum = EVS_MAP.get(p1_key) || (EVS_MAP.set(p1_key, new Float64Array([0, 0])), EVS_MAP.get(p1_key));

    const ROUND_IS_FROZEN = rounds_frozen_u8_arr[round_int] === 1;
    const p0_util_frozen = ROUND_IS_FROZEN ? HANDS_EVS_FLAT.flatten(p0_hand_u32_idx, round_int, round_int_max) : null;

    if (!ROUND_IS_FROZEN) {
        p0_ev_sum[0]++;
        p1_ev_sum[0]++;
    }

    const p0_regrets = REGRETS_MAP.get(p0_key) || (REGRETS_MAP.set(p0_key, new Float64Array(ACTIONS_LENGTH)), REGRETS_MAP.get(p0_key));
    const p1_regrets = REGRETS_MAP.get(p1_key) || (REGRETS_MAP.set(p1_key, new Float64Array(ACTIONS_LENGTH)), REGRETS_MAP.get(p1_key));

    const p0_strats_buffer = new Float64Array(ACTIONS_LENGTH);
    const p1_strats_buffer = new Float64Array(ACTIONS_LENGTH);
    seedStratsFromRegrets(p0_strats_buffer, p0_regrets);
    seedStratsFromRegrets(p1_strats_buffer, p1_regrets);

    const p0_strats_sum = STRATEGIES_MAP.get(p0_key) || (STRATEGIES_MAP.set(p0_key, new Float64Array(ACTIONS_LENGTH)), STRATEGIES_MAP.get(p0_key));
    const p1_strats_sum = STRATEGIES_MAP.get(p1_key) || (STRATEGIES_MAP.set(p1_key, new Float64Array(ACTIONS_LENGTH)), STRATEGIES_MAP.get(p1_key));

    for (let i = 0; i < ACTIONS_LENGTH; ++i) {
        p0_strats_sum[i] += p0_strats_buffer[i];
        p1_strats_sum[i] += p1_strats_buffer[i];
    }

    const p0_rng_action_idx = rngActionIdx(p0_strats_buffer);
    const p1_rng_action_idx = rngActionIdx(p1_strats_buffer);

    const p0_rng_u32 = playerActs(p0_hand_u32_idx, deck, deck_offset, p0_rng_action_idx);
    const p0_rng_hand_u32_idx = p0_rng_u32 >>> 6;
    const p0_rng_deck_offset = p0_rng_u32 & 0x3F;

    const p1_rng_u32 = playerActs(p1_hand_u32_idx, deck, p0_rng_deck_offset, p1_rng_action_idx);
    const p1_rng_hand_u32_idx = p1_rng_u32 >>> 6;
    const p1_rng_deck_offset = p1_rng_u32 & 0x3F;

    const p0_util = !ROUND_IS_FROZEN
        ? round_int <= 1
            ? util(p0_rng_hand_u32_idx, p1_rng_hand_u32_idx)
            : simulate(p0_rng_hand_u32_idx, p1_rng_hand_u32_idx, deck, p1_rng_deck_offset, round_int - 1, rounds_frozen_u8_arr, round_int_max)
        : p0_util_frozen;
    const p1_util = -p0_util;

    if (!ROUND_IS_FROZEN) {
        p0_ev_sum[1] += p0_util;
        p1_ev_sum[1] += p1_util;
    }

    const p0_util_alt = new Float64Array(ACTIONS_LENGTH);
    const p1_util_alt = new Float64Array(ACTIONS_LENGTH);

    if (!ROUND_IS_FROZEN) {
        if (round_int <= 1) {
            for (let ai = 0; ai < ACTIONS_LENGTH; ++ai) {
                const p0_alt_u32 = playerActs(p0_hand_u32_idx, deck, deck_offset, ai);
                const p0_alt_hand_u32_idx = p0_alt_u32 >>> 6;
                const p0_alt_deck_offset = p0_alt_u32 & 0x3F;

                const p1_fix_u32 = playerActs(p1_hand_u32_idx, deck, p0_alt_deck_offset, p1_rng_action_idx);
                const p1_fix_hand_u32_idx = p1_fix_u32 >>> 6;
                // const p1_fix_deck_offset = p1_fix_u32 & 0x3F;

                p0_util_alt[ai] = util(p0_alt_hand_u32_idx, p1_fix_hand_u32_idx);
            }
            for (let ai = 0; ai < ACTIONS_LENGTH; ++ai) {
                const p1_alt_u32 = playerActs(p1_hand_u32_idx, deck, p0_rng_deck_offset, ai);
                const p1_alt_hand_u32_idx = p1_alt_u32 >>> 6;
                // const p1_alt_deck_offset = p1_alt_u32 & 0x3F;

                p1_util_alt[ai] = -util(p0_rng_hand_u32_idx, p1_alt_hand_u32_idx);
            }
        } else {
            for (let ai = 0; ai < ACTIONS_LENGTH; ++ai) {
                const p0_alt_u32 = playerActs(p0_hand_u32_idx, deck, deck_offset, ai);
                const p0_alt_hand_u32_idx = p0_alt_u32 >>> 6;
                const p0_alt_deck_offset = p0_alt_u32 & 0x3F;

                const p1_fix_u32 = playerActs(p1_hand_u32_idx, deck, p0_alt_deck_offset, p1_rng_action_idx);
                const p1_fix_hand_u32_idx = p1_fix_u32 >>> 6;
                const p1_fix_deck_offset = p1_fix_u32 & 0x3F;

                p0_util_alt[ai] = simulate(p0_alt_hand_u32_idx, p1_fix_hand_u32_idx, deck, p1_fix_deck_offset, round_int - 1, rounds_frozen_u8_arr, round_int_max);
            }
            for (let ai = 0; ai < ACTIONS_LENGTH; ++ai) {
                const p1_alt_u32 = playerActs(p1_hand_u32_idx, deck, p0_rng_deck_offset, ai);
                const p1_alt_hand_u32_idx = p1_alt_u32 >>> 6;
                const p1_alt_deck_offset = p1_alt_u32 & 0x3F;

                p1_util_alt[ai] = -simulate(p0_rng_hand_u32_idx, p1_alt_hand_u32_idx, deck, p1_alt_deck_offset, round_int - 1, rounds_frozen_u8_arr, round_int_max);
            }
        }
    } else {
        for (let ai = 0; ai < ACTIONS_LENGTH; ++ai) {
            p0_util_alt[ai] = p0_util;
            p1_util_alt[ai] = -p0_util;
        }
    }

    for (let ai = 0; ai < ACTIONS_LENGTH; ++ai) {
        p0_regrets[ai] += p0_util_alt[ai] - p0_util;
        p1_regrets[ai] += p1_util_alt[ai] - p1_util;
    }

    return p0_util;
}

const compute = async (round_int, rounds_frozen_u8_arr) => {
    if (cluster.isMaster) {
        const cpu_count = (os.cpus().length * 32 / 32).safe("ROUND", 0);
        let workers_count = cpu_count;

        for (let id = 0; id < cpu_count; id++) cluster.fork({ WORKER_ID: id });

        const shutdown = () => {
            console.log(`>>> WORKER_ID=MASTER | PID=${process.pid} | SHUTDOWN`);
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
            readline.createInterface({ input: process.stdin, output: process.stdout }).on('SIGINT', shutdown);
        }

        cluster.on('exit', (worker, code) => {
            console.log(`>>> WORKER | PID=${worker.process.pid} | EXIT_CODE=${code}`);
            workers_count--;
            if (workers_count === 0) {
                console.log(`>>> WORKER_ID=MASTER | PID=${worker.process.pid} | EXIT`);
                process.exit(0);
            }
        });
    } else {
        const worker_id = Number(process.env.WORKER_ID);
        let stop = false;

        ['message', 'SIGINT', 'SIGTERM'].forEach(signal => {
            process.on(signal, (msg) => {
                if (signal === 'message' && msg.cmd !== 'shutdown') {
                    console.log(`>>> WORKER_ID=${worker_id} | PID=${process.pid} | ${signal} | CMD=${msg.cmd}`);
                    return;
                }
                console.log(`>>> WORKER_ID=${worker_id} | PID=${process.pid} | ${signal} | FINISHING`);
                stop = true;
            });
        });

        console.log(`>>> WORKER_ID=${worker_id} | PID=${process.pid} | START`);

        seedRng();
        await seedCache(round_int);
        const deck_u8_arr_buffer = new Uint8Array(47);
        const p0_hand_u8_arr_buffer = new Uint8Array(5);
        const p1_hand_u8_arr_buffer = new Uint8Array(5);

        const flush_interval = HANDS_INDICES.length * 100000;
        const iterations = 10_000_000;
        const time_now_out = performance.now();
        let time_now_in = performance.now();

        for (let s = 0; s < iterations; ++s) {
            for (let i = 0; i < HANDS_INDICES.length; ++i) {
                const p0_hand_u32_idx = HANDS_INDICES[i];
                const p0_hand_u32 = HANDS_UINT32[p0_hand_u32_idx];
                handUint8ArrayFromUint32(p0_hand_u8_arr_buffer, p0_hand_u32);
                deck_u8_arr_buffer.deckUint8FilledAndShuffled(p0_hand_u8_arr_buffer);

                /** SAFEGUARD START */
                // for (let d = 0; d < 47; d++) {
                //     const c = deck_u8_arr_buffer[d];
                //     if (p0_hand_u8_arr_buffer.includes(c)) {
                //         console.error(`FATAL >>> CARD(${c}) FOUND IN DECK AND HAND`);
                //         process.exit(1);
                //     }
                // }
                /** SAFEGUARD END */

                p1_hand_u8_arr_buffer[0] = deck_u8_arr_buffer[0];
                p1_hand_u8_arr_buffer[1] = deck_u8_arr_buffer[1];
                p1_hand_u8_arr_buffer[2] = deck_u8_arr_buffer[2];
                p1_hand_u8_arr_buffer[3] = deck_u8_arr_buffer[3];
                p1_hand_u8_arr_buffer[4] = deck_u8_arr_buffer[4];
                p1_hand_u8_arr_buffer.handUint8ArraySorted();

                const p1_hand_u32 = p1_hand_u8_arr_buffer.handUint32();
                const p1_hand_u32_idx = combinadicHu32LutIdx(p1_hand_u32);

                simulate(p0_hand_u32_idx, p1_hand_u32_idx, deck_u8_arr_buffer, 5, round_int, rounds_frozen_u8_arr, round_int);

                /** SAFEGUARD START */
                // if (Number.isNaN(sim)) {
                //     console.error("FATAL >>> SIM RETURNED NaN");
                //     process.exit(1);
                // }
                /** SAFEGUARD END */

                if ((s * HANDS_INDICES.length + i + 1) % flush_interval === 0 || (s === iterations - 1 && i === HANDS_INDICES.length - 1)) {
                    await flushNdjson(worker_id);
                    const elapsed = (performance.now() - time_now_in).safe("ROUND", 0);
                    time_now_in = performance.now();
                    console.log(`>>> WORKER_ID=${worker_id} | PID=${process.pid} | ITERATION=${s + 1} | HAND_ITERATION=${i + 1} | TIME_ELAPSED=${elapsed}ms`);
                }
            }
            if (stop) break;
        }

        if (stop) {
            await flushNdjson(worker_id);
            const elapsed = (performance.now() - time_now_out).safe("ROUND", 0);
            console.log(`>>> WORKER_ID=${worker_id} | PID=${process.pid} | STOP | TIME_ELAPSED=${elapsed}ms`);
        }
        console.log(`>>> WORKER_ID=${worker_id} | PID=${process.pid} | EXIT`);
        process.exit(0);
    }
};





/** INIT */
const { ACTIONS, ACTIONS_LENGTH, STRAT_VALUE_DEFAULT } = (() => {
    for (let i = 0; i < SUITS_PATTERN_KEYS.length; i++) SUITS_PATTERN[SUITS_PATTERN_KEYS[i]] = i;
    seedSuitsPatternLut();

    for (let i = 0; i < DECK_LENGTH; i++) {
        DECK_UINT8[i] = i;
        const r = i % RANKS_LENGTH;
        const s = (i / RANKS_LENGTH) | 0;
        
        RANKS_VALUE_MAP[i] = r;
        SUITS_VALUE_MAP[i] = s;
        
        const c = RANKS[r] + SUITS[s];
        DECK_STR[i] = c;
        CARDS_STR_TO_UINT8_MAP.set(c, i);
        CARDS_UINT8_SORTED[i] = ((r + 1) << 2) | s;

        /** SEED COMBINADIC COEFFICIENTS */
        COMBINADIC_K[i * 6 + 0] = 1;
        for (let k = 1; k <= 5; k++) {
            if (k > i) {
                COMBINADIC_K[i * 6 + k] = 0;
            } else {
                let v = 1;
                for (let j = 0; j < k; j++) v = v * (i - j) / (j + 1);
                COMBINADIC_K[i * 6 + k] = v.safe("ROUND", 0);
            }
        }
    }

    const actions = [];
    for (let mask = 0; mask < 32; ++mask) {
        const arr = [];
        for (let i = 0; i < 5; ++i) {
            if (mask & (1 << i)) arr.push(i);
        }
        actions.push(arr);
    }

    const count = actions.length;

    return { 
        ACTIONS: actions,
        ACTIONS_LENGTH: actions.length,
        STRAT_VALUE_DEFAULT: 1 / count
    };
})();

let HANDS_UINT32, HANDS_KEYS_UINT32, HANDS_SCORES, HANDS_EVS_FLAT, HANDS_INDICES;

(async () => {
    const round_int = 1;
    const rounds_frozen_u8_arr = new Uint8Array([0, 0, 0, 0]);
    await compute(round_int, rounds_frozen_u8_arr);

    // for (const dir of [DIR_PATH_EVS, DIR_PATH_REGRETS, DIR_PATH_STRATEGIES]) await mergeNdjson(dir);

    // await nashAvg();

    // await mapNdjson(path.join(DIR_PATH_RESULTS, 'strategies/__REF.ndjson'), STRATEGIES_MAP, Float64Array)
    // await readableNdjsonStrategies(STRATEGIES_MAP);
})();
// >>> NASH_ZERO=0 / 14469
// >>> NASH_0.01=12537 / 14469
// >>> NASH_0.02=14469 / 14469
// >>> NASH_0.03=14469 / 14469
// >>> NASH_0.04=14469 / 14469
// >>> NASH_0.05=14469 / 14469
// >>> NASH_AVG=0.008974240833475238
// >>> NASH_MAX=0.012815689668056428