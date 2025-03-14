const socketIO = require('socket.io');
const OdinCircledbModel = require('../models/odincircledb');
const BetModel = require('../models/BetModel');
const WinnerModel = require('../models/WinnerModel');

const LoserModel = require('../models/LoserModel'); // Import LoserModel
const mongoose = require('mongoose');

function startSocketServer5 (httpServer){
  const io = socketIO(httpServer);

  const rooms = {};

  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
  
    
    
    socket.on('joinRoom', (data) => {
      const { roomId, playerName, userId, totalBet } = data;
    
      // Log the received data
      console.log('Received joinRoom event with data:', data);
    
      // Validate required fields
      if (!roomId || !playerName || !userId) {
        console.error('Missing roomId, playerName, or userId:', { roomId, playerName, userId });
        socket.emit('error', 'Missing roomId, playerName, or userId');
        return;
      }
    
      // Initialize the room if it doesn't exist
      if (!rooms[roomId]) {
        rooms[roomId] = {
          players: [],
          choices: {},
          round: 1,
          scores: {},
        };
        console.log(`Created room ${roomId} with initial data`, rooms[roomId]);
      }
    
      const room = rooms[roomId];
    
      // Add the new player to the room
      // const playerId = socket.id;
      //   const playerNumber = room.players.length + 1;
      //   const playerData = {
      //   id: playerId,
      //    name: playerName,
      //    playerNumber,
      //   };
      // Check if the room is full
      if (room.players.length >= 2) {
        console.log(`Room ${roomId} is full. Player ${playerName} cannot join.`);
        socket.emit('message', 'Room is full');
        return;
      }
    
      // Assign the player number dynamically based on the number of players in the room
      const playerNumber = room.players.length + 1;
      const playerData = { id: socket.id, name: playerName, userId, playerNumber, totalBet };
      room.players.push(playerData);
    
      // Initialize player's score
      room.scores[socket.id] = 0;
    
      // Join the socket to the room
      socket.join(roomId);
      console.log(`Player ${playerName} (userId: ${userId}) joined room ${roomId} as Player ${playerNumber}`);
    
       // Notify the specific player of their details
      socket.emit('playerJoined', {
      playerNumber,
      playerName,
      roomId,
      totalBet: totalBet,
      round: room.round,
     });

    //  io.to(roomId).emit('playerInfo', {
    //   roomId,
    //   players: room.players.map((player) => ({
    //     id: player.id,
    //     playerName: player.name,
    //     playerNumber: player.playerNumber,
    //   })),
    //   totalBet: totalBet,
    // });
    
    io.to(roomId).emit('playerInfo', {
      roomId,
      player1Name: room.players[0]?.name || null, // Assign player1Name based on the first player
      player2Name: room.players[1]?.name || null, // Assign player2Name based on the second player
      players: room.players.map((player, index) => ({
        id: player.id,
        playerName: player.name,
        // playerNumber: index + 1,
        playerNumber: player.playerNumber, // Assign player numbers based on their position
      })),
      totalBet: room.totalBet,
    });
    
      // Notify all clients in the room about the new player
      // io.to(roomId).emit('playerInfo', {
      //   roomId,
      //   players: room.players, 
      //   totalBet: room.totalBet,
      //   playerNumber: room.playerNumber,
      // });
    
      // Welcome message for the player
      socket.emit('message', `Welcome to the game, ${playerName}!`);
      io.to(roomId).emit('message', `Player ${playerNumber} (${playerName}) has joined the room.`);
    
      // Check if both players have joined
      if (room.players.length === 2) {
        console.log(`Both players have joined room ${roomId}`, room.players);
        io.to(roomId).emit('bothPlayersJoined', {
          message: 'Both players have joined the room.',
          roomData: room,
        });
      }
    });

// Listen for incoming chat messages from clients


   // Add this inside the io.on('connection', ...) block
   socket.on('chatText', ({ roomId, playerName, text }) => {
    // Log the data being received
    console.log(`Received chat message from ${playerName} in room ${roomId}: ${text}`);

    // Broadcast the chat text to all clients in the room
    io.to(roomId).emit('receiveText', { playerName, text });
  });



    const DEFAULT_CHOICES = ["rock", "paper", "scissors"]; // Adjust choices based on your game

// Function to auto-assign a choice after 5 seconds
const autoAssignChoice = (roomID, playerID) => {
  if (!rooms[roomID] || rooms[roomID].choices[playerID]) {
    return; // Stop if player has already made a choice
  }

  const randomChoice = DEFAULT_CHOICES[Math.floor(Math.random() * DEFAULT_CHOICES.length)];
  rooms[roomID].choices[playerID] = randomChoice;

  io.to(playerID).emit('autoChoice', { choice: randomChoice });
  console.log(`Auto-assigned ${randomChoice} to ${playerID} in room ${roomID}`);

  // Check if both players have made choices and process the round
  if (Object.keys(rooms[roomID].choices).length === 2) {
    processRound(roomID);
  }
};

// Process the round after both choices are made
const processRound = (roomID) => {
  console.log(`Both players have made their choices in room ${roomID}. Processing the round...`);

  const roundWinner = determineRoundWinner(roomID);
  if (roundWinner) {
    rooms[roomID].scores[roundWinner] = (rooms[roomID].scores[roundWinner] || 0) + 1;
  }

  rooms[roomID].round = (rooms[roomID].round || 1) + 1;

  io.to(roomID).emit('scoreUpdate', {
    scores: rooms[roomID].scores,
    round: rooms[roomID].round,
  });

  if (rooms[roomID].round > MAX_ROUNDS) {
    const overallWinnerMessage = determineOverallWinner(roomID);
    io.to(roomID).emit('gameOver', { roomID, scores: rooms[roomID].scores, overallWinner: overallWinnerMessage });
    delete rooms[roomID];
  } else {
    rooms[roomID].choices = {};
    io.to(roomID).emit('nextRound', { round: rooms[roomID].round });
  }
};


socket.on('choice', async (data) => {
  console.log("Incoming choice data:", data);
  const { roomId, choice, playerName } = data;
  const roomID = roomId.roomId || roomId;

  if (!rooms[roomID]) {
    console.log(`Room ${roomID} does not exist`);
    return;
  }

  console.log(`Received choice from ${playerName} in room ${roomID}:`, choice);

  const playerInRoom = rooms[roomID].players.find(player => player.id === socket.id);
  if (!playerInRoom) {
    console.error(`Player with socket ID ${socket.id} is not in room ${roomID}`);
    return;
  }

  rooms[roomID].choices[socket.id] = choice;
  socket.emit('playersChoice', { playerName, choice });

  const otherPlayer = rooms[roomID].players.find(player => player.id !== socket.id);

  // if (Object.keys(rooms[roomID].choices).length === 1 && otherPlayer) {
  //   io.to(otherPlayer.id).emit('waitingForOpponent');
  // }
   if (Object.keys(rooms[roomID].choices).length === 1 && otherPlayer) {
    io.to(otherPlayer.id).emit('waitingForOpponent');

    // Start a 5-second timer for the other player
    setTimeout(() => autoAssignChoice(roomID, otherPlayer.id), 5000);
  }

  if (Object.keys(rooms[roomID].choices).length === 2) {
    console.log(`Both players have made their choices in room ${roomID}. Processing the round...`);

    const roundWinner = determineRoundWinner(roomID);
    if (roundWinner) {
      rooms[roomID].scores[roundWinner] = (rooms[roomID].scores[roundWinner] || 0) + 1;
    }
    
  //  if (Object.keys(rooms[roomID].choices).length === 2) {
  //   processRound(roomID);
  // }

    rooms[roomID].round = (rooms[roomID].round || 1) + 1;

    io.to(roomID).emit('scoreUpdate', {
      scores: rooms[roomID].scores,
      round: rooms[roomID].round,
    });

    if (rooms[roomID].round > MAX_ROUNDS) {
      const overallWinnerMessage = determineOverallWinner(roomID);

      if (overallWinnerMessage.includes("tie")) {
        console.log(`Game tie in room ${roomID}. Resetting for another round.`);
        io.to(roomID).emit('tieGame', { roomID, message: overallWinnerMessage });
        resetGame(roomID);
      } else {
        console.log(`Game over in room ${roomID}`);
        io.to(roomID).emit('gameOver', { roomID, scores: rooms[roomID].scores, overallWinner: overallWinnerMessage })
  
            const totalBet = rooms[roomID].totalBet || 0;

const winnerUserId = determineOverallWinner(roomID);
console.log(`🛠 Winner Determined: ${winnerUserId}`); // Debug log

if (winnerUserId !== "tie") {
  const loserUser = rooms[roomID].players.find(p => p.userId !== winnerUserId);
  const loserUserId = loserUser ? loserUser.userId : null;
  
  console.log(`🏆 Winner User ID: ${winnerUserId}, ❌ Loser User ID: ${loserUserId}`);

  try {
    const winnerUser = await OdinCircledbModel.findById(winnerUserId);
    if (!winnerUser) {
      console.error(`❌ No user found with ID: ${winnerUserId}`);
      return;
    }

    console.log(`✅ Winner found: ${winnerUser.name} (ID: ${winnerUserId})`);
    winnerUser.wallet.cashoutbalance += rooms[roomID].totalBet || 0;
    await winnerUser.save();
    console.log(`💰 Updated balance for ${winnerUser.name}: ${winnerUser.wallet.cashoutbalance}`);

    const newWinner = new WinnerModel({
      roomId: roomID,
      winnerName: winnerUserId,
      totalBet: rooms[roomID].totalBet,
    });
    await newWinner.save();
    console.log(`🏆 Winner saved: ${newWinner}`);

    if (loserUserId) {
      const loserUserDoc = await OdinCircledbModel.findById(loserUserId);
      if (loserUserDoc) {
        const newLoser = new LoserModel({
          roomId: roomID,
          loserName: loserUserId,
          totalBetLost: rooms[roomID].totalBet,
        });
        await newLoser.save();
        console.log(`❌ Loser saved: ${newLoser}`);
      }
    }
  } catch (error) {
    console.error('❌ Error updating winner/loser:', error.message);
  }
}

    console.log(`🛠 Deleting room ${roomID} after processing`);
setTimeout(() => {
  delete rooms[roomID];
  console.log(`✅ Room ${roomID} deleted`);
}, 5000); // Delay to ensure DB operations finish

      }
    } else {
      rooms[roomID].choices = {};
      io.to(roomID).emit('nextRound', { round: rooms[roomID].round });
    }
  }
});



socket.on('placeBet', async ({ roomId, userId, playerNumber, betAmount }) => {
  console.log(`Room ${roomId} - Player ${playerNumber} bets: ${betAmount}`);

  rooms[roomId] = rooms[roomId] || {};

  if (!playerNumber) {
      socket.emit('betError', { message: 'Player number is required to place a bet.' });
      return;
  }

  if (playerNumber === 1) {
      rooms[roomId].player1Bet = betAmount;
      rooms[roomId].player1UserId = userId;
  } else if (playerNumber === 2) {
      rooms[roomId].player2Bet = betAmount;
      rooms[roomId].player2UserId = userId;
  }

  // Save the bet to the database
  try {
      const newBet = new BetModel({
          roomId,
          playerName: userId,
          betAmount,
      });
      await newBet.save();
      console.log('Bet saved to database:', newBet);
  } catch (error) {
      console.error('Error saving bet to database:', error.message);
      socket.emit('betError', { message: 'Error saving bet. Please try again.' });
      return;
  }

  const { player1Bet, player2Bet, player1UserId, player2UserId } = rooms[roomId];

  io.to(roomId).emit('betUpdated', {
      playerNumber,
      betAmount,
      player1Bet: rooms[roomId].player1Bet || 0,
      player2Bet: rooms[roomId].player2Bet || 0,
  });

  if (player1Bet > 0 && player2Bet > 0) {
      const totalBet = player1Bet + player2Bet;
      rooms[roomId].totalBet = totalBet;

      if (player1Bet === player2Bet) {
          io.to(roomId).emit('equalBet', { player1Bet, player2Bet, totalBet });
          try {
              const [player1, player2] = await Promise.all([
                  OdinCircledbModel.findById(player1UserId),
                  OdinCircledbModel.findById(player2UserId),
              ]);
              if (!player1 || !player2) throw new Error('User not found');
              player1.wallet.balance -= player1Bet;
              player2.wallet.balance -= player2Bet;
              await Promise.all([player1.save(), player2.save()]);
              console.log(`Deducted bets: Player1: ${player1Bet}, Player2: ${player2Bet}`);
          } catch (err) {
              console.error('Error deducting bets:', err.message);
          }
      } else {
          io.to(roomId).emit('unequalBet', { player1Bet, player2Bet });
          rooms[roomId].player1Bet = 0;
          rooms[roomId].player2Bet = 0;
          rooms[roomId].player1UserId = null;
          rooms[roomId].player2UserId = null;
      }
  }
});





 socket.on('disconnect', () => {
  console.log('A user disconnected:', socket.id);

  // Find the room and player
  for (const roomId in rooms) {
    const room = rooms[roomId];
    const playerIndex = room.players.findIndex(player => player.id === socket.id);

    if (playerIndex !== -1) {
      const disconnectedPlayer = room.players[playerIndex];
      room.players.splice(playerIndex, 1);

      io.to(roomId).emit('message', ${disconnectedPlayer.name} has left the game);

      if (room.players.length === 0) {
        delete rooms[roomId]; // Delete the room if no players are left
      } else {
        io.to(roomId).emit('opponentLeft', ${disconnectedPlayer.name} has left the game. Waiting for a new player...);
        room.choices = {}; // Reset choices if a player leaves mid-game
      }
      break;
    }
  }
    

const determineRoundWinner = (roomID) => {
  const room = rooms[roomID];
  const [player1, player2] = room.players;
  const choice1 = room.choices[player1.id];
  const choice2 = room.choices[player2.id];

  let result;
  let winner = null;

  // Determine the round winner
  if (choice1 === choice2) {
    result = "It's a draw!";
  } else if (
    (choice1 === 'Rock' && choice2 === 'Scissors') ||
    (choice1 === 'Scissors' && choice2 === 'Paper') ||
    (choice1 === 'Paper' && choice2 === 'Rock')
  ) {
    result = `${player1.name} wins! ${choice1} beats ${choice2}`;
    winner = player1;
  } else {
    result = `${player2.name} wins! ${choice2} beats ${choice1}`;
    winner = player2;
  }

  // Update scores using userId instead of socket.id to avoid mismatches
  if (winner) {
    room.scores[winner.userId] = (room.scores[winner.userId] || 0) + 1;
  }

  // Emit round result with updated scores
  io.to(roomID).emit('result', { 
    winner: winner ? winner.name : null, 
    scores: {
      [player1.userId]: room.scores[player1.userId] || 0,
      [player2.userId]: room.scores[player2.userId] || 0,
    }
  });
};


const determineOverallWinner = (roomID) => {
  const room = rooms[roomID];
  const [player1, player2] = room.players;

  const player1Score = room.scores[player1.id] || 0;
  const player2Score = room.scores[player2.id] || 0;

  console.log(`Player 1: ${player1.name}, Score: ${player1Score}`);
  console.log(`Player 2: ${player2.name}, Score: ${player2Score}`);

  if (player1Score > player2Score) {
    return player1.userId;  // Return Player 1's userId
  } else if (player2Score > player1Score) {
    return player2.userId;  // Return Player 2's userId
  } else {
    resetGame(roomID);
    return "tie";  // Handle tie separately
  }
};



const resetGame = (roomID) => {
  const room = rooms[roomID];
  room.choices = {};
  room.round = 1;
  console.log(`Game in room ${roomID} has been reset.`);
};



function generateUniqueRoomName() {
  return Math.random().toString(36).substr(2, 9); // Generate a random alphanumeric string
}

const MAX_ROUNDS = 4;
});



    

    

};  

module.exports = startSocketServer5;







