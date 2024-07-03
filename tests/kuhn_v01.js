const ACTIONS = ['check', 'bet', 'call', 'fold'];
const RANKS = ['J', 'Q', 'K'];
const NUM_PLAYERS = 2;

class KuhnPokerMCCFR {
    constructor() {
        this.deck = RANKS.slice();
        this.regretSum = {};
        this.strategy = {};
        this.strategySum = {};
        this.playerCards = [];
        this.history = [];
    }

    initializeLogs(log) {
        this.regretSum[log] = {};
        this.strategy[log] = {};
        this.strategySum[log] = {};
        for (const action of ACTIONS) {
            this.regretSum[log][action] = 0;
            this.strategy[log][action] = 1 / ACTIONS.length;
            this.strategySum[log][action] = 0;
        }
    }

    getStrategy(log) {
        if (!(log in this.strategy)) {
            this.initializeLogs(log);
        }
        let strategy = this.strategy[log];
        let normalizingSum = 0;
        for (const action of ACTIONS) {
            strategy[action] = Math.max(this.regretSum[log][action], 0);
            normalizingSum += strategy[action];
        }
        for (const action of ACTIONS) {
            if (normalizingSum > 0) {
                strategy[action] /= normalizingSum;
            } else {
                strategy[action] = 1 / ACTIONS.length;
            }
            this.strategySum[log][action] += strategy[action];
        }

        return strategy;
    }
    // private double[] getStrategy(double realizationWeight) {
    //     double normalizingSum = 0;
    //     for (int a = 0; a < NUM_ACTIONS; a++) {
    //     strategy[a] = regretSum[a] > 0 ? regretSum[a] : 0;
    //     normalizingSum += strategy[a];
    //     }
    //     for (int a = 0; a < NUM_ACTIONS; a++) {
    //     if (normalizingSum > 0)
    //     strategy[a] /= normalizingSum;
    //     else
    //     strategy[a] = 1.0 / NUM_ACTIONS;
    //     strategySum[a] += realizationWeight * strategy[a];
    //     }
    //     return strategy;
    //     }

    deal() {
        this.deck = RANKS.slice();
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
        this.playerCards = [this.deck.pop(), this.deck.pop()];
    }

    cfr(history, p0, p1) {
        const plays = this.getValidActions(history);
        if (plays.length === 0) {
            return this.getPayoff(history);
        }

        const player = history.length % 2 === 0 ? 0 : 1;
        const playerCard = this.playerCards[player];
        const log = `${playerCard}:${history.join(':')}`;

        const strategy = this.getStrategy(log);

        const util = {};
        let nodeUtil = 0;

        for (const play of plays) {
            const newHistory = [...history, play];
            const newPlayer = newHistory.length % 2 === 0 ? 0 : 1;

            util[play] = -this.cfr(
                newHistory,
                newPlayer === 0 ? p0 * strategy[play] : p0, 
                newPlayer === 1 ? p1 * strategy[play] : p1
            );

            nodeUtil += strategy[play] * util[play];
        }

        for (const play of plays) {
            const newHistory = [...history, play];
            const newPlayer = newHistory.length % 2 === 0 ? 0 : 1;

            const updateProb = newPlayer === 0 ? p0 : p1;
            const regret = util[play] - nodeUtil;
            this.regretSum[log][play] += updateProb * regret;
        }

        return nodeUtil;
    }

    getValidActions(history) {
        if (history.length === 0) {
            return ['check', 'bet'];
        }

        if (history.length === 1) {
            const lastAction = history.slice(-1)[0];

            if (lastAction === 'check') {
                return ['check', 'bet'];
            }

            if (lastAction === 'bet') {
                return ['call', 'fold'];
            }
        }

        if (history.length === 2) {
            const lastAction = history.slice(-1)[0];

            if (lastAction === 'check' || lastAction === 'call' || lastAction === 'fold') {
                return [];
            }

            if (lastAction === 'bet') {
                return ['call', 'fold'];
            }
        }

        return [];
    }

    getPayoff(history) {
        const pot = 2 + (history.filter(r => r === 'bet').length * 2);
        const reward = pot / 2;

        const lastAction = history.slice(-1)[0];
        const player = history.length % 2 === 0 ? 0 : 1;
        const playerCard = this.playerCards[player];
        const opponentCard = this.playerCards[1 - player];

        const playerCardValue = RANKS.indexOf(playerCard);
        const opponentCardValue = RANKS.indexOf(opponentCard);

        if (lastAction === 'fold') {
            return history.length % 2 === 0 ? reward : -reward;
        }

        const payoff = playerCardValue > opponentCardValue ? reward : (playerCardValue < opponentCardValue ? -reward : 0);

        return history.length % 2 === 0 ? payoff: -payoff;
    }

    train(iterations) {
        for (let i = 0; i < iterations; i++) {
            this.deal();
            this.cfr([], 1, 1);
        }
    }

    getAverageStrategy() {
        const avgStrategy = {};
        for (const log in this.strategySum) {
            avgStrategy[log] = {};
            let normalizingSum = 0;
            for (const action of ACTIONS) {
                normalizingSum += this.strategySum[log][action];
            }
            for (const action of ACTIONS) {
                avgStrategy[log][action] = this.strategySum[log][action] / normalizingSum;
            }
        }
        return avgStrategy;
    }
}

// Training the MC-CFR algorithm
const solver = new KuhnPokerMCCFR();
solver.train(10000);  // Training for 10,000 iterations
console.log(solver.getAverageStrategy());
