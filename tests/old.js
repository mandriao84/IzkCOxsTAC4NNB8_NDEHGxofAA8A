const fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
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
const keysMap = new Map();
const scoresMap = new Map();
const discardskMap = new Map();
const discardsMap = new Map();
const standsevMap = new Map();
const evsMap = new Map();


const getTimeElapsed = (timeStart, signal, error) => {
    const timeElapsed = process.hrtime(timeStart);
    const timeElapsedAsMs = timeElapsed[0] * 1000 + timeElapsed[1] / 1e6;
    console.log(`\ngetTimeElapsed.${signal}.${error} : ${timeElapsedAsMs.toFixed(2)}ms`);
}

const getHandsDealed = (deck, cardsNumberPerHand, handsNumber) => {
    const hands = Array.from({ "length": handsNumber }, () => []);
    for (let i = 0; i < cardsNumberPerHand; i++) {
        for (let j = 0; j < handsNumber; j++) {
            hands[j].push(deck.pop());
        }
    }
    return hands;
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