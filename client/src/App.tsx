import React, { useState, useEffect, useCallback } from 'react';
import { Client, Session, Socket } from '@heroiclabs/nakama-js';
import './App.css';
import confetti from 'canvas-confetti';

interface GameState {
  board: (string | null)[];
  currentPlayer: string;
  players: { [userId: string]: string };
  winner: string | null;
  gameOver: boolean;
  moveCount: number;
}

const App: React.FC = () => {
  const [client, setClient] = useState<Client | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [match, setMatch] = useState<any>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [username, setUsername] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mySymbol, setMySymbol] = useState<string>('');
  const [myUserId, setMyUserId] = useState<string>('');

  const playWinSound = () => {
    const audio = new Audio('/sounds/youWin.mp3');
    audio.volume = 0.5;
    audio.play().catch(err => console.log('Audio play failed:', err));
  };

  const playLoseSound = () => {
    const audio = new Audio('/sounds/youLost.mp3');
    audio.volume = 0.5;
    audio.play().catch(err => console.log('Audio play failed:', err));
  };

  // Fireworks effect
  const launchFireworks = () => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    
    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      const particleCount = 50;
      
      confetti({
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        zIndex: 9999,
        particleCount,
        origin: {
          x: randomInRange(0.1, 0.3),
          y: Math.random() - 0.2
        }
      });
      
      confetti({
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        zIndex: 9999,
        particleCount,
        origin: {
          x: randomInRange(0.7, 0.9),
          y: Math.random() - 0.2
        }
      });
    }, 250);
  };

  // Sad confetti for losing
  const sadConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#808080', '#404040', '#606060'],
      gravity: 2,
      scalar: 0.8
    });
  };

  // Initialize Nakama client
  useEffect(() => {
  const host = process.env.REACT_APP_NAKAMA_HOST || 'localhost';
  const port = process.env.REACT_APP_NAKAMA_PORT || '7350';
  const useSSL = process.env.REACT_APP_NAKAMA_SSL === 'true';
  
  console.log('Connecting to Nakama:', { host, port, useSSL });
  
  const nakamaClient = new Client('defaultkey', host, port, useSSL);
  setClient(nakamaClient);
}, []);

  // Connect and authenticate
  const connectToNakama = async () => {
    if (!client || !username) return;

    setIsConnecting(true);
    setError(null);

    try {
      const deviceId = `${username}-${crypto.randomUUID()}`;
      const newSession = await client.authenticateDevice(deviceId, true);
      setSession(newSession);
      setMyUserId(newSession.user_id || '');

      const newSocket = client.createSocket();
      await newSocket.connect(newSession, true);
      setSocket(newSocket);

      console.log('Connected to Nakama!');
    } catch (err) {
      setError(`Connection failed: ${err}`);
      console.error(err);
    } finally {
      setIsConnecting(false);
    }
  };

  // Find and join match
  const findMatch = async () => {
    if (!client || !session || !socket) return;

    setError(null);

    try {
      const result = await client.rpc(session, 'find_match', {});
      const data = JSON.parse(result.payload ? JSON.stringify(result.payload) : '{}');
      const matchId = data.matchId;

      console.log('Joining match:', matchId);

      const joinedMatch = await socket.joinMatch(matchId);
      setMatch(joinedMatch);

      console.log('Joined match successfully');
    } catch (err) {
      setError(`Failed to find match: ${err}`);
      console.error(err);
    }
  };

  // Setup socket listeners
  useEffect(() => {
    if (!socket) return;

    socket.onmatchdata = (matchData) => {
      const opCode = matchData.op_code;
      const data = JSON.parse(new TextDecoder().decode(matchData.data as ArrayBuffer));

      if (opCode === 1) {
        const prevGameState = gameState;
        setGameState(data);
        
        if (data.players && myUserId && data.players[myUserId]) {
          setMySymbol(data.players[myUserId]);
        }

        // Play sounds when game ends
        if (data.gameOver && (!prevGameState || !prevGameState.gameOver)) {
          if (data.winner === myUserId) {
            launchFireworks();
            playWinSound(); // You win sound
          } else if (data.winner) {
            sadConfetti();
            playLoseSound(); // You lose sound
          }
        }
      } else if (opCode === 4) {
        if (data.error) {
          setError(data.error);
          setTimeout(() => setError(null), 3000);
        }
      }
    };

    socket.onmatchpresence = (presenceEvent) => {
      console.log('Match presence event:', presenceEvent);
    };
  }, [socket, myUserId, gameState]);

  // Make a move
  const makeMove = useCallback((position: number) => {
    if (!socket || !match || !gameState) return;

    if (gameState.gameOver) return;
    if (gameState.currentPlayer !== myUserId) return;
    if (gameState.board[position] !== null) return;

    const moveData = JSON.stringify({ position });
    socket.sendMatchState(match.match_id, 2, moveData);
  }, [socket, match, gameState, myUserId]);

  // Reset game
  const resetGame = useCallback(() => {
    if (!socket || !match || !gameState) return;
    if (!gameState.gameOver) return;

    socket.sendMatchState(match.match_id, 3, '{}');
  }, [socket, match, gameState]);

  // Leave match
  const leaveMatch = () => {
    if (socket && match) {
      socket.leaveMatch(match.match_id);
      setMatch(null);
      setGameState(null);
      setMySymbol('');
    }
  };

  // Render game board
  const renderBoard = () => {
    if (!gameState) return null;

    return (
      <div className="board">
        {gameState.board.map((cell, index) => (
          <div
            key={index}
            className={`cell ${cell ? 'filled' : ''} ${
              gameState.currentPlayer === myUserId && !cell && !gameState.gameOver
                ? 'clickable'
                : ''
            }`}
            onClick={() => makeMove(index)}
          >
            {cell}
          </div>
        ))}
      </div>
    );
  };

  // Render game status
  const renderStatus = () => {
    if (!gameState) return null;

    const playerCount = Object.keys(gameState.players).length;

    if (playerCount < 2) {
      return <p className="status waiting">Waiting for opponent...</p>;
    }

    if (gameState.gameOver) {
      if (gameState.winner === myUserId) {
        return <p className="status win">🎉 You Won!</p>;
      } else if (gameState.winner) {
        return <p className="status lose">You Lost</p>;
      } else {
        return <p className="status draw">It's a Draw!</p>;
      }
    }

    if (gameState.currentPlayer === myUserId) {
      return <p className="status your-turn">Your Turn ({mySymbol})</p>;
    } else {
      return <p className="status opponent-turn">Opponent's Turn</p>;
    }
  };

  return (
    <div className="app">
      <h1>🎮 Tic-Tac-Toe</h1>

      {error && <div className="error">{error}</div>}

      {!session ? (
        <div className="login-container">
          <h2>Enter Your Name</h2>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && connectToNakama()}
          />
          <button onClick={connectToNakama} disabled={isConnecting || !username}>
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      ) : !match ? (
        <div className="matchmaking-container">
          <h2>Welcome, {username}!</h2>
          <button onClick={findMatch} className="primary-button">
            Find Match
          </button>
        </div>
      ) : (
        <div className="game-container">
          {renderStatus()}
          {renderBoard()}
          <div className="game-controls">
            {gameState?.gameOver && (
              <button onClick={resetGame} className="secondary-button">
                Play Again
              </button>
            )}
            <button onClick={leaveMatch} className="danger-button">
              Leave Match
            </button>
          </div>
          <div className="player-info">
            <p>You are playing as: <strong>{mySymbol}</strong></p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;