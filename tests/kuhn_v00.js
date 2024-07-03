// Kuhn Poker Monte Carlo CFR Solver

// Constants
const PASS = 0;
const BET = 1;
const NUM_ACTIONS = 2;
const NUM_CARDS = 3;

class KuhnPokerCFR {
    constructor() {
        this.nodeMap = new Map();
    }

    // Get information set
    getInfoSet(history, card) {
        const infoSet = card + history;
        if (!this.nodeMap.has(infoSet)) {
            this.nodeMap.set(infoSet, new Node(NUM_ACTIONS));
        }
        return this.nodeMap.get(infoSet);
    }

    // Calculate strategy
    getStrategy(realizationWeight, node) {
        const strategy = new Array(NUM_ACTIONS).fill(0);
        let normalizingSum = 0;

        for (let a = 0; a < NUM_ACTIONS; a++) {
            strategy[a] = node.regretSum[a] > 0 ? node.regretSum[a] : 0;
            normalizingSum += strategy[a];
        }

        for (let a = 0; a < NUM_ACTIONS; a++) {
            if (normalizingSum > 0) {
                strategy[a] /= normalizingSum;
            } else {
                strategy[a] = 1.0 / NUM_ACTIONS;
            }
            node.strategy[a] += realizationWeight * strategy[a];
        }

        return strategy;
    }

    // Calculate utility for terminal states
    getUtility(history, cards) {
        const plays = history.length;
        const player = plays % 2;
        const opponent = 1 - player;

        if (plays > 1) {
            const terminalPass = history[plays - 1] === 'c';
            const doubleBet = history.substring(plays - 2) === 'bb';

            if (terminalPass) {
                if (history === 'cc') {
                    return cards[player] > cards[opponent] ? 1 : -1;
                } else {
                    return 1;
                }
            } else if (doubleBet) {
                return cards[player] > cards[opponent] ? 2 : -2;
            }
        }
        return 0;
    }

    // CFR+ implementation
    cfr(cards, history, p0, p1) {
        const plays = history.length;
        const player = plays % 2;
        const opponent = 1 - player;

        if (plays > 1) {
            const terminalUtil = this.getUtility(history, cards);
            if (terminalUtil !== 0) {
                return player === 0 ? terminalUtil : -terminalUtil;
            }
        }

        const infoSet = this.getInfoSet(history, cards[player]);
        const strategy = this.getStrategy(player === 0 ? p0 : p1, infoSet);
        const util = new Array(NUM_ACTIONS).fill(0);
        let nodeUtil = 0;

        for (let a = 0; a < NUM_ACTIONS; a++) {
            const nextHistory = history + (a === PASS ? 'c' : 'b');
            util[a] = player === 0
                ? -this.cfr(cards, nextHistory, p0 * strategy[a], p1)
                : -this.cfr(cards, nextHistory, p0, p1 * strategy[a]);
            nodeUtil += strategy[a] * util[a];
        }

        for (let a = 0; a < NUM_ACTIONS; a++) {
            const regret = util[a] - nodeUtil;
            infoSet.regretSum[a] += (player === 0 ? p1 : p0) * regret;
        }

        return nodeUtil;
    }

    // Train the CFR solver
    train(iterations) {
        const util = new Array(iterations).fill(0);
        const cards = [1, 2, 3];

        for (let i = 0; i < iterations; i++) {
            this.shuffle(cards);
            util[i] = this.cfr(cards, '', 1, 1);
        }

        return util;
    }

    // Helper method to shuffle cards
    shuffle(cards) {
        for (let i = cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cards[i], cards[j]] = [cards[j], cards[i]];
        }
    }

    // Get average strategy across all information sets
    getAverageStrategy() {
        const avgStrategy = new Map();

        for (const [infoSet, node] of this.nodeMap.entries()) {
            const actionProbs = new Array(NUM_ACTIONS).fill(0);
            let normalizingSum = 0;

            for (let a = 0; a < NUM_ACTIONS; a++) {
                normalizingSum += node.strategy[a];
            }

            for (let a = 0; a < NUM_ACTIONS; a++) {
                if (normalizingSum > 0) {
                    actionProbs[a] = node.strategy[a] / normalizingSum;
                } else {
                    actionProbs[a] = 1.0 / NUM_ACTIONS;
                }
            }

            avgStrategy.set(infoSet, actionProbs);
        }

        return avgStrategy;
    }
}

class Node {
    constructor(numActions) {
        this.regretSum = new Array(numActions).fill(0);
        this.strategy = new Array(numActions).fill(0);
    }
}

// Usage example
const cfr = new KuhnPokerCFR();
const iterations = 1000000;
const utilitySum = cfr.train(iterations);

console.log("Average game value:", utilitySum.reduce((a, b) => a + b) / iterations);

const avgStrategy = cfr.getAverageStrategy();
console.log("Average strategy:", avgStrategy);
// for (const [infoSet, actionProbs] of avgStrategy.entries()) {
//     console.log("Info set:", infoSet);
//     console.log("Action probabilities:", actionProbs.map(prob => prob.toFixed(4)).join(", "));
// }