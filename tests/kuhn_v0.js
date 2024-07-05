const PASS = 0
const BET = 1
const ACTIONS = {
  0: 'p',
  1: 'b',
  2: 'c'
}
const NUM_ACTIONS = Object.keys(ACTIONS).length;
const CARDS = {
  1: 'J',
  2: 'Q',
  3: 'K',
  4: 'A'
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
    const cards = [1, 2, 3, 4, 1, 2, 3, 4];
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
        } else if (index === 2) {
          return `c: ${value}`;
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

  getPayoff(roundsHistory) {
    const opponentHistories = [];

    for (let h = 0; h < roundsHistory.length; h++) {
      const historyRaw = roundsHistory[h];
      let history = historyRaw.replace(/b{5}/g, 'bbbbc'); // 'bbbbb' => 'bbbbc'
      history = history.replace(/b{2,}/g, (match) => {  return 'b' + 'r'.repeat(match.length - 1); }) // 'bb' => 'br', 'bbb' => 'brr', 'bbbb' => 'brrr
      history = !/b/.test(history) ? history.replace(/c/g, 'p') : history // 'cc' => 'pp'
      history = history.charAt(0) === 'c' ? 'p' + history.slice(1) : history // 'cp' => 'pp' || 'cbbbb' => 'pbbbb'

      const historyLengthIsEven = history.length % 2 === 0;
      if (historyLengthIsEven === true) {
        let result = history.split('').filter((char, index) => index % 2 !== 0).join('');
        opponentHistories.push(result); 
      } else {
        let result = history.split('').filter((char, index) => index % 2 === 0).join('');
        opponentHistories.push(result); 
      }
    }

    const opponentHistory = opponentHistories.join('');
    const opponentBetCount = opponentHistory.replace(/[^b]/g, '').length;
    const opponentRaiseCount = opponentHistory.replace(/[^r]/g, '').length;
    const opponentCallCount = opponentHistory.replace(/[^c]/g, '').length;
    const opponentAnte = 1;
    const betUnit = 1;
    const raiseUnit = 2;
    const callUnit = 1;
    const payoff = (opponentBetCount * betUnit) + (opponentRaiseCount * raiseUnit) + (opponentCallCount * callUnit) + (opponentAnte);
    return payoff;
  }

  cfr(cards, history, p0, p1) {
    const roundsHistory = history.split('_');
    const roundNumber = roundsHistory.length;
    const roundHistory = roundsHistory.slice(-1)[0] || '';
    let plays = roundHistory.length;
    let player = plays % 2;
    let opponent = 1 - player;
    let infoSet = cards[player] + history;

    if (plays >= 2) {
      const payoff = this.getPayoff(roundsHistory);

      let fold = roundHistory.slice(-2) === 'bp';
      let check = roundHistory.slice(-2) === 'pp';
      let check2 = roundHistory.slice(-2) === 'cc';
      let check3 = roundHistory.slice(-2) === 'pc';
      let check4 = roundHistory.slice(-2) === 'cp';
      let call = roundHistory.slice(-2) === 'bc';
      let bets = roundHistory.slice(-5) === 'bbbbb';
      let isPlayerCardHigher = cards[player] > cards[opponent];
      let isOpponentCardHigher = cards[player] < cards[opponent];

      if (fold) {
        return payoff;
      }

      if (check || check2 || check3 || check4 || call || bets) {
          history += '_';
          if (roundNumber == 1) {
            return isPlayerCardHigher ? payoff : (isOpponentCardHigher ? -payoff : 0);
          }
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