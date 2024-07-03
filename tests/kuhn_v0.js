const PASS = 0
const BET = 1
const ACTIONS = {
  0: 'p',
  1: 'b'
}
const NUM_ACTIONS = Object.keys(ACTIONS).length;
const CARDS = {
  1: 'J',
  2: 'Q',
  3: 'K'
};

class Node {
  constructor() {
    this.infoSet = '';
    this.regretSum = new Array(NUM_ACTIONS).fill(0);
    this.strategy = new Array(NUM_ACTIONS).fill(0);
    this.strategySum = new Array(NUM_ACTIONS).fill(0);
  }

  getRandomInt(max) {
    return Math.floor(Math.random() * max);
  }

  getStrategy(realizationWeight) {
    let normalizingSum = 0;
    for (let a = 0; a < NUM_ACTIONS; a++) {
      this.strategy[a] = this.regretSum[a] > 0 ? this.regretSum[a] : 0;
      normalizingSum += this.strategy[a];
    }

    for (let a = 0; a < NUM_ACTIONS; a++) {
      if (normalizingSum > 0) {
        this.strategy[a] /= normalizingSum;
      } else {
        this.strategy[a] = 1.0 / NUM_ACTIONS;
      }
      this.strategySum[a] += realizationWeight * this.strategy[a];
    }

    return this.strategy;
  }

  getAverageStrategy() {
    let avgStrategy = new Array(NUM_ACTIONS).fill(0);
    let normalizingSum = 0;

    for (let a = 0; a < NUM_ACTIONS; a++) {
      normalizingSum += this.strategySum[a];
    }

    // Calculate the average strategy
    for (let a = 0; a < NUM_ACTIONS; a++) {
      if (normalizingSum > 0) {
        avgStrategy[a] = this.strategySum[a] / normalizingSum;
      } else {
        avgStrategy[a] = 1.0 / NUM_ACTIONS;
      }
    }

    return avgStrategy;
  }

  toString() {
    return `${this.infoSet.padEnd(4)}: ${JSON.stringify(this.getAverageStrategy())}`;
  }
}

class Solver {
  constructor() {
    this.nodeMap = new Map();
  }

  train(iterations) {
    const cards = [1, 2, 3, 1, 2, 3];
    let util = 0;

    for (let i = 0; i < iterations; i++) {
      this.shuffle(cards);
      util += this.cfr(cards, "", 1, 1);
    }

    // console.log(`Average game value: ${util / iterations}`);
    this.nodeMap.forEach(node => {
      const infoSet = node.infoSet;
      const card = CARDS[infoSet.charAt(0)];
      const plays = infoSet.slice(1);
      const strategy = node.strategy.map((value, index) => {
        if (index === 0) {
          return `p: ${value}`;
        } else if (index === 1) {
          return `b: ${value}`;
        }
      }).join(' | ');
      console.log(`${card}${plays} || ${strategy}`);
    });
  }

  shuffle(cards) {
    for (let c1 = cards.length - 1; c1 > 0; c1--) {
      let c2 = Math.floor(Math.random() * (c1 + 1));
      let tmp = cards[c1];
      cards[c1] = cards[c2];
      cards[c2] = tmp;
    }
  }

  getOpponentHistory(history) {
    const historyLengthIsEven = history.length % 2 === 0;
    if (historyLengthIsEven) {
      return history.split('').filter((char, index) => index % 2 !== 0).join('');
    } else {
      return history.split('').filter((char, index) => index % 2 === 0).join('');
    }
  }

  cfr(cards, history, p0, p1) {
    let plays = history.length;
    let player = plays % 2;
    let opponent = 1 - player;
    let infoSet = cards[player] + history;

    if (plays >= 2) {
      const opponentHistory = this.getOpponentHistory(history);
      const opponentBetCount = opponentHistory.replace(/[^b]/g, '').length;
      const opponentAnte = 1;
      const betUnit = 1
      const payoff = (opponentBetCount * betUnit) + (opponentAnte);

      let terminalPass = history.slice(-1) === 'p';
      let doubleBet = history.slice(-2) === 'bb';
      let doublePass = history.slice(-2) === 'pp';
      let fold = history.slice(-2) === 'bp';
      let maxBet = history.slice(-4) === 'bbbb';
      let isPlayerCardHigher = cards[player] > cards[opponent];
      let isOpponentCardHigher = cards[player] < cards[opponent];

      if (fold) {
        return payoff;
      }

      if (doublePass || maxBet) {
        return isPlayerCardHigher ? payoff : (isOpponentCardHigher ? -payoff : 0);
      }
    }

    if (!this.nodeMap.has(infoSet)) {
      this.nodeMap.set(infoSet, new Node());
      this.nodeMap.get(infoSet).infoSet = infoSet;
    }

    let node = this.nodeMap.get(infoSet);
    let strategy = node.getStrategy(player === 0 ? p0 : p1);
    let util = new Array(NUM_ACTIONS).fill(0);
    let nodeUtil = 0;

    for (let a = 0; a < NUM_ACTIONS; a++) {
        let nextHistory = history + ACTIONS[a];
        util[a] = player === 0
            ? -this.cfr(cards, nextHistory, p0 * strategy[a], p1)
            : -this.cfr(cards, nextHistory, p0, p1 * strategy[a]);
        nodeUtil += strategy[a] * util[a];
    }

    for (let a = 0; a < NUM_ACTIONS; a++) {
      let regret = util[a] - nodeUtil;
      node.regretSum[a] += (player === 0 ? p1 : p0) * regret;
    }

    return nodeUtil;
  }
}

function main() {
  const iterations = 1000000;
  const trainer = new Solver();
  trainer.train(iterations);
}

main();