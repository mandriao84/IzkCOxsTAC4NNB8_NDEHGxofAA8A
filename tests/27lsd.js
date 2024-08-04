const fs = require('fs');
const path = require('path');

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
const CARDS = { 'A': 13, 'K': 12, 'Q': 11, 'J': 10, 'T': 9, '9': 8, '8': 7, '7': 6, '6': 5, '5': 4, '4': 3, '3': 2, '2': 1 };

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

  train(iterations, directory = '.results') {
    const saveInterval = 100000;
    let util = 0;

    if (fs.existsSync(directory)) {
      this.load(directory);
    }

    for (let i = 0; i < iterations; i++) {
      const deck = [...Object.keys(DECK)];
      const hands = this.deal(deck, 2, 5);
      util += this.cfr(hands, "", 1, 1);

      if ((i + 1) % saveInterval === 0) {
        this.save(directory);
        console.log(`saved at iteration ${i + 1}`);
      }
    }

    if (iterations < saveInterval) {
      this.save(directory);
      console.log(`saved at iteration ${i + 1}`);
    }

    // console.log(`Average game value: ${util / iterations}`);
    // this.nodeMap.forEach(node => {
    //   const infoSet = node.infoSet;
    //   const hand = infoSet.slice(0, 14);
    //   const plays = infoSet.slice(15); // remove the card + ':'
    //   const strategy = node.strategy.map((value, index) => {
    //     if (index === 0) {
    //       return `p: ${value}`;
    //     } else if (index === 1) {
    //       return `b: ${value}`;
    //     } else if (index === 2) {
    //       return `c: ${value}`;
    //     }
    //   }).join('\t');
    //   console.log(`${hand}\t${plays.length === 0 ? ' ' : plays}\t|\t${strategy}`);
    // });
  }

  load(directory) {
    this.nodeMap.clear();
    const files = fs.readdirSync(directory);

    for (const file of files) {
      if (path.extname(file) === '.json') {
        const data = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
        for (const [key, value] of data) {
          this.nodeMap.set(key, Object.assign(new Node(), value));
        }
      }
    }
  }

  save(directory) {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory);
    }

    const CHUNK_SIZE = 1000000; // Adjust this value based on your needs
    let chunk = [];
    let chunkIndex = 0;

    for (const [key, value] of this.nodeMap.entries()) {
      chunk.push([key, value]);

      if (chunk.length === CHUNK_SIZE) {
        fs.writeFileSync(path.join(directory, `chunk_${chunkIndex}.json`), JSON.stringify(chunk));
        chunk = [];
        chunkIndex++;
      }
    }

    if (chunk.length > 0) {
      fs.writeFileSync(path.join(directory, `chunk_${chunkIndex}.json`), JSON.stringify(chunk));
    }
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

  getPot(history) {
    const betCount = history.replace(/[^b]/g, '').length;
    const raiseCount = history.replace(/[^r]/g, '').length;
    const callCount = history.replace(/[^c]/g, '').length;
    const histories = history.split('_');

    const ante = 2;
    let betUnit = 1;
    let raiseUnit = 2;
    let callUnit = 1;

    if (histories.length > 2) {
      betUnit *= 2;
      raiseUnit *= 2;
      callUnit *= 2;
    }

    const pot = (betCount * betUnit) + (raiseCount * raiseUnit) + (callCount * callUnit) + (ante);
    return pot;
  }

  getPotOdds(betUnit, pot) {
    return betUnit / (betUnit + pot);
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
    const handTranslated = hand.map(i => DECK[i]);
    const handTranslatedSorted = handTranslated.sort((a, b) => {
      const c1 = CARDS[a[0]];
      const c2 = CARDS[b[0]];
      return c1 - c2;
    });

    return handTranslatedSorted.map(r => r.slice(0, 1) + 'x') // temporary for bypassing flush
  }

  getHistoryTranslated(history) {
    const roundsHistory = history.split('_');
    let roundHistory = roundsHistory.slice(-1)[0] || '';
    roundHistory = !/b/.test(roundHistory) ? roundHistory.replace(/c/g, 'p') : roundHistory; // 'c...' => 'p...' || 'cc' => 'pp'
    roundHistory = roundHistory.replace(/(?<=r)b/g, 'r'); // 'pbb...' => 'pbr...' || 'bbb' => 'brr'
    roundHistory = roundHistory.replace(/b{2,}/g, (match) => { return 'b' + 'r'.repeat(match.length - 1); }) // 'bb' => 'br', 'bbb' => 'brr', 'bbbb' => 'brrr
    roundHistory = roundHistory.replace(/r{4}/g, 'rrrc'); // 'brrrr' => 'brrrc' || 'pbrrrr' => 'pbrrrc'
    roundsHistory[roundsHistory.length - 1] = roundHistory;
    let result = roundsHistory.join('_');
    return result;
  }

  getWinner(playerHand, opponentHand) {
    function getSameCards(handRanks) {
      const cardCounts = handRanks.reduce((acc, card) => {
        acc[card] = (acc[card] || 0) + 1;
        return acc;
      }, {});

      const cardCountsAsArray = Object.entries(cardCounts);

      cardCountsAsArray.sort((a, b) => {
        if (b[1] !== a[1]) {
          return b[1] - a[1]; // by count (descending)
        } else {
          return CARDS[b[0]] - CARDS[a[0]]; // by value (descending)
        }
      });

      const result = cardCountsAsArray.map(([card, count]) => {
        return count > 1 ? `${card}_${count}` : card;
      });

      return result;
    }

    function hasNotSame(handRanks) {
      const ranksUniq = new Set(handRanks)
      return ranksUniq.size == handRanks.length;
    }

    function isStraightByHandRanksValueSorted(handRanksValueSorted) {
      for (let i = 1; i < handRanksValueSorted.length; i++) {
        if (handRanksValueSorted[i] !== handRanksValueSorted[i - 1] + 1) {
          return false;
        }
      }
      return true;
    }

    function isNotStraight(handRanks) {
      const handRanksValue = handRanks.map(r => CARDS[r]);
      const handRanksValueSorted = handRanksValue.sort((a, b) => a - b);
      const isStraightWithAceHigh = isStraightByHandRanksValueSorted(handRanksValueSorted);

      if (handRanks.includes('A')) {
        const handRanksValueWithAceLow = handRanksValue.map(v => (v === 13 ? 0 : v));
        const handRanksValueWithAceLowSorted = handRanksValueWithAceLow.sort((a, b) => a - b);
        const isStraightWithAceLow = isStraightByHandRanksValueSorted(handRanksValueWithAceLowSorted);
        return !(isStraightWithAceLow || isStraightWithAceHigh);
      } else {
        return !isStraightWithAceHigh;
      }
    }

    function isNotFlush(handSuits) {
      const suitsUniq = new Set(handSuits)
      return suitsUniq.size >= 2;
    }

    function getLoserByHandRanks(playerHandRanks, opponentHandRanks) {
      const playerHandRanksValue = playerHandRanks.map(r => CARDS[r]);
      const playerHandRanksValueSorted = playerHandRanksValue.sort((a, b) => b - a);
      const opponentHandRanksValue = opponentHandRanks.map(r => CARDS[r]);
      const opponentHandRanksValueSorted = opponentHandRanksValue.sort((a, b) => b - a);

      for (let i = 0; i < playerHandRanksValueSorted.length; i++) {
        const player = playerHandRanksValueSorted[i];
        const opponent = opponentHandRanksValueSorted[i];
        if (player !== opponent) {
          if (player > opponent) {
            return 'PLAYER' // { "hand": playerHandRanks, "loser": 'PLAYER' };
          } else {
            return 'OPPONENT' // { "hand": opponentHandRanks, "loser": 'OPPONENT' };
          }
        }
      }

      return null;
    }

    const playerHandTranslated = this.getHandTranslated(playerHand);
    // const playerHandSuits = playerHandTranslated.map(h => h.slice(-1));
    const playerHandRanks = playerHandTranslated.map(h => h.slice(0, -1));
    const playerHandHasNotSame = hasNotSame(playerHandRanks);

    const opponentHandTranslated = this.getHandTranslated(opponentHand);
    // const opponentHandSuits = opponentHandTranslated.map(h => h.slice(-1));
    const opponentHandRanks = opponentHandTranslated.map(h => h.slice(0, -1));
    const opponentHandHasNotSame = hasNotSame(opponentHandRanks);

    if (playerHandHasNotSame === false && opponentHandHasNotSame === false) {
      const playerHandRanksSortedByDuplicates = getSameCards(playerHandRanks); // [ 'K_2', 'J_2', 'A' ]
      const opponentHandRanksSortedByDuplicates = getSameCards(opponentHandRanks); // [ 'K_2', 'J_2', 'A' ]
      const playerHandMaxDuplicateNumber = Math.max(...playerHandRanksSortedByDuplicates.map(r => Number(r.split('_')[1] || 1)));
      const opponentHandMaxDuplicateNumber = Math.max(...opponentHandRanksSortedByDuplicates.map(r => Number(r.split('_')[1] || 1)));
      let result = '';

      if ( // ['A_2', ... ] vs [ 'K_3', ... ]
        playerHandMaxDuplicateNumber < opponentHandMaxDuplicateNumber
      ) {
        result = 'PLAYER';
      }

      if ( // [ 'K_3', ... ] vs [ 'A_2', ... ]
        playerHandMaxDuplicateNumber > opponentHandMaxDuplicateNumber
      ) {
        result = 'OPPONENT';
      }

      if ( // [ 'K_3', 'A', 'J' ].length === 3 vs [ 'A_3', Q_2].length === 2
        playerHandMaxDuplicateNumber === opponentHandMaxDuplicateNumber &&
        playerHandRanksSortedByDuplicates.length > opponentHandRanksSortedByDuplicates.length
      ) {
        result = 'PLAYER';
      }

      if ( // [ 'A_3', 'Q_2'].length === 2 vs [ 'K_3', 'A', 'J' ].length === 3
        playerHandMaxDuplicateNumber === opponentHandMaxDuplicateNumber &&
        playerHandRanksSortedByDuplicates.length < opponentHandRanksSortedByDuplicates.length
      ) {
        result = 'OPPONENT';
      }

      if ( // [ 'A_3', 'Q_2'] vs [ 'K_3', 'J_2']
        playerHandMaxDuplicateNumber === opponentHandMaxDuplicateNumber &&
        playerHandRanksSortedByDuplicates.length === opponentHandRanksSortedByDuplicates.length
      ) {
        const playerHandRanksSortedByDuplicatesAndFlattened = playerHandRanksSortedByDuplicates.map(r => { 
          const sub = r.split('_')
          // return sub.length > 1 ? sub[0] : null
          return sub[0]
        })
        const playerHandValuesSortedByDuplicatesAndFlattened = playerHandRanksSortedByDuplicatesAndFlattened.map(r => CARDS[r])
        // console.log(playerHandRanksSortedByDuplicates, playerHandRanksSortedByDuplicatesAndFlattened, playerHandValuesSortedByDuplicatesAndFlattened)
        
        const opponentHandRanksSortedByDuplicatesAndFlattened = opponentHandRanksSortedByDuplicates.map(r => { 
          const sub = r.split('_')
          return sub[0]
        })
        const opponentHandValuesSortedByDuplicatesAndFlattened = opponentHandRanksSortedByDuplicatesAndFlattened.map(r => CARDS[r])
        // console.log(opponentHandRanksSortedByDuplicates, opponentHandRanksSortedByDuplicatesAndFlattened, opponentHandValuesSortedByDuplicatesAndFlattened)

        for (let i = 0; i < playerHandValuesSortedByDuplicatesAndFlattened.length; i++) {
          const playerCard = playerHandValuesSortedByDuplicatesAndFlattened[i];
          const opponentCard = opponentHandValuesSortedByDuplicatesAndFlattened[i];
          if (playerCard > opponentCard) {
            result = 'OPPONENT';
            break;
          } else if (playerCard < opponentCard) {
            result = 'PLAYER';
            break;
          } else {
            result = 'NONE';
            continue;
          }
        }
      }

      // console.log("____", playerHandTranslated, opponentHandTranslated, result)
      return result;
    }

    if (playerHandHasNotSame === true && opponentHandHasNotSame === false) {
      const playerHandRanksValue = playerHandRanks.map(r => CARDS[r]);
      // const playerHandIsNotFlush = isNotFlush(playerHandSuits);
      const playerHandIsNotStraight = isNotStraight(playerHandRanksValue);
      const opponentHandRanksSortedByDuplicates = getSameCards(opponentHandRanks); // [ 'K_2', 'J_2', 'A' ]
      let result = ''

      if (opponentHandRanksSortedByDuplicates.length <= 2) { // need to check for straight flush
        result = 'PLAYER';
      } else {
        if (playerHandIsNotStraight === false/* || playerHandIsNotFlush === false */) {
          result = 'OPPONENT';
        } else {
          result = 'PLAYER';
        }
      }

      // console.log(playerHandTranslated, opponentHandTranslated, result)
      return result;
    }

    if (playerHandHasNotSame === false && opponentHandHasNotSame === true) {
      const opponentHandRanksValue = opponentHandRanks.map(r => CARDS[r]);
      // const opponentHandIsNotFlush = isNotFlush(opponentHandSuits);
      const opponentHandIsNotStraight = isNotStraight(opponentHandRanksValue);
      const playerHandRanksSortedByDuplicates = getSameCards(playerHandRanks); // [ 'K_2', 'J_2', 'A' ]
      let result = ''

      if (playerHandRanksSortedByDuplicates.length <= 2) { // need to check for straight flush
        result = 'OPPONENT';
      } else {
        if (opponentHandIsNotStraight === false/* || opponentHandIsNotFlush === false */) {
          result = 'PLAYER';
        } else {
          result = 'OPPONENT';
        }
      }

      // console.log(playerHandTranslated, opponentHandTranslated, result)
      return result;
    }

    if (playerHandHasNotSame === true && opponentHandHasNotSame === true) {
      const playerHandRanksValue = playerHandRanks.map(r => CARDS[r]);
      const opponentHandRanksValue = opponentHandRanks.map(r => CARDS[r]);
      // const playerHandIsNotFlush = isNotFlush(playerHandSuits);
      // const opponentHandIsNotFlush = isNotFlush(opponentHandSuits);
      const playerHandIsNotStraight = isNotStraight(playerHandRanksValue);
      const opponentHandIsNotStraight = isNotStraight(opponentHandRanksValue);

      // if (playerHandIsNotFlush === false && opponentHandIsNotFlush === false) { 
      //   const loser = getLoserByHandRanks(playerHandRanks, opponentHandRanks);
      //   return loser === 'OPPONENT' ? 'PLAYER' : (loser === 'PLAYER' ? 'OPPONENT' : 'NONE');
      // }

      if (playerHandIsNotStraight === false && opponentHandIsNotStraight === false) {
        const loser = getLoserByHandRanks(playerHandRanks, opponentHandRanks);
        return loser === 'OPPONENT' ? 'PLAYER' : (loser === 'PLAYER' ? 'OPPONENT' : 'NONE');
      }

      // if (playerHandIsNotFlush === true && opponentHandIsNotFlush === false) { 
      //   return 'PLAYER';
      // }

      // if (playerHandIsNotFlush === false && opponentHandIsNotFlush === true) { 
      //   return 'OPPONENT';
      // }

      if (playerHandIsNotStraight === true && opponentHandIsNotStraight === false) {
        return 'PLAYER';
      }

      if (playerHandIsNotStraight === false && opponentHandIsNotStraight === true) {
        return 'OPPONENT';
      }

      if (
        playerHandIsNotStraight === true
        // && playerHandIsNotFlush === true
        && opponentHandIsNotStraight === true
        // && opponentHandIsNotFlush === true
      ) {
        const loser = getLoserByHandRanks(playerHandRanks, opponentHandRanks);
        return loser === 'OPPONENT' ? 'PLAYER' : (loser === 'PLAYER' ? 'OPPONENT' : 'NONE');
      }
    }

    throw new Error('getWinner.caseMissing');
  }

  cfr(hands, history, p0, p1) {
    const roundsHistory = history.split('_');
    const roundNumber = roundsHistory.length;
    const roundHistory = roundsHistory.slice(-1)[0] || '';
    let plays = roundHistory.length;
    let player = plays % 2;
    let opponent = 1 - player;
    let infoSet = this.getHandTranslated(hands[player]).join('-').slice(0, 14) + ':' + history;
    // const chipUnit = roundsHistory.length > 2 ? 2 : 1;
    const pot = this.getPot(history);
    // console.log(infoSet, pot)

    if (plays >= 2) {
      let fold = roundHistory.slice(-2) === 'bp';
      let fold2 = roundHistory.slice(-2) === 'rp';
      let check = roundHistory.slice(-2) === 'pp';
      let call = roundHistory.slice(-2) === 'bc';
      let call2 = roundHistory.slice(-2) === 'rc';

      if (fold || fold2) {
        // const payoff = this.getPayoff(roundsHistory);
        // return payoff;
        return player === 0 ? pot : -pot;
      }

      if (check || call || call2) {
        history += '_';
        if (roundNumber == 1) {
          // const payoff = this.getPayoff(roundsHistory);
          const winner = this.getWinner(hands[player], hands[opponent]);
          if (player === 0) {
            return winner === 'PLAYER' ? pot : (winner === 'OPPONENT' ? -pot : 0);
          } else {
            return winner === 'OPPONENT' ? pot : (winner === 'PLAYER' ? -pot : 0);
          }
        }
      }
    }

    if (!this.nodeMap.has(infoSet)) {
      this.nodeMap.set(infoSet, new Node());
      this.nodeMap.get(infoSet).infoSet = infoSet;
    }

    let node = this.nodeMap.get(infoSet);
    // let nodePrev = this.nodeMap.get(infoSet.slice(0, -1));
    // if (nodePrev?.strategy[0] === 1) {
    //   node.strategy = [1, 0, 0];
    //   console.log(nodePrev, node)
    //   return;
    // }

    let strategy = node.getStrategy(player === 0 ? p0 : p1);
    let util = new Array(NUM_ACTIONS).fill(0);
    let nodeUtil = 0;

    for (let a = 0; a < NUM_ACTIONS; a++) {
      let nextHistory = this.getHistoryTranslated(history + ACTIONS[a])
      // console.log(history === "" ? "_" : history, nextHistory)
      // if (ACTIONS[a] === 'b' || ACTIONS[a] === 'c') { 
      // }

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
  const iterations = 1; //1000000000;
  const trainer = new Solver();
  trainer.train(iterations);
  // trainer.load('.results');
  // trainer.nodeMap.forEach(node => {
  //   const infoSet = node.infoSet;
  // });
  // console.log(trainer.nodeMap.map(node => node.infoSet);
}

main();
