function roundStatus(plays) {
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

    const result = {
        "rounds": rounds,
        "roundLabel": rounds[roundNumber]?.["label"] ?? null,
        "roundPlays": roundPlays,
        "roundBetCount": roundBetCount,
    };
    console.dir(result, { depth: null });

    return result
}

const plays = ['bet', 'call', 'bet', 'call', 'bet', 'call', 'bet', 'bet', 'bet', 'call', 'bet', 'bet'];
roundStatus(plays);
