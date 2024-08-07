const ACTIONS = {
  0: 'p',
  1: 'b',
  2: 'c'
}
const NUM_ACTIONS = Object.keys(ACTIONS).length;
const DECK = {
  1: '2s', 2: '3s', 3: '4s', 4: '5s', 5: '6s', 6: '7s', 7: '8s', 8: '9s', 9: 'Ts', 10: 'Js', 11: 'Qs', 12: 'Ks', 13: 'As',
  14: '2h', 15: '3h', 16: '4h', 17: '5h', 18: '6h', 19: '7h', 20: '8h', 21: '9h', 22: 'Th', 23: 'Jh', 24: 'Qh', 25: 'Kh', 26: 'Ah',
  27: '2d', 28: '3d', 29: '4d', 30: '5d', 31: '6d', 32: '7d', 33: '8d', 34: '9d', 35: 'Td', 36: 'Jd', 37: 'Qd', 38: 'Kd', 39: 'Ad',
  40: '2c', 41: '3c', 42: '4c', 43: '5c', 44: '6c', 45: '7c', 46: '8c', 47: '9c', 48: 'Tc', 49: 'Jc', 50: 'Qc', 51: 'Kc', 52: 'Ac'
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
    const DECK = [52, 51, 50, 49, 26, 25, 24, 23];
    let util = 0;

    for (let i = 0; i < iterations; i++) {
      // const deck = [...Object.keys(DECK)];
      const deck = [...DECK];
      const hands = this.deal(deck, 2, 1);
      util += this.cfr(hands, "", 1, 1);
    }

    // console.log(`Average game value: ${util / iterations}`);
    this.nodeMap.forEach(node => {
      const infoSet = node.infoSet;
      const card = infoSet.charAt(0)
      const plays = infoSet.slice(2); // remove the card + ':'
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

  shuffle(deck) {
    for (let c1 = deck.length - 1; c1 > 0; c1--) {
      let c2 = Math.floor(Math.random() * (c1 + 1));
      let tmp = deck[c1];
      deck[c1] = deck[c2];
      deck[c2] = tmp;
    }
  }

  deal(deck, playersNumber, cardsNumberPerPlayer) {
    this.shuffle(deck);
    const players = Array.from({ "length": playersNumber }, () => []);
  
    for (let i = 0; i < cardsNumberPerPlayer; i++) {
      for (let j = 0; j < playersNumber; j++) {
        players[j].push(deck.pop());
      }
    }
  
    return players;
  }

  getPayoff(roundsHistory) {
    const opponentHistories = [];

    for (let h = 0; h < roundsHistory.length; h++) {
      const historyRaw = roundsHistory[h];
      let history = historyRaw.replace(/b{5}/g, 'bbbbc'); // 'bbbbb' => 'bbbbc'
      history = history.replace(/b{2,}/g, (match) => { return 'b' + 'r'.repeat(match.length - 1); }) // 'bb' => 'br', 'bbb' => 'brr', 'bbbb' => 'brrr
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

  getHandTranslated(hand) {
    return hand.map(i => DECK[i]);
  }

  getHistoryTranslated(roundHistory) {
    let result = roundHistory
    result = !/b/.test(result) ? result.replace(/c/g, 'p') : result; // 'c...' => 'p...' || 'cc' => 'pp'
    result = result.replace(/b{5}/g, 'bbbbc'); // 'bbbbb' => 'bbbbc'
    return result;
  }

  getWinner(playerHand, opponentHand) {
    const CARDS_VALUE = {
      'A': 13, 'K': 12, 'Q': 11, 'J': 10, 'T': 9, '9': 8, '8': 7, '7': 6, '6': 5, '5': 4, '4': 3, '3': 2, '2': 1
    };
    const playerHandTranslated = this.getHandTranslated(playerHand).join('').slice(0, 1);
    const playerHandValue = CARDS_VALUE[playerHandTranslated];
    const opponentHandTranslated = this.getHandTranslated(opponentHand).join('').slice(0, 1);
    const opponentHandValue = CARDS_VALUE[opponentHandTranslated];
    return playerHandValue > opponentHandValue ? 'PLAYER' : (playerHandValue < opponentHandValue ? 'OPPONENT' : 'NONE');
  }

  cfr(hands, history, p0, p1) {
    const roundsHistory = history.split('_');
    const roundNumber = roundsHistory.length;
    const roundHistory = roundsHistory.slice(-1)[0] || '';
    let plays = roundHistory.length;
    let player = plays % 2;
    let opponent = 1 - player;
    let infoSet = this.getHandTranslated(hands[player]).join('').slice(0, 1) + ':' + history;

    if (plays >= 2) {
      let fold = roundHistory.slice(-2) === 'bp';
      let check = roundHistory.slice(-2) === 'pp';
      let check2 = roundHistory.slice(-2) === 'cc';
      let check3 = roundHistory.slice(-2) === 'pc';
      let check4 = roundHistory.slice(-2) === 'cp';
      let call = roundHistory.slice(-2) === 'bc';
      let bets = roundHistory.slice(-5) === 'bbbbb';

      if (fold) {
        const payoff = this.getPayoff(roundsHistory);
        return payoff;
      }

      if (check || check2 || check3 || check4 || call || bets) {
          history += '_';
          if (roundNumber == 1) {
            const payoff = this.getPayoff(roundsHistory);
            const winner = this.getWinner(hands[player], hands[opponent]);
            return winner === 'PLAYER' ? payoff : (winner === 'OPPONENT' ? -payoff : 0);
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
        // let nextHistory = history + ACTIONS[a];
        let nextHistory = this.getHistoryTranslated(history + ACTIONS[a]);
        util[a] = player === 0
            ? -this.cfr(hands, nextHistory, p0 * strategy[a], p1)
            : -this.cfr(hands, nextHistory, p0, p1 * strategy[a]);
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
  const iterations = 1000;
  const trainer = new Solver();
  trainer.train(iterations);
}

main();
