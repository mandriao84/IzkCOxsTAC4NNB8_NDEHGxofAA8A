#!/usr/bin/env node
"use strict";

// const DECK = {
//   1: '2s', 2: '3s', 3: '4s', 4: '5s', 5: '6s', 6: '7s', 7: '8s', 8: '9s', 9: '10s', 10: 'Js', 11: 'Qs', 12: 'Ks', 13: 'As',
//   14: '2h', 15: '3h', 16: '4h', 17: '5h', 18: '6h', 19: '7h', 20: '8h', 21: '9h', 22: '10h', 23: 'Jh', 24: 'Qh', 25: 'Kh', 26: 'Ah',
//   27: '2d', 28: '3d', 29: '4d', 30: '5d', 31: '6d', 32: '7d', 33: '8d', 34: '9d', 35: '10d', 36: 'Jd', 37: 'Qd', 38: 'Kd', 39: 'Ad',
//   40: '2c', 41: '3c', 42: '4c', 43: '5c', 44: '6c', 45: '7c', 46: '8c', 47: '9c', 48: '10c', 49: 'Jc', 50: 'Qc', 51: 'Kc', 52: 'Ac'
// };
// const CARDS = { 'A': 13, 'K': 12, 'Q': 11, 'J': 10, '10': 9, '9': 8, '8': 7, '7': 6, '6': 5, '5': 4, '4': 3, '3': 2, '2': 1 };


// const getArrayShuffled = (array) => {
//   for (let c1 = array.length - 1; c1 > 0; c1--) {
//       let c2 = Math.floor(Math.random() * (c1 + 1));
//       let tmp = array[c1];
//       array[c1] = array[c2];
//       array[c2] = tmp;
//   }
// }

// const getHandsDealed = (deck, cardsNumberPerHand, handsNumber) => {
//   const hands = Array.from({ "length": handsNumber }, () => []);
//   for (let i = 0; i < cardsNumberPerHand; i++) {
//       for (let j = 0; j < handsNumber; j++) {
//           hands[j].push(deck.pop());
//       }
//   }
//   return hands;
// }

// function getHandSorted(hand) {
//   console.log('getHandSorted', hand);
//   const getCardRank = (card) => card.slice(0, -1);
//   const getCardValue = (card) => CARDS[getCardRank(card)];
//   const cardValues = hand.map(getCardValue);
//   const staightWithAs = [13, 1, 2, 3, 4];
//   const isStraightWithAs = staightWithAs.every(v => cardValues.includes(v));

//   hand.sort((a, b) => {
//       const cardValueA = getCardValue(a);
//       const cardValueB = getCardValue(b);
//       if (isStraightWithAs) {
//           if (cardValueA === 13) return -1;
//           if (cardValueB === 13) return 1;
//       }
//       return cardValueA - cardValueB;
//   });

//   return hand;
// }

const fs = require('fs');
const path = require('path');

// =========== CONFIG & PATHS =======================
const iterations = parseInt(process.argv[2] || "10000000", 10);      // total training iterations
const SAVE_INTERVAL = parseInt(process.argv[3] || "100000", 10);      // save every N iterations
const resultsDir = process.argv[4] || path.join('.results', 'discard_ndjson');  // output directory
const NUM_CHANCE_SAMPLES = 10;

try {
  fs.mkdirSync(resultsDir, { recursive: true });
} catch (err) {
  console.error(`Error creating directory ${resultsDir}:`, err);
  process.exit(1);
}

// ND-JSON file paths:
const regretND = path.join(resultsDir, 'regret.ndjson');
const strategyND = path.join(resultsDir, 'strategy.ndjson');

// Global tables for CFR:
let regretTable = {};
let strategySumTable = {};

// =========== ND-JSON LOAD ==========================
function loadNdjson() {
  let loadedReg = 0;
  let loadedStrat = 0;
  if (fs.existsSync(regretND)) {
    try {
      const lines = fs.readFileSync(regretND, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // skip empty
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

// =========== ND-JSON SAVE ==========================
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

// ==================== CFR DATA & LOGIC =========================

// Constants
const DECK_SIZE = 52;
const CARD_RANKS = 13;
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
// Lower score is better.
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

// Shuffle a deck (array of card indices 0..51).
function shuffleDeck() {
  const deck = new Array(52);
  for (let i = 0; i < 52; i++) {
    deck[i] = i;
  }
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

// Given a hand and an action (bitmask), apply the discard.
// Returns { newHand, numDiscarded } where newHand contains the kept cards.
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

// ---------- Algorithmic Enhancement: CFR+ Updates ----------
// In CFR+, after each regret update, we clip negative values to 0.

// FUNCTION: cfrPlayer0Node
// Handles player 0's decision; p0 and p1 are the reach probabilities.
function cfrPlayer0Node(hand0, hand1, deck, p0, p1) {
  const key0 = hand0.slice().sort((a, b) => a - b).join(',');
  if (!regretTable[key0]) {
    regretTable[key0] = new Array(32).fill(0);
    strategySumTable[key0] = new Array(32).fill(0);
  }
  const regrets = regretTable[key0];
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
    strategySumTable[key0][a] = parseFloat((strategySumTable[key0][a] + p0 * strategy[a]).toFixed(5));
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
    // CFR+ update: clip negative regrets
    regrets[a] = parseFloat(Math.max(0, regrets[a] + p1 * (actionUtil[a] - nodeUtil)).toFixed(5));
  }
  return nodeUtil;
}

// FUNCTION: cfrPlayer1Node
// Handles player 1's decision after player 0. oppDraw: number of cards player 0 discarded.
function cfrPlayer1Node(hand0, hand1, deck, oppDraw, p0, p1) {
  const key1 = hand1.slice().sort((a, b) => a - b).join(',') + `|D${oppDraw}`;
  if (!regretTable[key1]) {
    regretTable[key1] = new Array(32).fill(0);
    strategySumTable[key1] = new Array(32).fill(0);
  }
  const regrets = regretTable[key1];
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
    strategySumTable[key1][a] = parseFloat((strategySumTable[key1][a] + p1 * strategy[a]).toFixed(5));
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

// ---------- End CFR+ modifications ----------

// FUNCTION: simulateShowdown
// We perform multiple chance samples (NUM_CHANCE_SAMPLES) and average the utility.
function simulateShowdown(hand0, hand1, deck, discardCount0, discardCount1) {
  let totalUtil = 0;
  for (let s = 0; s < NUM_CHANCE_SAMPLES; s++) {
    let sampleDeck = deck.slice();
    let sampleHand0 = hand0.slice();
    let sampleHand1 = hand1.slice();
    // For player 0: draw discardCount0 random cards.
    for (let i = 0; i < discardCount0; i++) {
      const index = Math.floor(Math.random() * sampleDeck.length);
      sampleHand0.push(sampleDeck[index]);
      sampleDeck.splice(index, 1);
    }
    // For player 1: draw discardCount1 random cards.
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

// ================= MAIN TRAINING LOOP =================
console.log(`Starting CFR training for ${iterations} iterations...`);
for (let iter = 1; iter <= iterations; iter++) {
  const deck = shuffleDeck();
  const hand0 = deck.slice(0, 5);
  const hand1 = deck.slice(5, 10);
  const leftover = deck.slice(10);
  
  // For a small action space (32 actions), full iteration is acceptable.
  // Outcome sampling could be introduced if the action space grew.
  cfrPlayer0Node(hand0, hand1, leftover, 1, 1);
  
  if (iter % SAVE_INTERVAL === 0) {
    console.log(`Iteration ${iter}, saving ND-JSON...`);
    saveNdjson();
  }
}
if ((iterations % SAVE_INTERVAL) !== 0) {
  console.log(`Final save at iteration ${iterations}...`);
  saveNdjson();
}
console.log("Training complete.");