"use strict";
const fs = require('fs');
const stateFile = '.results/mccfr/2-7-single-draw_state.json';

/**
 * This script loads the MCCFR training state for the Deuce-to-Seven Single Draw discard subgame,
 * then prints a human-readable summary of the learned strategy (discard profile) for each information set.
 * 
 * The training state is stored in the file "mccfr_2-7-single-draw_state.json" and is expected to contain:
 *   - iterations: total number of training cycles completed.
 *   - regrets: the regret table for each information set.
 *   - strategyProfile: the strategy probabilities for each information set (computed from regrets).
 * 
 * Each information set key is a sorted list of 5 card indices (e.g. "1,7,12,20,33") representing a player's hand.
 * For each such hand, the strategyProfile is an array of 32 numbers (summing to 1), where each index corresponds to a discard action.
 * The discard action is given as a 5-bit bitmask (from 0 to 31) that indicates which card positions are discarded:
 *   - Bit 0 corresponds to card in position 0,
 *   - Bit 1 to position 1, and so on.
 * 
 * Cards are represented by indices 0..51, where:
 *   - Rank = Math.floor(card/4) + 2  (values 2 to 14, with 11=J, 12=Q, 13=K, 14=A)
 *   - Suit = card % 4 (0=♣, 1=♦, 2=♥, 3=♠)
 */

// --- Helper Functions ---

/**
 * Convert a card number (0-51) to a human-readable string.
 * Example: 0 -> "2♣", 51 -> "A♠"
 * @param {number} card - Card index 0..51.
 * @returns {string} The card in string format.
 */
function cardToString(card) {
    const suits = ["♣", "♦", "♥", "♠"];
    let rank = Math.floor(card / 4) + 2;
    const suit = suits[card % 4];
    // For face cards use letters.
    if (rank === 11) rank = "J";
    else if (rank === 12) rank = "Q";
    else if (rank === 13) rank = "K";
    else if (rank === 14) rank = "A";
    return `${rank}${suit}`;
}

/**
 * Convert a sorted information set key (a string of comma-separated card indices)
 * into a human-readable hand.
 * @param {string} infoKey - The key string, e.g. "1,7,12,20,33"
 * @returns {string} Human-readable hand, e.g. "[2♦, 4♣, 5♥, 7♠, 9♦]".
 */
function infoKeyToHand(infoKey) {
    const cardNums = infoKey.split(",").map(Number);
    const cards = cardNums.map(cardToString);
    return "[" + cards.join(", ") + "]";
}

/**
 * Convert a discard action bitmask (0-31) to a human-readable description.
 * The bitmask indicates which card positions (0 to 4) are to be discarded.
 * @param {number} mask - Number between 0 and 31.
 * @returns {string} A string description. If no card is discarded, returns "Stand pat".
 */
function maskToDiscardDesc(mask) {
    const positions = [];
    for (let pos = 0; pos < 5; pos++) {
        // Check if the bit at position pos is set (1 means discard)
        if (((mask >> pos) & 1) === 1) positions.push(pos);
    }
    if (positions.length === 0) {
        return "Stand pat (discard nothing)";
    } else {
        return "Discard card(s) at position(s): " + positions.join(", ");
    }
}

/**
 * Format a probability as a percentage with 2 decimal places.
 * @param {number} prob - The probability value between 0 and 1.
 * @returns {string} Formatted percentage string.
 */
function formatProb(prob) {
    return (prob * 100).toFixed(2) + "%";
}

// --- Main Script: Loading and Displaying the Strategy ---

/**
 * Load the training state from disk.
 */
fs.readFile(stateFile, "utf8", (err, data) => {
    if (err) {
        console.error(`Error reading file ${stateFile}:`, err);
        return;
    }
    let state;
    try {
        state = JSON.parse(data);
    } catch (parseErr) {
        console.error("Error parsing state file:", parseErr);
        return;
    }

    // Display overall training info.
    console.log("========== MCCFR Training Result Summary ==========");
    console.log(`Total Iterations: ${state.iterations}`);
    
    // The strategyProfile is an object with keys as information sets.
    const strategyProfile = state.strategyProfile;
    const infoKeys = Object.keys(strategyProfile).sort();
    
    console.log(`\nTotal Information Sets Learned: ${infoKeys.length}\n`);
    
    // For each information set, print a summary.
    // (For each info set, we will print the hand and the top 3 discard actions by probability.)
    infoKeys.forEach(infoKey => {
        const handReadable = infoKeyToHand(infoKey);
        console.log(`Hand: ${handReadable}`);
        const actionProbs = strategyProfile[infoKey];  // array of 32 probabilities
        
        // Map each action (bitmask) to its probability.
        const actions = [];
        for (let mask = 0; mask < actionProbs.length; mask++) {
            actions.push({
                mask,
                desc: maskToDiscardDesc(mask),
                prob: actionProbs[mask]
            });
        }
        
        // Sort actions in descending order of probability.
        actions.sort((a, b) => b.prob - a.prob);
        
        // We choose to print the top 3 actions (or all actions with probability above 1%).
        const significantActions = actions.filter(a => a.prob > 0.01).slice(0, 3);
        if (significantActions.length === 0) {
            // In case no action has > 1%, print the top one.
            significantActions.push(actions[0]);
        }
        
        significantActions.forEach(action => {
            console.log(`  Action: ${action.desc}  ->  Probability: ${formatProb(action.prob)}`);
        });
        console.log("--------------------------------------------------");
    });

    console.log("========== End of Strategy Summary ==========");
});