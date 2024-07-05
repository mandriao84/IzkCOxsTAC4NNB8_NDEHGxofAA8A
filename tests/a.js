function shuffle(cards) {
    for (let c1 = cards.length - 1; c1 > 0; c1--) {
      let c2 = Math.floor(Math.random() * (c1 + 1));
      let tmp = cards[c1];
      cards[c1] = cards[c2];
      cards[c2] = tmp;
    }
  }
  
  function dealCards(deck, numPlayers, numCardsPerPlayer) {
    // Initialize an array to hold each player's hand
    const players = Array.from({ length: numPlayers }, () => []);
  
    // Deal the cards
    for (let i = 0; i < numCardsPerPlayer; i++) {
      for (let j = 0; j < numPlayers; j++) {
        players[j].push(deck.pop());
      }
    }
  
    return players;
  }
  
  // Example usage:
  let deck = ['As', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s', '10s', 'Js', 'Qs', 'Ks',
              'Ac', '2c', '3c', '4c', '5c', '6c', '7c', '8c', '9c', '10c', 'Jc', 'Qc', 'Kc',
              'Ah', '2h', '3h', '4h', '5h', '6h', '7h', '8h', '9h', '10h', 'Jh', 'Qh', 'Kh',
              'Ad', '2d', '3d', '4d', '5d', '6d', '7d', '8d', '9d', '10d', 'Jd', 'Qd', 'Kd'];
  
  // Shuffle the deck
  shuffle(deck);
  
  // Deal 5 cards to 2 players
  const numPlayers = 2;
  const numCardsPerPlayer = 5;
  const players = dealCards(deck, numPlayers, numCardsPerPlayer);
  
  console.log(players);
  // Output: [Array of 5 cards for player 1, Array of 5 cards for player 2]
  