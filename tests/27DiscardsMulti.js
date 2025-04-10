#!/usr/bin/env node
"use strict";

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const DECK_SIZE = 52;
const CARD_RANKS = 13;
const NUM_CHANCE_SAMPLES = workerData && workerData.NUM_CHANCE_SAMPLES || 10;

// ---------- Define iterations depending on the thread ----------
const iterations = isMainThread 
    ? parseInt(process.argv[2] || "10000000000", 10)
    : workerData.iterations;
const SAVE_INTERVAL = parseInt(process.argv[3] || "1000000000", 10);
const resultsDir = process.argv[4] || path.join('.results', 'discard_ndjson');

try {
  fs.mkdirSync(resultsDir, { recursive: true });
} catch (err) {
  console.error(`Error creating directory ${resultsDir}:`, err);
  process.exit(1);
}

// ND-JSON file paths:
const regretND = path.join(resultsDir, 'regret.ndjson');
const strategyND = path.join(resultsDir, 'strategy.ndjson');

// Global tables for CFR (used in the master only):
let regretTable = {};
let strategySumTable = {};

// ---------- ND-JSON LOAD -------------------------
function loadNdjson() {
  let loadedReg = 0;
  let loadedStrat = 0;
  if (fs.existsSync(regretND)) {
    try {
      const lines = fs.readFileSync(regretND, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const obj = JSON.parse(line); // { key, value }
        regretTable[obj.key] = obj.value;
        loadedReg++;
      }
      console.log(`Loaded ${loadedReg} regret entries from ${regretND}`);
    } catch (err) {
      console.error("Error loading regret ND-JSON:", err);
    }
  } else {
    console.log("No regret ND-JSON found, starting fresh.");
  }
  if (fs.existsSync(strategyND)) {
    try {
      const lines = fs.readFileSync(strategyND, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const obj = JSON.parse(line); // { key, value }
        strategySumTable[obj.key] = obj.value;
        loadedStrat++;
      }
      console.log(`Loaded ${loadedStrat} strategy entries from ${strategyND}`);
    } catch (err) {
      console.error("Error loading strategy ND-JSON:", err);
    }
  } else {
    console.log("No strategy ND-JSON found, starting fresh.");
  }
}
loadNdjson();

// ---------- ND-JSON SAVE -------------------------
function saveNdjson() {
  try {
    let lines = [];
    const keysR = Object.keys(regretTable);
    for (let i = 0; i < keysR.length; i++) {
      const k = keysR[i];
      const obj = { key: k, value: regretTable[k] };
      lines.push(JSON.stringify(obj));
    }
    fs.writeFileSync(regretND, lines.join('\n'));
    console.log(`Saved regret ND-JSON with ${keysR.length} entries.`);
  } catch (err) {
    console.error("Error saving regret ND-JSON:", err);
  }
  
  try {
    let lines = [];
    const keysS = Object.keys(strategySumTable);
    for (let i = 0; i < keysS.length; i++) {
      const k = keysS[i];
      const obj = { key: k, value: strategySumTable[k] };
      lines.push(JSON.stringify(obj));
    }
    fs.writeFileSync(strategyND, lines.join('\n'));
    console.log(`Saved strategy ND-JSON with ${keysS.length} entries.`);
  } catch (err) {
    console.error("Error saving strategy ND-JSON:", err);
  }
}

// ==================== Shared CFR Functions =========================

// Constants & arrays:
const ALL_ACTIONS = [];
for (let mask = 0; mask < 32; mask++) {
  ALL_ACTIONS.push(mask);
}
const discardCount = ALL_ACTIONS.map(mask => {
  let c = 0;
  let m = mask;
  while (m) {
    c += (m & 1);
    m >>= 1;
  }
  return c;
});

// Evaluate a 5-card hand for 2-7 lowball.
function evaluateLowHand(cards) {
  const ranks = new Array(5);
  const suits = new Array(5);
  for (let i = 0; i < 5; i++) {
    const c = cards[i];
    ranks[i] = c % CARD_RANKS;
    suits[i] = Math.floor(c / CARD_RANKS);
  }
  ranks.sort((a, b) => a - b);
  const unique = new Set(ranks);
  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = (unique.size === 5 && (ranks[4] - ranks[0] === 4));
  let category = 0;
  if (isFlush || isStraight || unique.size < 5) category = 1;
  let sc = 0;
  for (let i = 4; i >= 0; i--) {
    sc = sc * 13 + ranks[i];
  }
  return category * 1000000 + sc;
}

function compareHandsLowball5(hA, hB) {
  const sA = evaluateLowHand(hA);
  const sB = evaluateLowHand(hB);
  if (sA < sB) return 1;
  if (sB < sA) return -1;
  return 0;
}

function shuffleDeck() {
  const deck = new Array(DECK_SIZE);
  for (let i = 0; i < DECK_SIZE; i++) {
    deck[i] = i;
  }
  for (let i = DECK_SIZE - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

function applyDiscard(hand, action) {
  const newHand = [];
  let numDiscarded = 0;
  for (let i = 0; i < 5; i++) {
    if ((action & (1 << i)) === 0) {
      newHand.push(hand[i]);
    } else {
      numDiscarded++;
    }
  }
  return { newHand, numDiscarded };
}

function simulateShowdown(hand0, hand1, deck, discardCount0, discardCount1) {
  let totalUtil = 0;
  for (let s = 0; s < NUM_CHANCE_SAMPLES; s++) {
    let sampleDeck = deck.slice();
    let sampleHand0 = hand0.slice();
    let sampleHand1 = hand1.slice();
    for (let i = 0; i < discardCount0; i++) {
      const index = Math.floor(Math.random() * sampleDeck.length);
      sampleHand0.push(sampleDeck[index]);
      sampleDeck.splice(index, 1);
    }
    for (let i = 0; i < discardCount1; i++) {
      const index = Math.floor(Math.random() * sampleDeck.length);
      sampleHand1.push(sampleDeck[index]);
      sampleDeck.splice(index, 1);
    }
    if (sampleHand0.length !== 5 || sampleHand1.length !== 5) {
      throw new Error("Final hands do not have 5 cards.");
    }
    const res = compareHandsLowball5(sampleHand0, sampleHand1);
    totalUtil += (res === 1 ? 1 : (res === -1 ? -1 : 0));
  }
  return totalUtil / NUM_CHANCE_SAMPLES;
}

// ---------- CFR+ Functions (CFR+ style regret updates) ----------
let localRegretTable = {};
let localStrategySumTable = {};

function cfrPlayer0Node(hand0, hand1, deck, p0, p1) {
  const key0 = hand0.slice().sort((a, b) => a - b).join(',');
  if (!localRegretTable[key0]) {
    localRegretTable[key0] = new Array(32).fill(0);
    localStrategySumTable[key0] = new Array(32).fill(0);
  }
  const regrets = localRegretTable[key0];
  const strategy = new Array(32);
  let sumPos = 0;
  for (let a = 0; a < 32; a++) {
    strategy[a] = regrets[a] > 0 ? regrets[a] : 0;
    sumPos += strategy[a];
  }
  if (sumPos > 1e-9) {
    for (let a = 0; a < 32; a++) {
      strategy[a] /= sumPos;
    }
  } else {
    for (let a = 0; a < 32; a++) {
      strategy[a] = 1.0 / 32;
    }
  }
  for (let a = 0; a < 32; a++) {
    localStrategySumTable[key0][a] = parseFloat((localStrategySumTable[key0][a] + p0 * strategy[a]).toFixed(5));
  }
  const actionUtil = new Array(32).fill(0);
  let nodeUtil = 0;
  for (let a = 0; a < 32; a++) {
    const { newHand, numDiscarded } = applyDiscard(hand0, a);
    const util = cfrPlayer1Node(newHand, hand1, deck, numDiscarded, p0 * strategy[a], p1);
    actionUtil[a] = util;
    nodeUtil += strategy[a] * util;
  }
  for (let a = 0; a < 32; a++) {
    regrets[a] = parseFloat(Math.max(0, regrets[a] + p1 * (actionUtil[a] - nodeUtil)).toFixed(5));
  }
  return nodeUtil;
}

function cfrPlayer1Node(hand0, hand1, deck, oppDraw, p0, p1) {
  const key1 = hand1.slice().sort((a, b) => a - b).join(',') + `|D${oppDraw}`;
  if (!localRegretTable[key1]) {
    localRegretTable[key1] = new Array(32).fill(0);
    localStrategySumTable[key1] = new Array(32).fill(0);
  }
  const regrets = localRegretTable[key1];
  const strategy = new Array(32);
  let sumPos = 0;
  for (let a = 0; a < 32; a++) {
    strategy[a] = regrets[a] > 0 ? regrets[a] : 0;
    sumPos += strategy[a];
  }
  if (sumPos > 1e-9) {
    for (let a = 0; a < 32; a++) {
      strategy[a] /= sumPos;
    }
  } else {
    for (let a = 0; a < 32; a++) {
      strategy[a] = 1.0 / 32;
    }
  }
  for (let a = 0; a < 32; a++) {
    localStrategySumTable[key1][a] = parseFloat((localStrategySumTable[key1][a] + p1 * strategy[a]).toFixed(5));
  }
  const actionUtil = new Array(32).fill(0);
  let nodeUtil = 0;
  for (let a = 0; a < 32; a++) {
    const { newHand, numDiscarded } = applyDiscard(hand1, a);
    const util = simulateShowdown(hand0, newHand, deck, oppDraw, numDiscarded);
    actionUtil[a] = util;
    nodeUtil += strategy[a] * util;
  }
  for (let a = 0; a < 32; a++) {
    regrets[a] = parseFloat(Math.max(0, regrets[a] + p0 * (nodeUtil - actionUtil[a])).toFixed(5));
  }
  return nodeUtil;
}

// ---------- Worker Main Function ----------
function runIterations(iterations) {
  for (let iter = 0; iter < iterations; iter++) {
    const deck = shuffleDeck();
    const hand0 = deck.slice(0, 5);
    const hand1 = deck.slice(5, 10);
    const leftover = deck.slice(10);
    cfrPlayer0Node(hand0, hand1, leftover, 1, 1);
  }
  // Post results back to master.
  parentPort.postMessage({
    regretTable: localRegretTable,
    strategySumTable: localStrategySumTable
  });
}

// ---------- Master / Worker Branching ----------
if (isMainThread) {
  const numWorkers = parseInt(process.argv[5] || os.cpus().length.toString(), 10);
  const iterationsPerWorker = Math.floor(iterations / numWorkers);
  let remaining = iterations % numWorkers;
  let workersCompleted = 0;
  
  let globalRegret = {};
  let globalStrategy = {};
  
  function mergeTables(globalTable, localTable) {
    for (const key in localTable) {
      if (!globalTable[key]) {
        globalTable[key] = localTable[key].slice();
      } else {
        const localArr = localTable[key];
        for (let i = 0; i < localArr.length; i++) {
          globalTable[key][i] = parseFloat((globalTable[key][i] + localArr[i]).toFixed(5));
        }
      }
    }
  }
  
  const workers = [];
  for (let i = 0; i < numWorkers; i++) {
    const iters = iterationsPerWorker + (remaining > 0 ? 1 : 0);
    if (remaining > 0) remaining--;
    const worker = new Worker(__filename, {
      workerData: { iterations: iters, SAVE_INTERVAL, resultsDir, NUM_CHANCE_SAMPLES }
    });
    worker.on('message', (msg) => {
      mergeTables(globalRegret, msg.regretTable);
      mergeTables(globalStrategy, msg.strategySumTable);
      workersCompleted++;
      console.log(`Worker ${i} completed.`);
      if (workersCompleted === numWorkers) {
        console.log("All workers completed. Saving global results...");
        try {
          let lines = [];
          const keysR = Object.keys(globalRegret);
          for (let j = 0; j < keysR.length; j++) {
            const k = keysR[j];
            const obj = { key: k, value: globalRegret[k] };
            lines.push(JSON.stringify(obj));
          }
          fs.writeFileSync(path.join(resultsDir, 'regret_global.ndjson'), lines.join('\n'));
          console.log(`Saved global regret ND-JSON with ${keysR.length} entries.`);
        } catch (err) {
          console.error("Error saving global regret ND-JSON:", err);
        }
        try {
          let lines = [];
          const keysS = Object.keys(globalStrategy);
          for (let j = 0; j < keysS.length; j++) {
            const k = keysS[j];
            const obj = { key: k, value: globalStrategy[k] };
            lines.push(JSON.stringify(obj));
          }
          fs.writeFileSync(path.join(resultsDir, 'strategy_global.ndjson'), lines.join('\n'));
          console.log(`Saved global strategy ND-JSON with ${keysS.length} entries.`);
        } catch (err) {
          console.error("Error saving global strategy ND-JSON:", err);
        }
        console.log("Training complete.");
      }
    });
    worker.on('error', (err) => console.error(err));
    workers.push(worker);
  }
} else {
  // Worker thread:
  runIterations(workerData.iterations);
}