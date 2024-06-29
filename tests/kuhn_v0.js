// You are an expert in solving Kuhn poker using Regression-CFR in Node.js
// Rules of the game :
// - Players Number : 2
// - Cards : 12 cards including [King, Queen, Jack] of [Diamond, Spade, Club, Heart]
// - Actions : [check, bet, raise, call, fold]
// examples of a full round of game :
// - players are dealt with one card, player1 check, player2 check >> showdown >> see which player card wins
// - players are dealt with one card, player1 check, player2 bet, player1 fold >> player2 automatically wins
// - players are dealt with one card, player1 check, player2 bet, player1 call >> showdown >> see which player card wins
// - players are dealt with one card, player1 bet, player2 fold >> player1 automatically wins
// - players are dealt with one card, player1 bet, player2 call >> showdown >> see which player card wins
// Your base solution is the code below
// You're always focused on the relevant part of the code
// Now examine carefully the code and tell me where i'm wrong and/or what am i missing
// Don't bother about unit testing or error handling

const ACTIONS = ['check', 'bet', 'call', 'fold'];

class KuhnPokerSolver {
    constructor() {
        this.suits = ['d', 's', 'c', 'h'];
        this.ranks = ['K', 'Q', 'J'];
        this.deck = [];
        this.regretSum = {};
        this.strategy = {};
        this.strategySum = {};
    }

    start() {
        this.deck = [];
        for (const suit of this.suits) {
            for (const rank of this.ranks) {
                this.deck.push({ rank, suit });
            }
        }
    }

    shuffle() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    deal() {
        this.shuffle();
        const p0 = this.deck.pop();
        const p1 = this.deck.pop();
        return [p0, p1];
    }

    cardValue(card) {
        const values = { 'K': 3, 'Q': 2, 'J': 1 };
        return values[card.rank];
    }

    initLogs(log) {
        this.regretSum[log] = {};
        this.strategy[log] = {};
        this.strategySum[log] = {};
        for (const action of ACTIONS) {
            this.regretSum[log][action] = 0;
            this.strategy[log][action] = Math.random() * 0.01;
            this.strategySum[log][action] = 0;
        }
    }

    getStrategy(log) {
        if (!(log in this.strategy)) {
            this.initLogs(log);
        }
        return this.strategy[log];
    }

    updateStrategy(log) {
        const epsilon = 1e-10;
        let normalizingSum = epsilon;
        for (const action of ACTIONS) {
            this.strategy[log][action] = Math.max(this.regretSum[log][action], 0);
            normalizingSum += this.strategy[log][action];
        }
    
        for (const action of ACTIONS) {
            if (normalizingSum > epsilon) {
                this.strategy[log][action] /= normalizingSum;
            } else {
                this.strategy[log][action] = 1 / ACTIONS.length;
            }
            this.strategySum[log][action] += this.strategy[log][action];
        }
    }

    plays(history) {
        const historyLength = history.length;

        if (historyLength === 0) {
            return ['check', 'bet'];
        }

        if (historyLength > 0) {
            const lastPlay = history[historyLength - 1]
            if (lastPlay === 'check') {
                return ['check', 'bet'];
            }
            if (lastPlay === 'bet') {
                return ['call', 'fold'];
            }
        }
    
        if (historyLength === 1) {
            if (history[0] === 'check') {
                return ['check', 'bet'];
            }
            if (history[0] === 'bet') {
                return ['call', 'fold'];
            }
        }
    
        if (historyLength === 2) {
            if (history[0] === 'check' && history[1] === 'bet') {
                return ['call', 'fold'];
            }
            if (history[0] === 'check' && history[1] === 'check') {
                return [];
            }
            if (history[0] === 'bet' && history[1] === 'call') {
                return [];
            }
            if (history[0] === 'bet' && history[1] === 'fold') {
                return [];
            }
        }
    
        if (historyLength === 3) {
            return [];
        }
    
        return [];
    }

    gameStatus(plays) {
        const rounds = ['preflop', 'flop', 'turn', 'river'];
        const lastTwoPlays = plays.slice(-2);
        let currentRound = 0;
        let currentPlays = [];
        let gameEnded = false;
        let betCount = 0;
    
        plays.forEach((play) => {
            currentPlays.push(play);

            if (play === 'bet') {
                betCount++;
            }

            if (this.isRoundEnded(currentPlays, betCount) == true) {
                if (play === 'fold' || currentRound === rounds.length - 1) {
                    gameEnded = true;
                } else {
                    currentRound++;
                    currentPlays = [];
                    betCount = 0;
                }
            }
        });
    
        return {
            "round": rounds[currentRound],
            "lastTwoPlays": lastTwoPlays,
            "end": gameEnded
        };
    }

    isRoundEnded(plays, betCount) {
        const lastTwoPlays = plays.slice(-2);
        const lastPlay = lastTwoPlays[1];
        const lastSecondPlay = lastTwoPlays[0];

        return (
            lastTwoPlays.includes('fold')
            || (lastTwoPlays.length === 2 &&
                ((lastSecondPlay === 'check' && lastPlay === 'check') ||
                (lastSecondPlay === 'bet' && lastPlay === 'call')))
            || (betCount >= 4 && lastPlay === 'call')
        );
    }

    plays2(history) {
        const historyLength = history.length;

        const lastTwoPlays = history.slice(-2);
        const lastTwoPlaysJoined = lastTwoPlays.join('');
        const lastPlay = lastTwoPlays[1];
        const lastSecondPlay = lastTwoPlays[0];

        const playOccurrences = history.reduce((a, h) => {
            a[h] = (a[h] || 0) + 1;
            return a;
        }, {});
        const checkCount = playOccurrences['check'] || 0;
        const betCount = playOccurrences['bet'] || 0;
        const callCount = playOccurrences['call'] || 0;
        const foldCount = playOccurrences['fold'] || 0;

        // start
        if (lastPlay === undefined) {
            return ['check', 'bet'];
        }

        if (lastPlay === "check" && checkCount < 3) {
            return ['check', 'bet'];
        }

        if (lastPlay === "bet") {
            return ['check', 'bet'];
        }

        if (lastPlay === "call") {
            return ['check', 'bet'];
        }

        if (lastPlay === 'fold') {
            return [];
        }





        // round 1 end, round 2 start
        if (lastTwoPlaysJoined === 'checkcheck' && historyLength <= 2) {
            return ['check', 'bet'];
        }

        if (lastTwoPlaysJoined === 'betbet') {
            return ['bet', 'fold'];
        }

        // end
        if (lastTwoPlaysJoined === 'checkcheck' && historyLength > 2) {
            return [];
        }

        // end

    
        return [];
    }
    
    update(log, action, regret) {
        if (!(log in this.regretSum)) {
            this.initLogs(log);
        }
        this.regretSum[log][action] = Math.max(this.regretSum[log][action] + regret, 0);
    }

    result() {
        const avgStrategy = {};
        for (const log in this.strategySum) {
            avgStrategy[log] = {};
            let normalizingSum = 0;
            for (const action of ACTIONS) {
                normalizingSum += this.strategySum[log][action];
            }
            if (normalizingSum > 0) {
                for (const action of ACTIONS) {
                    avgStrategy[log][action] = this.strategySum[log][action] / normalizingSum;
                }
            } else {
                for (const action of ACTIONS) {
                    avgStrategy[log][action] = 1 / ACTIONS.length;
                }
            }
        }
        return avgStrategy;
    }

    train(iterations) {
        for (let i = 0; i < iterations; i++) {
            this.start();
            const [p0_hand, p1_hand] = this.deal();
            this.cfr([], 1, 1, p0_hand, p1_hand);
        }
    }

    cfr(history, p0, p1, p0_hand, p1_hand) {
        const plays = this.plays(history);
        if (plays.length === 0) {
            return this.payoff(history, this.cardValue(p0_hand), this.cardValue(p1_hand));
        }
    
        const player = history.length % 2;
        const playerCard = player === 0 ? p0_hand : p1_hand;
    
        const log = `${playerCard.rank}:${history.join('')}`;
        let strategy = this.getStrategy(log);
        this.updateStrategy(log);
    
        let util = {};
        let nodeUtil = 0;
    
        for (const play of plays) {
            const newHistory = [...history, play];
            const playerProb = player === 0 ? p0 : p1;
            const opponentProb = player === 0 ? p1 : p0;
    
            util[play] = player === 0
                ? this.cfr(newHistory, playerProb * strategy[play], opponentProb, p0_hand, p1_hand)
                : -this.cfr(newHistory, playerProb, opponentProb * strategy[play], p0_hand, p1_hand);
    
            nodeUtil += strategy[play] * util[play];
        }
    
        for (const play of plays) {
            const regret = util[play] - nodeUtil;
            this.update(log, play, (player === 0 ? p1 : p0) * regret);
        }
    
        return nodeUtil;
    }

    payoff(history, p0_card_value, p1_card_value) {
        // if (this.plays(history).length > 0) {
        //     return 0;
        // }
    
        switch (history.join('')) {
            case 'checkcheck':
                return p0_card_value > p1_card_value ? 1 : (p0_card_value < p1_card_value ? -1 : 0);
    
            case 'betcall':
                return p0_card_value > p1_card_value ? 2 : (p0_card_value < p1_card_value ? -2 : 0);
    
            case 'betfold':
                return 1;
    
            case 'checkbetcall':
                return p0_card_value > p1_card_value ? 2 : (p0_card_value < p1_card_value ? -2 : 0);
    
            case 'checkbetfold':
                return -1;
    
            default:
                throw new Error('Invalid game history');
        }
    }
}

const solver = new KuhnPokerSolver();
solver.start();
solver.train(10000000);
const result = solver.result();
console.log('Result:', result);