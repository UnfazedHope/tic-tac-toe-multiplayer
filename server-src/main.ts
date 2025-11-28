// Nakama Server Module for Tic-Tac-Toe
// This file needs to be compiled and placed in server-data/modules/

interface TicTacToeState {
  board: (string | null)[];
  currentPlayer: string;
  players: { [userId: string]: string };
  winner: string | null;
  gameOver: boolean;
  moveCount: number;
}

interface MatchLabel {
  open: number;
  skill?: number;
}

const moduleName = "tictactoe";
const tickRate = 5;
const maxEmptySec = 30;

// Match initialization
const matchInit: nkruntime.MatchInitFunction<TicTacToeState> = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  params: { [key: string]: string }
): { state: TicTacToeState; tickRate: number; label: string } {
  
  const state: TicTacToeState = {
    board: Array(9).fill(null),
    currentPlayer: '',
    players: {},
    winner: null,
    gameOver: false,
    moveCount: 0
  };

  const label: MatchLabel = {
    open: 1
  };

  return {
    state,
    tickRate,
    label: JSON.stringify(label)
  };
};

// Player joins match
const matchJoinAttempt: nkruntime.MatchJoinAttemptFunction<TicTacToeState> = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicTacToeState,
  presence: nkruntime.Presence,
  metadata: { [key: string]: any }
): { state: TicTacToeState; accept: boolean; rejectMessage?: string } | null {
  
  // Check if match is full
  if (Object.keys(state.players).length >= 2) {
    return {
      state,
      accept: false,
      rejectMessage: "Match is full"
    };
  }

  // Accept the player
  return {
    state,
    accept: true
  };
};

// Player successfully joins
const matchJoin: nkruntime.MatchJoinFunction<TicTacToeState> = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicTacToeState,
  presences: nkruntime.Presence[]
): { state: TicTacToeState } | null {
  
  for (const presence of presences) {
    // Assign player symbol (X or O)
    if (Object.keys(state.players).length === 0) {
      state.players[presence.userId] = 'X';
      state.currentPlayer = presence.userId;
    } else if (Object.keys(state.players).length === 1) {
      state.players[presence.userId] = 'O';
    }

    logger.info(`Player ${presence.username} joined as ${state.players[presence.userId]}`);
  }

  // Update match label if full
  if (Object.keys(state.players).length >= 2) {
    const label: MatchLabel = { open: 0 };
    dispatcher.matchLabelUpdate(JSON.stringify(label));
  }

  // Broadcast updated state to all players
  const stateJson = JSON.stringify(state);
  dispatcher.broadcastMessage(1, stateJson, null, null);

  return { state };
};

// Player leaves match
const matchLeave: nkruntime.MatchLeaveFunction<TicTacToeState> = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicTacToeState,
  presences: nkruntime.Presence[]
): { state: TicTacToeState } | null {
  
  for (const presence of presences) {
    logger.info(`Player ${presence.username} left`);
    delete state.players[presence.userId];
  }

  return { state };
};

// Match tick/loop
const matchLoop: nkruntime.MatchLoopFunction<TicTacToeState> = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicTacToeState,
  messages: nkruntime.MatchMessage[]
): { state: TicTacToeState } | null {
  
  // Process incoming messages
  for (const message of messages) {
    switch (message.opCode) {
      case 2: // Move message
        const move = JSON.parse(nk.binaryToString(message.data));
        state = processMove(state, message.sender.userId, move.position, dispatcher, logger);
        break;
      
      case 3: // Reset game
        if (state.gameOver) {
          state = resetGame(state);
          const stateJson = JSON.stringify(state);
          dispatcher.broadcastMessage(1, stateJson, null, null);
        }
        break;
    }
  }

  return { state };
};

// Process player move
function processMove(
  state: TicTacToeState,
  userId: string,
  position: number,
  dispatcher: nkruntime.MatchDispatcher,
  logger: nkruntime.Logger
): TicTacToeState {
  
  // Validate move
  if (state.gameOver) {
    dispatcher.broadcastMessage(4, JSON.stringify({ error: "Game is over" }), null, null);
    return state;
  }

  if (state.currentPlayer !== userId) {
    dispatcher.broadcastMessage(4, JSON.stringify({ error: "Not your turn" }), null, null);
    return state;
  }

  if (position < 0 || position > 8 || state.board[position] !== null) {
    dispatcher.broadcastMessage(4, JSON.stringify({ error: "Invalid move" }), null, null);
    return state;
  }

  // Apply move
  state.board[position] = state.players[userId];
  state.moveCount++;

  // Check for winner
  const winner = checkWinner(state.board);
  if (winner) {
    state.winner = userId;
    state.gameOver = true;
    logger.info(`Player ${userId} wins!`);
  } else if (state.moveCount >= 9) {
    state.gameOver = true;
    state.winner = null; // Draw
    logger.info("Game is a draw");
  } else {
    // Switch turns
    const playerIds = Object.keys(state.players);
    state.currentPlayer = playerIds.find(id => id !== userId) || '';
  }

  // Broadcast updated state
  const stateJson = JSON.stringify(state);
  dispatcher.broadcastMessage(1, stateJson, null, null);

  return state;
}

// Check for winner
function checkWinner(board: (string | null)[]): boolean {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]              // Diagonals
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return true;
    }
  }

  return false;
}

// Reset game
function resetGame(state: TicTacToeState): TicTacToeState {
  state.board = Array(9).fill(null);
  state.winner = null;
  state.gameOver = false;
  state.moveCount = 0;
  
  // Switch who goes first
  const playerIds = Object.keys(state.players);
  state.currentPlayer = playerIds[Math.floor(Math.random() * playerIds.length)];
  
  return state;
}

// Match termination
const matchTerminate: nkruntime.MatchTerminateFunction<TicTacToeState> = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicTacToeState,
  graceSeconds: number
): { state: TicTacToeState } | null {
  
  logger.info("Match terminated");
  return { state };
};

// RPC to create a match
const rpcCreateMatch: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  
  const matchId = nk.matchCreate(moduleName, {});
  return JSON.stringify({ matchId });
};

// RPC to find available matches
const rpcFindMatch: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  
  const limit = 10;
  const isAuthoritative = true;
  const label = "";
  const minSize = 1;
  const maxSize = 2;
  const query = "+label.open:>=1";

  const matches = nk.matchList(limit, isAuthoritative, label, minSize, maxSize, query);
  
  if (matches.length > 0) {
    return JSON.stringify({ matchId: matches[0].matchId });
  }

  // No match found, create one
  const matchId = nk.matchCreate(moduleName, {});
  return JSON.stringify({ matchId });
};

// Initialize the module
function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
) {
  // Register match handler
  initializer.registerMatch(moduleName, {
    matchInit,
    matchJoinAttempt,
    matchJoin,
    matchLeave,
    matchLoop,
    matchTerminate
  });

  // Register RPC functions
  initializer.registerRpc("create_match", rpcCreateMatch);
  initializer.registerRpc("find_match", rpcFindMatch);

  logger.info("Tic-Tac-Toe module loaded");
}

// Required for Nakama
// @ts-ignore
!InitModule && InitModule.bind(null);