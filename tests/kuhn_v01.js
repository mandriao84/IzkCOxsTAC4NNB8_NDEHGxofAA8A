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

    // plays(history) {
    //     if (history.length === 0) {
    //         return ['check', 'bet'];
    //     }
    
    //     if (history.length === 1) {
    //         if (history[0] === 'check') {
    //             return ['check', 'bet'];
    //         }
    //         if (history[0] === 'bet') {
    //             return ['call', 'fold'];
    //         }
    //     }
    
    //     if (history.length === 2) {
    //         if (history[0] === 'check' && history[1] === 'bet') {
    //             return ['call', 'fold'];
    //         }
    //         if (history[0] === 'check' && history[1] === 'check') {
    //             return [];
    //         }
    //         if (history[0] === 'bet' && history[1] === 'call') {
    //             return [];
    //         }
    //         if (history[0] === 'bet' && history[1] === 'fold') {
    //             return [];
    //         }
    //     }
    
    //     if (history.length === 3) {
    //         return [];
    //     }
    
    //     return [];
    // }

    isRoundFinished(plays) {
        if (plays.length < 2) return false;

        const lastTwo = plays.slice(-2);

        return (
            (lastTwo[0] === 'check' && lastTwo[1] === 'check') ||
            (lastTwo[0] === 'bet' && lastTwo[1] === 'call') ||
            (lastTwo[0] === 'bet' && lastTwo[1] === 'fold') ||
            (lastTwo[0] === 'check' && lastTwo[1] === 'fold')
        );
    }

    plays(history) {
        const currentPlays = history[history.length - 1]["plays"];

        if (currentPlays.length === 0) {
            return ['check', 'bet'];
        }

        if (currentPlays.length === 1) {
            if (currentPlays[0] === 'check') {
                return ['check', 'bet'];
            }
            if (currentPlays[0] === 'bet') {
                return ['call', 'fold'];
            }
        }

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
            this.cfr([{ "round": 0, "plays": [] }], 1, 1, p0_hand, p1_hand);
        }
    }

    cfr(history, p0, p1, p0_hand, p1_hand) {
        const plays = this.plays(history);
        if (plays.length === 0) {
            return this.payoff(history, this.cardValue(p0_hand), this.cardValue(p1_hand));
        }

        const player = plays.length % 2;
        const playerCard = player === 0 ? p0_hand : p1_hand;

        const currentRound = history[history.length - 1]["round"];
        console.log('history:', history, plays)
        const logPlays = history.flatMap(h => h["plays"]).join('');
        const log = `${playerCard.rank}:${currentRound}:${logPlays}`;

        let strategy = this.getStrategy(log);
        this.updateStrategy(log);

        let util = {};
        let nodeUtil = 0;

        for (const play of plays) {
            const newHistory = [...history];
            const currentHistory = newHistory[newHistory.length - 1];
            const currentHistoryPlays = [...currentHistory["plays"], play];

            if (this.isRoundFinished(currentHistoryPlays)) {
                newHistory.push({ "round": currentRound + 1, "plays": [] });
            } else {
                currentHistory["plays"] = currentHistoryPlays;
            }

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
        const allPlays = history.flatMap(h => h.plays);
        const lastRound = history[history.length - 1];
        
        if (lastRound.plays.includes('fold')) {
            return lastRound.plays.length % 2 === 1 ? 1 : -1;
        }

        if (allPlays.includes('bet')) {
            return p0_card_value > p1_card_value ? 2 : (p0_card_value < p1_card_value ? -2 : 0);
        }

        return p0_card_value > p1_card_value ? 1 : (p0_card_value < p1_card_value ? -1 : 0);
    }
}

const solver = new KuhnPokerSolver();
solver.start();
solver.train(1);
const result = solver.result();
console.log('Result:', result);