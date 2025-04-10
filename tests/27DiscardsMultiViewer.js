#!/usr/bin/env node
"use strict";

const fs = require('fs');
const path = require('path');

const resultsDir = process.argv[2] || path.join('.results', 'discard_ndjson');
const strategyFile = path.join(resultsDir, 'strategy_global.ndjson');

// Enhanced card display
const rankNames = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const suitNames = ["♣", "♦", "♥", "♠"]; // Using Unicode suit symbols

function cardToString(cardIndex) {
  const rank = cardIndex % 13;
  const suit = Math.floor(cardIndex / 13);
  return `${rankNames[rank]}${suitNames[suit]}`;
}

// New: Convert action number to discard positions
function actionToDiscards(action) {
  const discards = [];
  for (let i = 0; i < 5; i++) {
    if (action & (1 << i)) discards.push(i);
  }
  return discards.length ? discards.join(',') : 'None';
}

function parseInfoSet(key) {
  const [handPart, discardCount] = key.split("|D");
  return {
    cards: handPart.split(",").map(Number).map(cardToString).sort(),
    discardCount: discardCount || '0',
    isPlayer1: !!discardCount
  };
}

function loadStrategy() {
  const strategy = {};
  try {
    fs.readFileSync(strategyFile, 'utf8')
      .split('\n')
      .forEach(line => {
        const trimmed = line.trim();
        if (trimmed) {
          const obj = JSON.parse(trimmed);
          strategy[obj.key] = obj.value.map((v, i) => ({
            action: i,
            probability: v,
            discards: actionToDiscards(i),
            count: (i.toString(2).match(/1/g) || []).length
          }));
        }
      });
  } catch (e) {
    console.error(`Error loading strategy: ${e.message}`);
    process.exit(1);
  }
  return strategy;
}

function displayStrategy(strategy) {
  console.log("=== 2-7 Lowball Discard Strategy Analysis ===");
  
  Object.entries(strategy).forEach(([key, actions]) => {
    const { cards, discardCount, isPlayer1 } = parseInfoSet(key);
    const totalActions = actions.filter(a => a.probability > 0.01).length;
    
    console.log(`\n■ Hand: ${cards.join(' ')}`);
    console.log(`  Player: ${isPlayer1 ? '1' : '0'} | Opponent Discarded: ${discardCount}`);
    console.log(`  Significant Actions: ${totalActions}`);

    // Group by discard count
    const actionGroups = actions.reduce((acc, curr) => {
      if (curr.probability > 0.01) {
        const group = acc[curr.count] || [];
        group.push(curr);
        acc[curr.count] = group;
      }
      return acc;
    }, {});

    Object.entries(actionGroups).forEach(([count, group]) => {
      console.log(`\n  Discard ${count} card(s):`);
      group.sort((a, b) => b.probability - a.probability)
          .slice(0, 5)
          .forEach(action => {
            console.log(`    → Positions [${action.discards}]: ${(action.probability * 100).toFixed(1)}%`);
          });
    });

    // Show top 5 recommendations
    const topActions = actions.sort((a, b) => b.probability - a.probability)
                             .slice(0, 5)
                             .map(a => `${a.discards.padEnd(8)} ${(a.probability * 100).toFixed(1)}%`);
    
    console.log(`\n  Top Recommendations:`);
    console.log(`    ${topActions.join('\n    ')}`);
    console.log("━".repeat(60));
  });
}

// Run analysis
const strategy = loadStrategy();
displayStrategy(strategy);