const fs = require('fs');
const ACTIONS = ['check', 'bet', 'call', 'fold'];

class LimitHoldemSolver {
    constructor() {
        this.suits = ['d', 's', 'c', 'h'];
        this.ranks = ['K', 'Q', 'J'];
        this.deck = [];
        this.regretSum = {};
        this.strategy = {};
        this.strategySum = {};
        this.rounds = [];
        this.roundLabel = null;
        this.roundPlays = null;
        this.roundBetCount = null;
        this.player = null;
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
            this.strategy[log][action] = 1 / ACTIONS.length;
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
        // const epsilon = 1e-10;
        let normalizingSum = 0;
        for (const action of ACTIONS) {
            this.strategy[log][action] = Math.max(this.regretSum[log][action], 0);
            normalizingSum += this.strategy[log][action];
        }
    
        if (normalizingSum > 0) {
            for (const action of ACTIONS) {
                this.strategy[log][action] /= normalizingSum;
            }
        } else {
            const uniformProbability = 1 / ACTIONS.length;
            for (const action of ACTIONS) {
                this.strategy[log][action] = uniformProbability;
            }
        }

        for (const action of ACTIONS) {
            this.strategySum[log][action] += this.strategy[log][action];
        }
    }

    updateRounds(plays) {
        const rounds = [{
            "label": "preflop",
            "plays": []
        }, {
            "label": "flop",
            "plays": []
        }, {
            "label": "turn",
            "plays": []
        }, {
            "label": "river",
            "plays": []
        }]
        let roundNumber = 0;
        let roundPlays = [];
        let roundBetCount = 0;
    
        for (let i = 0; i < plays.length; i++) {
            const play = plays[i];
            roundPlays.push(play);
            const playM1 = roundPlays.slice(-2)[0];
    
            if (play === 'bet') {
                roundBetCount++;
            }
    
            if ((roundPlays.length >= 2) && ((play === 'check' && playM1 === 'check') || (play === 'call'))) {
                rounds[roundNumber]["plays"] = roundPlays;
                roundNumber++;
                roundPlays = [];
                roundBetCount = 0;
                if (roundNumber === 4) { 
                    break; 
                }
            }
    
            if (play === 'fold') { 
                rounds[roundNumber]["plays"] = roundPlays;
                roundNumber = null;
                roundPlays = [];
                roundBetCount = 0;
                break;
            }
        }
    
        this.rounds = rounds;
        this.roundLabel = rounds[roundNumber]?.["label"] ?? null;
        this.roundPlays = roundPlays;
        this.roundBetCount = roundBetCount;
        this.player = roundPlays.length % 2 === 0 ? 0 : 1;
    }

    plays(history) {
        const plays = [...history];
        this.updateRounds(plays);
        const roundPlay = this.roundPlays.slice(-1)[0];

        if (this.roundLabel === null) { 
            return [];
        }

        if (this.roundPlays.length === 0 || roundPlay === 'check' || roundPlay === 'call') { 
            return ['check', 'bet'];
        }

        if (roundPlay === 'bet' && this.roundBetCount < 4) { 
            return ['bet', 'call', 'fold'];
        }

        if (roundPlay === 'bet' && this.roundBetCount >= 4) { 
            return ['call', 'fold'];
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

    train(iterations, loadFile = null, saveFile = null) {
        if (loadFile) {
            this.load(loadFile);
        }

        for (let i = 0; i < iterations; i++) {
            this.start();
            const [p0_hand, p1_hand] = this.deal();
            this.cfr([], 1, 1, p0_hand, p1_hand);
        }

        if (saveFile) {
            this.save(saveFile);
        }
    }

    load(filename) {
        try {
            const path = process.cwd() + '/tests/' + filename;
            const dataRaw = fs.readFileSync(path, 'utf8');
            const data = JSON.parse(dataRaw);
            
            for (const log in data) {
                this.strategySum[log] = {};
                for (const action in data[log]) {
                    this.strategySum[log][action] = data[log][action];
                }
            }
            
            console.log(`Results loaded from ${path}`);
        } catch (err) {
            console.error(`Error loading file: ${err.message}`);
        }
    }

    save(filename) {
        const result = this.result();
        const resultAsJson = JSON.stringify(result, null, 2);
        const path = process.cwd() + '/tests/' + filename;
        fs.writeFileSync(path, resultAsJson, 'utf8');
        console.log(`Results saved to ${path}`);
    }

    cfr(history, p0, p1, p0_hand, p1_hand) {
        const plays = this.plays(history);

        if (plays.length === 0) {
            return this.payoff(history, this.cardValue(p0_hand), this.cardValue(p1_hand));
        }
    
        const playerCard = this.player === 0 ? p0_hand : p1_hand;
        const log = `${playerCard.rank}:${history.join('')}`;

        let strategy = this.getStrategy(log);
    
        let util = {};
        let nodeUtil = 0;
    
        for (const play of plays) {
            const newHistory = [...history, play];

            // players dont alternate
            util[play] = this.cfr(
                newHistory,
                this.player === 0 ? p0 * strategy[play] : p0,
                this.player === 1 ? p1 * strategy[play] : p1,
                p0_hand,
                p1_hand
            );
    
            nodeUtil += strategy[play] * util[play];
        }
    
        for (const play of plays) {
            const regret = util[play] - nodeUtil;
            this.update(log, play, regret);
        }

        this.updateStrategy(log);
    
        return nodeUtil;
    }

    payoff(history, p0_card_value, p1_card_value) {
        let pot = 0;
        const playersNumber = 2;
        for (let i = 0; i < this.rounds.length; i++) {
            const unit = i < 2 ? 1 : 2;
            const round = this.rounds[i];
            const roundPlays = round["plays"];
            const betPlays = roundPlays.filter(r => r === "bet");
            const betPlaysCount = betPlays.length;
            const foldPlays = roundPlays.filter(r => r === "fold");
            const foldPlaysCount = foldPlays.length;
            // const betPlaysCountIsOdd = betPlaysCount % 2 !== 0;
            // const callPlays = roundPlays.filter(r => r === "call");
            // const callPlaysCount = callPlays.length;
            pot += (betPlaysCount * unit * playersNumber);

            if (foldPlaysCount === 1) {
                pot -= unit;
            }
        }

        const reward = pot / playersNumber;
        const payoff = p0_card_value > p1_card_value ? reward : (p0_card_value < p1_card_value ? -reward : 0);
        
        return payoff
    }
}

const solver = new LimitHoldemSolver();
solver.train(10000, 'results.json', 'results.json');
// const result = solver.result();
// console.log('Result:', result);