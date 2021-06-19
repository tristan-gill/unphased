const socket = io({
 transports: ['websocket', 'polling', 'flashsocket']
});

class Game {
  constructor () {
    this.size = 500;
    this.friction = 0.9;
    this.gravity = 1.5;

    this.lastFrameTime = 0;
    this.isTopPhased = false;

    this.isGameRunning = true;
  }

  init () {
    this.display = new Display();

    this.player1 = new Player(this.display.context, true, false, () => this.changePhase());
    this.player2 = new Player(this.display.context, false, true, () => this.changePhase());

    this.allWalls = [
      // 32m - easy single
      {
        x: 200,
        y: 218,
        height: 64
      },
      // 80m - easy double 
      {
        x: 300,
        y: 170,
        height: 160
      },
      // 140t - impossible
      {
        x: 450,
        y: 110,
        height: 140
      },
      // 140b - impossible
      {
        x: 550,
        y: 250,
        height: 140
      },

      // killer lesson
      {
        x: 650,
        y: 164,
        height: 16,
        width: 128
      },
      {
        x: 650,
        y: 320,
        height: 16,
        width: 128
      },

      {
        x: 650,
        y: 249,
        height: 2,
        width: 128,
        isKiller: true
      },

      {
        x: 850,
        y: 249,
        height: 2,
        width: 470,
        isKiller: true
      },

      // get ups
      {
        x: 850,
        y: 202,
        height: 16,
        width: 16
      },
      {
        x: 850,
        y: 282,
        height: 16,
        width: 16
      },

      // single jump
      {
        x: 895,
        y: 202,
        height: 16,
        width: 16
      },
      {
        x: 895,
        y: 282,
        height: 16,
        width: 16
      },

      // double jump
      {
        x: 985,
        y: 202,
        height: 16,
        width: 16
      },
      {
        x: 985,
        y: 282,
        height: 16,
        width: 16
      },

      // get up long
      {
        x: 1015,
        y: 170,
        height: 16,
        width: 48
      },
      {
        x: 1015,
        y: 314,
        height: 16,
        width: 48
      },

      // drops
      {
        x: 1075,
        y: 202,
        height: 16,
        width: 64
      },
      {
        x: 1075,
        y: 282,
        height: 16,
        width: 64
      },
      // drop enforcers
      {
        x: 1099,
        y: 40,
        height: 140,
        width: 16
      },
      {
        x: 1099,
        y: 320,
        height: 140,
        width: 16
      },

      // double jump up
      {
        x: 1160,
        y: 124,
        height: 16,
        width: 64
      },
      {
        x: 1160,
        y: 360,
        height: 16,
        width: 64
      }
    ].map((wall) => {
      return new Wall(wall.x, wall.y, wall.height, wall.width, this.display.context, wall.isKiller);
    });

    this.isGameRunning = true;
    this.lastFrameTime = 0;

    this.gameLoop(0);
  }

  gameLoop (timeStamp) {
    if (!this.isGameRunning) {
      return;
    }

    const timeSinceLastFrame = timeStamp - this.lastFrameTime;
    if (timeSinceLastFrame >= 16.7) {
      this.lastFrameTime = timeStamp;
      this.update();
      this.draw();
    }
    
    window.requestAnimationFrame((ts) => this.gameLoop(ts));
  }

  updateScore (x) {
    gameProgressDisplay.innerText = x;
  }

  stopGame () {
    restartGameScreen.style.display = "block";
    this.isGameRunning = false;
  }

  update () {
    // player 1
    this.player1.velocity_y += this.gravity;
    this.player1.velocity_y *= this.friction;

    this.player1.setNextPosition();

    this.centerCollision(this.player1, true);


    // player 2
    this.player2.velocity_y -= this.gravity;
    this.player2.velocity_y *= this.friction;

    this.player2.setNextPosition();

    this.centerCollision(this.player2, false);


    // update walls
    for (const wall of this.allWalls) {
      wall.setNextPosition();

      // check if non-visible walls are within the canvas bounds
      if (
        wall.x < this.size &&
        wall.visible === false &&
        wall.x + wall.width > 0
      ) {
        wall.visible = true;
      }

      if (wall.x + wall.width < 0 && wall.visible === true) {
        wall.visible = false;
      }

      // broad collision check
      if (wall.x < this.player1.width) {
        // narrow collision check
        if (
          this.wallCollision(wall, this.player2) &&
          (
            this.isTopPhased ||
            wall.isKiller
          )
        ) {
          if (playerNumber === 2) {
            this.stopGame();
            socket.emit('stopGame', wall.initial_x);
          }
        }

        if (
          this.wallCollision(wall, this.player1) &&
          (
            !this.isTopPhased ||
            wall.isKiller
          )
        ) {
          if (playerNumber === 1) {
            this.stopGame();
            socket.emit('stopGame', wall.initial_x);
          }
        }
      }
    }
  }

  wallCollision (wall, player) {
    if (
      wall.x < player.x + player.width &&
      wall.x + wall.width > player.x &&
      wall.y < player.y + player.height &&
      wall.y + wall.height > player.y
    ) {
      // then there was a collision.
      if (wall.isKiller) {
        return true;
      }

      // we want to allow the player to "travel" along the tops of the platforms/walls
      // so we can check the velocity to estimate if they entered the collision from the top (downward velocity)
      // or from the side, upwards velocity
      
      const center = this.size / 2;

      if (player.isTop) {
        if (
          // top player has negative velocity during initial jump
          player.velocity_y < 0 ||
          (
            // or they didnt jump at all
            player.velocity_y === 0 &&
            player.y === center - player.height
          )
        ) {
          return true;
        } else if (
          // they are falling back after their peak and they collide
          player.velocity_y > 0 &&
          wall.x >= (player.width + wall.velocity_x) &&
          // count the collision if theres a lot of y overlap
          ((player.y + player.height) - wall.y) > 4
        ) {
          console.log({
            player: {
              x: player.x,
              y: player.y,
              dx: player.velocity_x,
              dy: player.velocity_y
            },
            wall: {
              x: wall.x,
              y: wall.y,
              height: wall.height,
              width: wall.width
            }
          })
          return true;
        } else {
          console.log({
            player: {
              x: player.x,
              y: player.y,
              dx: player.velocity_x,
              dy: player.velocity_y
            },
            wall: {
              x: wall.x,
              y: wall.y,
              height: wall.height,
              width: wall.width
            }
          })
          // top collision, allow travel along the tops
          player.y = wall.y - player.height;
          player.velocity_y = 0;
          player.allowDouble = true;
        }
      } else {
        if (
          // bot player has positive velocity during initial jump
          player.velocity_y > 0 ||
          (
            // or they didnt jump at all
            player.velocity_y === 0 &&
            player.y === center
          )
        ) {
          return true;
        } else if (
          // they are falling back after their peak and they collide
          player.velocity_y < 0 &&
          wall.x >= (player.width + wall.velocity_x) &&
          // count the collision if theres a lot of y overlap
          ((wall.y + wall.height) - player.y) > 4
        ) {
          return true;
        } else {
          // top collision, allow travel along the tops
          player.y = wall.y + wall.height;
          player.velocity_y = 0;
          player.allowDouble = true;
        }
      }
    }
  }

  draw () {
    this.display.context.clearRect(0, 0, this.size, this.size);
    
    for (const wall of this.allWalls) {
      if (wall.visible) {
        wall.draw();
      }
    }

    this.display.context.fillStyle = "rgba(0, 0, 0, 0.1)";
    this.display.context.fillRect(0, 0, 500, 250);

    this.display.context.fillStyle = "rgba(255, 255, 255, 0.1)";
    this.display.context.fillRect(0, 250, 500, 250);

    this.player1.draw();
    this.player2.draw();
  }

  centerCollision (player, isTop) {
    const center = this.size / 2;

    if (isTop) {
      if ((player.y + player.height) > center) {
        player.y = center - player.height;
        player.velocity_y = 0;
        player.allowDouble = true;
      }
    } else {
      if ((player.y) < center) {
        player.y = center;
        player.velocity_y = 0;
        player.allowDouble = true;
      }
    }
  }

  //TODO maybe rewrite this to be a set, instead of a toggle, there may be some weird race conditions if both people are spamming change phase
  changePhase () {
    if (this.isTopPhased) {
      this.isTopPhased = false;
      this.player1.setPhase(false);
      this.player2.setPhase(true);
    } else {
      this.isTopPhased = true;
      this.player1.setPhase(true);
      this.player2.setPhase(false);
    }
  }
}

class Player {
  constructor (canvasContext, top, isPhased, changePhase) {
    this.x = 0;
    
    if (top) {
      this.y = 234;
    } else {
      this.y = 250;
    }

    this.velocity_x = 0;
    this.velocity_y = 0;
    this.width = 16;
    this.height = 16;
    this.color = isPhased ? "#b2dfdb" : "#4db6ac";
    this.phased = isPhased;
    this.isTop = top;
    this.changePhase = changePhase;
    this.allowDouble = true;

    this.canvasContext = canvasContext;

    if (top && playerNumber === 1) {
      window.addEventListener("keydown", (event) => {
        if (event.keyCode === 40 && event.repeat === false) {
          if (!this.phased) {
            this.changePhase();
            socket.emit('changePhase', playerNumber);
          }
        } else if ((event.keyCode === 32 || event.keyCode === 38) && event.repeat === false) {
          this.jump();
          socket.emit('playerJump', playerNumber);
        }
      });
    } else if (!top && playerNumber === 2) {
      window.addEventListener("keydown", (event) => {
        if (event.keyCode === 38 && event.repeat === false) {
          if (!this.phased) {
            this.changePhase();
            socket.emit('changePhase', playerNumber);
          }
        } else if ((event.keyCode === 32 || event.keyCode === 40) && event.repeat === false) {
          this.jump();
          socket.emit('playerJump', playerNumber);
        }
      });
    }
  }

  jump () {
    if (this.velocity_y !== 0) {
      if (this.allowDouble === false) {
        return;
      }

      this.allowDouble = false;
    }

    if (this.isTop) {
      this.velocity_y = -20;
    } else {
      this.velocity_y = 20;
    }
  }

  setPhase (isPhased) {
    if (isPhased) {
      this.phased = true;
      this.color = "#b2dfdb";
    } else {
      this.phased = false;
      this.color = "#4db6ac";
    }
  }

  setNextPosition () {
    this.x += this.velocity_x;
    this.y += this.velocity_y;
  }

  draw () {
    this.canvasContext.fillStyle = this.color;
    this.canvasContext.fillRect(this.x, this.y, this.width, this.height);
  }
}

class Wall {
  constructor (x, y, height, width, canvasContext, isKiller) {
    this.initial_x = x ?? 0;
    this.x = x ?? 0;
    this.y = y ?? (250 - (height ?? 16));
    this.velocity_x = -2;
    this.velocity_y = 0;
    this.width = width ?? 16;
    this.height = height ?? 32;
    this.color = isKiller ? "#b71c1c" : "#FFFFFF";
    this.visible = false;
    this.isKiller = isKiller ?? false;

    this.canvasContext = canvasContext;
  }

  setNextPosition () {
    this.x += this.velocity_x;
    this.y += this.velocity_y;
  }

  draw () {
    this.canvasContext.fillStyle = this.color;
    this.canvasContext.fillRect(this.x, this.y, this.width, this.height);
  }
}

class Display {
  constructor () {
    this.canvas = document.getElementById('canvas');
    this.context = this.canvas.getContext("2d");
  }
}

let playerNumber;
const game = new Game();

const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');

const newGameButton = document.getElementById('new-game-button');
const roomCodeInput = document.getElementById('room-code-input');
const joinGameButton = document.getElementById('join-game-button');

const gameCodeDisplay = document.getElementById('game-code-display');
const gameProgressDisplay = document.getElementById('game-progress-display');

const restartGameScreen = document.getElementById('restart-game-screen');
const restartGameButton = document.getElementById('restart-game-button');

newGameButton.addEventListener('click', newGameOnClick);
joinGameButton.addEventListener('click', joinGameOnClick);
restartGameButton.addEventListener('click', restartGameOnClick);

function newGameOnClick () {
  socket.emit('newGame');
  showCanvas();
}

function joinGameOnClick () {
  const code = roomCodeInput.value;
  socket.emit('joinGame', code);
  showCanvas();
}

function restartGameOnClick () {
  socket.emit('restartGame');
}

socket.on('init', handleInit);
socket.on('gameCode', handleGameCode);
socket.on('startGame', handleStartGame);
socket.on('stopGame', handleStopGame);

socket.on('unknownGame', handleUnknownGame);
socket.on('tooManyPlayers', handleTooManyPlayers);

socket.on('playerJump', handlePlayerJump);
socket.on('changePhase', handleChangePhase);

function handleInit (number) {
  playerNumber = number;
}

function handleGameCode (gameCode) {
  gameCodeDisplay.innerText = gameCode;
}

function handleStartGame () {
  restartGameScreen.style.display = "none";
  game.init();
}

function handleStopGame (distance) {
  game.updateScore(distance);
  game.stopGame();
}

function handleUnknownGame () {
  reset();
  alert("Unknown game code");
}

function handleTooManyPlayers () {
  reset();
  alert("Game is in progress");
}

function handlePlayerJump (playerNum) {
  if (playerNum !== playerNumber) {
    if (playerNum === 1) {
      game.player1.jump();
    } else if (playerNum === 2) {
      game.player2.jump();
    }
  }
}

function handleChangePhase (playerNum) {
  if (playerNum !== playerNumber) {
    game.changePhase();
  }
}

function reset () {
  playerNumber = null;
  roomCodeInput.value = "";
  gameCodeDisplay.innerText = "";
  menuScreen.style.display = "block";
  gameScreen.style.display = "none";
  restartGameScreen.style.display = "none";
}

function showCanvas () {
  menuScreen.style.display = "none";
  gameScreen.style.display = "flex";
}
