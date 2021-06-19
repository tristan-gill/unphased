const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());

// use the express-static middleware
app.use(express.static("public"))

const server = require('http').createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

function createGameState () {
  return {
    players: [],
    state: 'starting'
  };
}

function makeid (length) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
   
  for ( var i = 0; i < length; i++ ) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;
}

function startGame (roomName) {
  io.sockets.in(roomName).emit('startGame');
}

const state = {};
const clientRooms = {};

io.on('connection', (client) => {
  client.on('newGame', handleNewGame);
  client.on('joinGame', handleJoinGame);
  client.on('stopGame', handleStopGame);
  client.on('playerJump', handlePlayerJump);
  client.on('changePhase', handleChangePhase);
  client.on('restartGame', handleRestartGame);

  function handleNewGame () {
    let roomName = makeid(5);
    clientRooms[client.id] = roomName;
    client.emit('gameCode', roomName);

    state[roomName] = createGameState();

    client.join(roomName);
    client.number = 1;
    client.emit('init', 1);
  }

  function handleJoinGame (gameCode) {
    const room = io.sockets.adapter.rooms.get(gameCode);

    if (room && room.size === 0) {
      client.emit('unknownGame');
      return;
    } else if (room && room.size > 1) {
      client.emit('tooManyPlayers');
      return;
    }

    clientRooms[client.id] = gameCode;

    client.join(gameCode);
    client.number = 2;
    client.emit('init', 2);

    client.emit('gameCode', gameCode);

    startGame(gameCode);
  }

  function handleStopGame (distance) {
    io.sockets.in(clientRooms[client.id]).emit('stopGame', distance);
  }

  function handlePlayerJump (playerNumber) {
    console.log('handlePlayerJump', playerNumber)
    io.sockets.in(clientRooms[client.id]).emit('playerJump', playerNumber);
  }

  function handleChangePhase (playerNumber) {
    io.sockets.in(clientRooms[client.id]).emit('changePhase', playerNumber);
  }

  function handleRestartGame () {
    io.sockets.in(clientRooms[client.id]).emit('restartGame');
  }
});

server.listen(process.env.PORT || 3000);