use itertools::Itertools;
use lru::LruCache;
use once_cell::sync::Lazy;
use rand::seq::SliceRandom;
use rand::thread_rng;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufRead, BufReader, Write};
use std::num::NonZeroUsize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;

// --- Efficient Card Representation (Example using u8) ---
// A more robust version would use u32 or u64 with bitmasks for rank, suit, primes etc.
// Format: | Suit (2 bits) | Rank (4 bits) | = 6 bits needed per card. u8 is sufficient.
// Suits: 00=s, 01=h, 10=d, 11=c
// Ranks: 0010=2, ..., 1010=T, 1011=J, 1100=Q, 1101=K, 1110=A (Ace high)
// Example: Ace of Spades (As) = 00_1110 = 14
// Example: King of Spades (Ks) = 00_1101 = 13
// Example: Two of Clubs (2c)  = 11_0010 = 50

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Debug, Serialize, Deserialize)]
struct Card(u8); // Represents a card using a single byte

impl Card {
    const SUIT_SHIFT: u8 = 4;
    const RANK_MASK: u8 = 0b0000_1111;
    const SUIT_MASK: u8 = 0b0011_0000;

    fn new(rank: u8, suit_bits: u8) -> Self {
        // rank: 2-14 (2 to Ace)
        // suit_bits: 0 (s), 1 (h), 2 (d), 3 (c)
        assert!(rank >= 2 && rank <= 14);
        assert!(suit_bits <= 3);
        Card((suit_bits << Self::SUIT_SHIFT) | rank)
    }

    fn rank(&self) -> u8 {
        self.0 & Self::RANK_MASK
    }

    fn suit_bits(&self) -> u8 {
        (self.0 & Self::SUIT_MASK) >> Self::SUIT_SHIFT
    }

    // Basic string conversion for compatibility/debugging (NOT efficient)
    fn to_string(&self) -> String {
        let rank_char = match self.rank() {
            2..=9 => (b'0' + self.rank()) as char,
            10 => 'T',
            11 => 'J',
            12 => 'Q',
            13 => 'K',
            14 => 'A',
            _ => '?',
        };
        // Handle 10 specially if needed
        let rank_str = if rank_char == 'T' { "10".to_string() } else { rank_char.to_string() };

        let suit_char = match self.suit_bits() {
            0 => 's',
            1 => 'h',
            2 => 'd',
            3 => 'c',
            _ => '?',
        };
        format!("{}{}", rank_str, suit_char)
    }

     // Basic string parsing (NOT efficient)
     fn from_str(s: &str) -> Option<Self> {
        if s.len() < 2 { return None; }
        let (rank_str, suit_char_str) = s.split_at(s.len() - 1);
        let suit_char = suit_char_str.chars().next()?;

        let rank = match rank_str {
            "2" => 2, "3" => 3, "4" => 4, "5" => 5, "6" => 6, "7" => 7, "8" => 8, "9" => 9,
            "10" | "T" => 10, "J" => 11, "Q" => 12, "K" => 13, "A" => 14,
            _ => return None,
        };
        let suit_bits = match suit_char {
            's' => 0, 'h' => 1, 'd' => 2, 'c' => 3,
            _ => return None,
        };
        Some(Self::new(rank, suit_bits))
    }
}

type Hand = Vec<Card>; // Or potentially a fixed-size array [Card; 5]

static FULL_DECK: Lazy<Vec<Card>> = Lazy::new(|| {
    let mut deck = Vec::with_capacity(52);
    for suit_bits in 0..4 {
        for rank in 2..=14 {
            deck.push(Card::new(rank, suit_bits));
        }
    }
    deck
});

const PATH_RESULTS_STR: &str = "/Users/gregorylourenco/Work/IzkCOxsTAC4NNB8_NDEHGxofAA8A/.results/mccfr/strategies_rust_optimized.ndjson";

// --- Cache Definition ---
#[derive(Serialize, Deserialize, Debug, Clone)]
struct CacheEntry {
    key: String, // Canonical hand representation + round marker
    score: f64,
    cards: Option<Vec<String>>, // Best discard cards (strings for JSON)
}

// Cache for hand scores (:S) and round results (:R)
static CACHE: Lazy<Arc<Mutex<LruCache<String, String>>>> = Lazy::new(|| {
    let cache_size = NonZeroUsize::new(3_000_000).unwrap(); // Adjust size as needed
    Arc::new(Mutex::new(LruCache::new(cache_size)))
});


// --- Helper Functions ---

fn safe_round(value: f64, decimals: u32) -> f64 {
    let factor = 10.0_f64.powi(decimals as i32);
    (value * factor).round() / factor
}

fn get_array_shuffled<T>(array: &mut [T]) {
    let mut rng = thread_rng();
    array.shuffle(&mut rng);
}

// Generates a canonical string key for a hand (sorted card strings)
// For caching, a key derived from sorted u8 card values would be more efficient
fn get_hand_key(hand: &[Card]) -> String {
    let mut sorted_hand = hand.to_vec();
    sorted_hand.sort_unstable(); // Sort by u8 representation
    sorted_hand.iter().map(|c| c.to_string()).join("|")
}

// --- Highly Optimized Hand Evaluation (Placeholder) ---
// This is where you'd integrate a lookup-table based evaluator (e.g., Cactus Kev)
// For demonstration, we'll use a simplified version based on the previous logic,
// but operating on the u8 card representation. THIS IS NOT THE FASTEST WAY.
fn get_hand_score_fast(hand: &[Card]) -> f64 {
     if hand.len() != 5 { return 0.0; }

    // --- Generate Cache Key (using efficient representation if possible) ---
    // For simplicity, still using string key here. A u64 key would be better.
    let mut sorted_hand_for_key = hand.to_vec();
    sorted_hand_for_key.sort_unstable(); // Sort by u8 representation
    let hand_key_str = sorted_hand_for_key.iter().map(|c| c.to_string()).join("|");
    let cache_score_key = format!("{}:S", hand_key_str);


    // --- Check Cache ---
    {
        let mut cache = CACHE.lock().unwrap();
        if let Some(score_str) = cache.get(&cache_score_key) {
             if let Ok(score) = score_str.parse::<f64>() {
                return score;
            }
        }
    }

    // --- Calculate Score (Simplified Logic - REPLACE with fast evaluator) ---
    let mut ranks: Vec<u8> = hand.iter().map(|c| c.rank()).collect();
    ranks.sort_unstable_by(|a, b| b.cmp(a)); // Descending

    let suits: Vec<u8> = hand.iter().map(|c| c.suit_bits()).collect();
    let is_flush = suits.windows(2).all(|w| w[0] == w[1]); // Faster check

    // Check for Ace-low straight (A, 2, 3, 4, 5) -> ranks 14, 5, 4, 3, 2
    let is_ace_low_straight = ranks == [14, 5, 4, 3, 2];
    let ranks_for_straight = if is_ace_low_straight { vec![5, 4, 3, 2, 1] } else { ranks.clone() }; // Use 1 for Ace if Ace-low

    let is_straight = ranks_for_straight.windows(2).all(|w| w[0] == w[1] + 1);

    // Use a fixed-size array for counts (faster than HashMap for small range)
    let mut rank_counts = [0u8; 15]; // Index 0 unused, 2-14 for ranks
    for &rank in &ranks {
        rank_counts[rank as usize] += 1;
    }
    let counts: Vec<u8> = rank_counts.iter().filter(|&&c| c > 0).cloned().sorted().rev().collect();

    let score = match (is_straight, is_flush, counts.get(0), counts.get(1)) {
        (true, true, _, _) => {
             let high_card_val = if is_ace_low_straight { 5 } else { ranks[0] };
             80000.0 + high_card_val as f64
        },
        (_, _, Some(4), _) => {
            let four_rank = rank_counts.iter().position(|&c| c == 4).unwrap();
            70000.0 + four_rank as f64
        },
        (_, _, Some(3), Some(2)) => {
            let three_rank = rank_counts.iter().position(|&c| c == 3).unwrap();
             60000.0 + three_rank as f64
        },
        (false, true, _, _) => 50000.0 + ranks[0] as f64,
        (true, false, _, _) => {
             let high_card_val = if is_ace_low_straight { 5 } else { ranks[0] };
             40000.0 + high_card_val as f64
        },
        (_, _, Some(3), _) => {
            let three_rank = rank_counts.iter().position(|&c| c == 3).unwrap();
            30000.0 + three_rank as f64 // Simplified score
        },
        (_, _, Some(2), Some(2)) => {
             let pairs: Vec<usize> = rank_counts.iter().enumerate()
                .filter(|(_, &c)| c == 2)
                .map(|(rank_idx, _)| rank_idx)
                .sorted().rev().collect();
             20000.0 + (pairs[0] as f64 * 15.0) + pairs[1] as f64 // Simplified score
        },
        (_, _, Some(2), _) => {
            let pair_rank = rank_counts.iter().position(|&c| c == 2).unwrap();
             10000.0 + (pair_rank as f64 * 15.0 * 15.0) // Simplified score
        },
        _ => {
            // High Card - Simplified
            ranks[0] as f64
        }
    };

    // --- Store in Cache ---
    {
        let mut cache = CACHE.lock().unwrap();
        cache.put(cache_score_key, score.to_string());
    }

    score
}


// --- Core Logic: Simulation (Adapted for efficiency) ---

#[derive(Debug, Serialize, Deserialize, Clone)]
struct DiscardDetails {
    scores_per_discard_count: HashMap<usize, f64>,
    best_score: f64,
    best_discard_indices: Vec<usize>,
    best_discard_cards: Vec<String>, // Keep strings for JSON output
    key: Option<String>,
}

fn get_discards_details_optimized(
    hand: &[Card], // Use slice
    deck_left: &[Card], // Use slice
    round_number: u32,
    simulation_number_per_level: u64,
) -> DiscardDetails {
    let mut results_per_discard_count = HashMap::new();
    let mut best_overall_score = f64::INFINITY;
    let mut best_overall_indices: Vec<usize> = vec![];

    let hand_len = hand.len();
    let hand_indices: Vec<usize> = (0..hand_len).collect();

    for discard_count in 0..=hand_len {
        let mut best_score_for_count = f64::INFINITY;
        let mut best_indices_for_count: Vec<usize> = vec![];

        // Use itertools combinations directly on indices
        for discard_indices_slice in hand_indices.iter().cloned().combinations(discard_count) {
            let discard_indices: HashSet<usize> = discard_indices_slice.iter().cloned().collect(); // HashSet for fast lookup

            // Pre-allocate vectors outside the simulation loop where possible
            let mut hand_kept = Vec::with_capacity(hand_len - discard_count);
            for (idx, card) in hand.iter().enumerate() {
                if !discard_indices.contains(&idx) {
                    hand_kept.push(*card);
                }
            }

            // --- Simulation Loop ---
            // Consider parallelizing this loop if simulation_number_per_level is large
            // and the work inside is substantial enough (might need Rayon's parallel iterators)
            let score_sum_for_indices: f64 = (0..simulation_number_per_level)
                // .into_par_iter() // Uncomment for parallel simulation (ensure thread safety!)
                .map(|_| {
                    // Minimal allocations inside the hot loop
                    let mut current_deck = deck_left.to_vec(); // Cloning deck is often necessary
                    get_array_shuffled(&mut current_deck);

                    let mut new_hand = hand_kept.clone(); // Clone the kept hand
                    new_hand.extend(current_deck.iter().take(discard_count)); // Extend with drawn cards

                    if new_hand.len() == 5 {
                        let score_for_sim = if round_number > 1 && current_deck.len() >= discard_count + 5 {
                            let deck_after_draw = &current_deck[discard_count..]; // Slice for next round

                            // --- Recursive Call & Caching ---
                            let next_hand_key_str = get_hand_key(&new_hand); // Use string key for now
                            let cache_result_key = format!("{}:R{}", next_hand_key_str, round_number - 1);
                            let mut cached_score = None;

                            { // Cache check scope
                                let mut cache = CACHE.lock().unwrap();
                                if let Some(entry_str) = cache.get(&cache_result_key) {
                                    if let Ok(entry) = serde_json::from_str::<CacheEntry>(entry_str) {
                                        cached_score = Some(entry.score);
                                    }
                                }
                            }

                            if let Some(score) = cached_score {
                                score
                            } else {
                                // Recurse
                                let next_round_details = get_discards_details_optimized(
                                    &new_hand,
                                    deck_after_draw,
                                    round_number - 1,
                                    simulation_number_per_level, // Or sqrt logic if needed
                                );
                                // Cache the result
                                let result_to_cache = CacheEntry {
                                    key: cache_result_key.clone(),
                                    score: next_round_details.best_score,
                                    cards: Some(next_round_details.best_discard_cards),
                                };
                                { // Cache store scope
                                    let mut cache = CACHE.lock().unwrap();
                                    if let Ok(json_str) = serde_json::to_string(&result_to_cache) {
                                        cache.put(cache_result_key, json_str);
                                    }
                                }
                                next_round_details.best_score
                            }
                        } else {
                            // Base case: Use the fast evaluator
                            get_hand_score_fast(&new_hand)
                        };
                        score_for_sim
                    } else {
                        0.0 // Should not happen
                    }
                })
                .sum(); // Sum up scores from simulations

            let score_average = if simulation_number_per_level > 0 {
                score_sum_for_indices / simulation_number_per_level as f64
            } else {
                 if discard_count == 0 { get_hand_score_fast(hand) } else { f64::INFINITY }
            };

            if score_average < best_score_for_count {
                best_score_for_count = score_average;
                // Store indices efficiently
                best_indices_for_count = discard_indices_slice; // Already a Vec<usize>
            }
        } // End loop over discard combinations

        results_per_discard_count.insert(discard_count, safe_round(best_score_for_count, 3));

        if best_score_for_count < best_overall_score {
            best_overall_score = best_score_for_count;
            best_overall_indices = best_indices_for_count;
        }
    } // End loop over discard_count

    let best_discard_cards_str: Vec<String> = best_overall_indices
        .iter()
        .map(|&idx| hand[idx].to_string()) // Convert back to string for output
        .collect();

    DiscardDetails {
        scores_per_discard_count: results_per_discard_count,
        best_score: safe_round(best_overall_score, 3),
        best_discard_indices: best_overall_indices,
        best_discard_cards: best_discard_cards_str,
        key: None,
    }
}

// --- Parallel Data Computation (Using Rayon) ---

fn get_cache_loaded(path: &Path) -> io::Result<HashSet<String>> {
    // (Same as previous Rust example - loads cache from file)
    let mut entries = HashSet::new();
    if !path.exists() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        return Ok(entries);
    }

    let file = File::open(path)?;
    let reader = BufReader::new(file);

    for line in reader.lines() {
        let line_content = line?;
        let line_trimmed = line_content.trim();
        if !line_trimmed.is_empty() {
            entries.insert(line_trimmed.to_string());
             if let Ok(entry) = serde_json::from_str::<CacheEntry>(line_trimmed) {
                 if let Some(key) = entry.key {
                    let mut cache = CACHE.lock().unwrap();
                    cache.put(key, line_trimmed.to_string());
                 }
             } else {
                 // Handle potential :S score-only entries if needed
             }
        }
    }
    Ok(entries)
}

fn run_parallel_computation(
    total_simulations: u64,
    round_number: u32,
    // simulation_number_per_hand: u64, // Sims for get_discards_details
) -> io::Result<()> {
    let results_path = PathBuf::from(PATH_RESULTS_STR);
    let existing_entries_set = get_cache_loaded(&results_path)?;
    let existing_entries = Arc::new(Mutex::new(existing_entries_set));

    // Use OpenOptions for appending
    let file_handle = OpenOptions::new()
        .append(true)
        .create(true)
        .open(&results_path)?;
    let results_writer = Arc::new(Mutex::new(file_handle)); // Wrap file handle for thread safety

    let start_time = Instant::now();
    let base_deck = FULL_DECK.to_vec(); // Base deck for cloning

    // --- Parallel Iteration using Rayon ---
    (0..total_simulations).into_par_iter().for_each(|i| {
        if i % 1000 == 0 { // Log progress less frequently
             println!("Processing simulation #{}", i);
        }

        let mut thread_rng = rand::thread_rng(); // RNG per thread recommended
        let mut deck = base_deck.clone();
        deck.shuffle(&mut thread_rng);

        // Deal hand (simplified dealing)
        if deck.len() < 5 { return; } // Should not happen
        let hand: Hand = deck.iter().take(5).cloned().collect();
        let hand_slice = &hand[..]; // Use slice

        // --- Check Cache & Compute ---
        let hand_key_str = get_hand_key(hand_slice); // String key for now
        let cache_result_key = format!("{}:R{}", hand_key_str, round_number);

        let needs_computation = {
            let cache = CACHE.lock().unwrap(); // Lock only for check
            !cache.contains(&cache_result_key)
        };

        if needs_computation {
            let hand_set: HashSet<Card> = hand_slice.iter().cloned().collect();
            let deck_left: Vec<Card> = base_deck.iter() // Use base_deck for filtering
                                        .filter(|c| !hand_set.contains(c))
                                        .cloned()
                                        .collect();

            // Use the optimized function
            let sim_num_for_details = 10000; // Fixed sims per hand evaluation
            let mut result = get_discards_details_optimized(
                hand_slice,
                &deck_left,
                round_number,
                sim_num_for_details,
            );
            result.key = Some(cache_result_key.clone());

            // --- Serialize and Write Result (with locking) ---
            if let Ok(result_json) = serde_json::to_string(&result) {
                let mut existing = existing_entries.lock().unwrap(); // Lock shared set
                if !existing.contains(&result_json) {
                    // Lock file only when writing
                    let mut writer_handle = results_writer.lock().unwrap();
                    if writeln!(writer_handle, "{}", result_json).is_ok() {
                        // Update shared set and cache *after* successful write
                        existing.insert(result_json.clone());
                        let mut cache = CACHE.lock().unwrap(); // Lock cache
                        cache.put(cache_result_key, result_json);
                    } else {
                        eprintln!("Error writing result to file for key: {}", result.key.unwrap_or_default());
                    }
                } else {
                    // If already exists in the file set, ensure it's in the LRU cache
                     let mut cache = CACHE.lock().unwrap();
                     if !cache.contains(result.key.as_ref().unwrap()) {
                         cache.put(cache_result_key, result_json);
                     }
                }
            }
        }
    }); // End parallel loop

    println!("Parallel computation finished in {:?}", start_time.elapsed());
    Ok(())
}


// --- Main Function ---
fn main() {
    let start_time = Instant::now();

    // Example: Run computation for round 1 with 10,000 total simulations
    let round_number = 1;
    let total_simulations = 1000; // Total hands to simulate drawing

    println!("Starting computation: Round {}, Simulations {}", round_number, total_simulations);
    if let Err(e) = run_parallel_computation(total_simulations, round_number) {
        eprintln!("Error during computation: {}", e);
    }

    // Example: Get details for a specific hand
    // let hand_to_test = ["4s", "4c", "8s", "8c", "Qs"];
    // let hand_cards: Result<Hand, _> = hand_to_test.iter().map(|s| Card::from_str(s).ok_or("Parse error")).collect();
    // if let Ok(hand) = hand_cards {
    //     let mut deck = FULL_DECK.to_vec();
    //     get_array_shuffled(&mut deck);
    //     let hand_set: HashSet<Card> = hand.iter().cloned().collect();
    //     let deck_left: Vec<Card> = deck.into_iter().filter(|c| !hand_set.contains(c)).collect();

    //     println!("\nTesting specific hand: {:?}", hand_to_test);
    //     let details = get_discards_details_optimized(&hand, &deck_left, 2, 1000);
    //     println!("Result: {:?}", details);
    // } else {
    //      eprintln!("Error parsing test hand");
    // }


    println!("\nTotal execution time: {:?}", start_time.elapsed());
}