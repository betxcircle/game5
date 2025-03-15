const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const socketIO = require('socket.io');
const OdinCircledbModel = require('./models/odincircledb');
const BetModel = require('./models/BetModel');
const WinnerModel = require('./models/WinnerModel');
const LoserModel = require('./models/LoserModel');
const mongoose = require('mongoose');

require("dotenv").config();

const app = express();
app.use(cors()); // Allow connections from your React Native app

const server = http.createServer(app);

const mongoUsername = process.env.MONGO_USERNAME;
const mongoPassword = process.env.MONGO_PASSWORD;
const mongoDatabase = process.env.MONGO_DATABASE;
const mongoCluster = process.env.MONGO_CLUSTER;

const uri = `mongodb+srv://${mongoUsername}:${mongoPassword}@${mongoCluster}.kbgr5.mongodb.net/${mongoDatabase}?retryWrites=true&w=majority`;


// MongoDB Connection
mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log("MongoDB connected"))
    .catch(err => console.error("MongoDB connection error:", err));

    
const SearchSocketIo = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*", // Replace with your frontend's URL if needed
      methods: ["GET", "POST"],
    },
  });
  
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

socket.on('choice', async (data) => {
  console.log("Incoming choice data:", data);
  const { roomId, choice, playerName } = data;
  const roomID = roomId.roomId || roomId;  

  if (!rooms[roomID]) {
    console.log(`Room ${roomID} does not exist`);
    return;
  }

  console.log(`Received choice from ${playerName} in room ${roomID}:`, choice);

  if (rooms[roomID]) {
    const playerInRoom = rooms[roomID].players.find(player => player.id === socket.id);
    if (playerInRoom) {
      rooms[roomID].choices[socket.id] = choice;  

      socket.emit('playersChoice', { playerName, choice });

      if (Object.keys(rooms[roomID].choices).length === 1) {
        socket.emit('waitingForOpponent');

        const otherPlayer = rooms[roomID].players.find(player => player.id !== socket.id);
        io.to(otherPlayer.id).emit('waitingForOpponent');
      }

      if (Object.keys(rooms[roomID].choices).length === 2) {
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

          if (overallWinnerMessage.includes("tie")) {
            console.log(`Game tie in room ${roomID}. Resetting for another round.`);
            io.to(roomID).emit('tieGame', { roomID, message: overallWinnerMessage });
            resetGame(roomID);
          } else {
            console.log(`Game over in room ${roomID}`);
            io.to(roomID).emit('gameOver', { roomID, scores: rooms[roomID].scores, overallWinner: overallWinnerMessage });

            // Identify winner and loser
            const winnerUserId = overallWinnerMessage.includes('Player 1') ? rooms[roomID].players[0].userId : rooms[roomID].players[1].userId;
            const loserUserId = rooms[roomID].players.find(player => player.userId !== winnerUserId).userId;
            const totalBet = rooms[roomID].totalBet || 0;

            try {
              if (!winnerUserId) {
                console.log('Invalid winner user ID:', winnerUserId);
                return;
              }

              // ✅ Update Winner in Database
              const winnerUser = await OdinCircledbModel.findById(winnerUserId);
              if (winnerUser) {
                winnerUser.wallet.cashoutbalance += totalBet;
                await winnerUser.save();
                console.log(`${winnerUser.name}'s balance updated`);

                const newWinner = new WinnerModel({
                  roomId: roomID,
                  winnerName: winnerUser._id,
                  totalBet: totalBet,
                });
                await newWinner.save();
                console.log('Winner saved to database:', newWinner);
              } else {
                console.log('Winner user not found');
              }

              // ✅ Save Loser in Database
              if (loserUserId) {
                const loserUser = await OdinCircledbModel.findById(loserUserId);
                if (loserUser) {
                  const newLoser = new LoserModel({
                    roomId: roomID,
                    loserName: loserUser._id,
                    totalBet: totalBet,
                  });
                  await newLoser.save();
                  console.log('Loser saved to database:', newLoser);
                } else {
                  console.log('Loser user not found');
                }
              }
            } catch (error) {
              console.error('Error updating winner/loser balance or saving to database:', error.message);
            }

            // Clear room data if no longer needed
            delete rooms[roomID];
          }
        } else {
          rooms[roomID].choices = {};
          io.to(roomID).emit('nextRound', { round: rooms[roomID].round });
        }
      }
    } else {
      console.error(`Player with socket ID ${socket.id} is not in room ${roomID}`);
    }
  } else {
    console.error(`Players array is undefined for room ${roomID}`);
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


// Handle socket disconnection
socket.on('disconnect', async () => {
  console.log('A user disconnected:', socket.id);

  for (const roomId in rooms) {
    const room = rooms[roomId];
    const playerIndex = room.players.findIndex(player => player.id === socket.id);

    if (playerIndex !== -1) {
      const disconnectedPlayer = room.players[playerIndex];
      console.log(`Player ${disconnectedPlayer.name} (ID: ${socket.id}) disconnected from room ${roomId}`);

      room.players.splice(playerIndex, 1); // Remove the player from the room
      io.to(roomId).emit('message', `${disconnectedPlayer.name} has left the game`);

      console.log(`Remaining players in room ${roomId}:`, room.players);

      if (room.players.length === 0) {
        // Delete the room if no players are left
        delete rooms[roomId];
        console.log(`Room ${roomId} deleted from memory.`);
      } else {
        // If one player remains, check if a winner was already determined
        const overallWinnerMessage = determineOverallWinner(roomId);
        console.log(`Overall winner message: ${overallWinnerMessage}`);

        if (!overallWinnerMessage.includes("tie") && !overallWinnerMessage.includes("winner")) {
          // No winner was determined yet, credit the remaining player as the winner
          const remainingPlayer = room.players[0];
          console.log(`${remainingPlayer.name} is the winner by default as opponent left.`);

          // Emit game over event
          io.to(roomId).emit('gameOver', { 
            roomId, 
            scores: room.scores, 
            overallWinner: `${remainingPlayer.name} wins by default!`
          });

          // Update database
          try {
            console.log(`Updating balance for user ${remainingPlayer.userId}`);
            const winnerUser = await OdinCircledbModel.findById(remainingPlayer.userId);
            if (winnerUser) {
              winnerUser.wallet.cashoutbalance += room.totalBet || 0;
              await winnerUser.save();
              console.log(`${winnerUser.name}'s balance updated successfully. New balance: ${winnerUser.wallet.cashoutbalance}`);

              // Save the winner to WinnerModel
              const newWinner = new WinnerModel({
                roomId: roomId,
                winnerName: winnerUser._id,
                totalBet: room.totalBet || 0,
              });
              await newWinner.save();
              console.log('Winner saved to database:', newWinner);
            } else {
              console.log('Winner user not found in database.');
            }
          } catch (error) {
            console.error('Error updating winner balance or saving to database:', error.message);
          }

          // Delete room after awarding the remaining player
          delete rooms[roomId];
          console.log(`Room ${roomId} deleted after awarding the winner.`);
        } else {
          // If a winner was already decided, just reset choices
          console.log(`Game already had a winner or was a tie, resetting choices in room ${roomId}`);
          io.to(roomId).emit('opponentLeft', `${disconnectedPlayer.name} has left. Waiting for a new player...`);
          room.choices = {};
        }
      }
      break; // Stop looping once the room is found and processed
    }
  }
});




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

  // Update scores
  if (winner) {
      room.scores[winner.id] = (room.scores[winner.id] || 0) + 1;
  }

  // // Emit round result
  // io.to(roomID).emit('result', { winner: winner ? winner.name : null, scores: room.scores });
   // Emit round result with updated scores
   io.to(roomID).emit('result', { 
    winner: winner ? winner.name : null, 
    scores: {
      player1: room.scores[player1.id] || 0,
      player2: room.scores[player2.id] || 0,
    }
  });
};


      const determineOverallWinner = (roomID) => {
  const room = rooms[roomID];
  if (!room || room.players.length < 2) return "tie";

  const [player1, player2] = room.players;
  const player1Score = room.scores[player1.id] || 0;
  const player2Score = room.scores[player2.id] || 0;

  console.log(`📊 Scores - ${player1.name}: ${player1Score}, ${player2.name}: ${player2Score}`);

  if (player1Score > player2Score) {
    return player1.userId; // Return userId instead of message
  } else if (player2Score > player1Score) {
    return player2.userId; // Return userId instead of message
  } else {
    return "tie";
  }
};


// const determineOverallWinner = (roomID) => {
//   const room = rooms[roomID];
//   const [player1, player2] = room.players;

//   const player1Score = room.scores[player1.id] || 0;
//   const player2Score = room.scores[player2.id] || 0;

//   console.log(`Player 1: ${player1.name}, Score: ${player1Score}`);
//   console.log(`Player 2: ${player2.name}, Score: ${player2Score}`);

//   let result;
//   if (player1Score > player2Score) {
//       result = `${player1.name} is the winner!`;
//   } else if (player2Score > player1Score) {
//       result = `${player2.name} is the winner!`;
//   } else {
//       result = "It's a tie! The game will reset.";
//       resetGame(roomID);
//   }

//   io.to(roomID).emit('gameResult', { message: result });
//   return result;  // Make sure to return the result
// };



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


  return io;
};

// Initialize Socket.IO with the server
const io = SearchSocketIo(server);

server.listen(5555, () => {
  console.log("🚀 Socket.io server running on port ");
});
