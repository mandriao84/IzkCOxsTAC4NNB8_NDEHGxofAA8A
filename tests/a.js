const DECK = {
    1: '2s', 2: '3s', 3: '4s', 4: '5s', 5: '6s', 6: '7s', 7: '8s', 8: '9s', 9: 'Ts', 10: 'Js', 11: 'Qs', 12: 'Ks', 13: 'As',
    14: '2h', 15: '3h', 16: '4h', 17: '5h', 18: '6h', 19: '7h', 20: '8h', 21: '9h', 22: 'Th', 23: 'Jh', 24: 'Qh', 25: 'Kh', 26: 'Ah',
    27: '2d', 28: '3d', 29: '4d', 30: '5d', 31: '6d', 32: '7d', 33: '8d', 34: '9d', 35: 'Td', 36: 'Jd', 37: 'Qd', 38: 'Kd', 39: 'Ad',
    40: '2c', 41: '3c', 42: '4c', 43: '5c', 44: '6c', 45: '7c', 46: '8c', 47: '9c', 48: 'Tc', 49: 'Jc', 50: 'Qc', 51: 'Kc', 52: 'Ac'
  };
  const CARDS = { 'A': 13, 'K': 12, 'Q': 11, 'J': 10, 'T': 9, '9': 8, '8': 7, '7': 6, '6': 5, '5': 4, '4': 3, '3': 2, '2': 1 };

function getLoserByHandRanksValue(playerHandRanks, opponentHandRanks) {
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

let player = ['A', 'A', '9', 'Q', 'Q'];
let opponent = ['A', 'A', 'Q', 'A', 'T'];

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

  const a = getSameCards(player);
  const b = getSameCards(opponent);
  console.log(a, a.length, b, b.length)
  const aa = a.map(r => r.split('_')[0]);
  const bb = b.map(r => r.split('_')[0]);
  const result = getLoserByHandRanksValue(aa, bb);
  console.log(aa, bb)
  console.log(result)