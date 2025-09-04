import { Server } from 'socket.io';
import { DoctorBot } from '../bot/doctorBot';
import { SocketEvent } from '../enums/SocketEventNames';
import { handleEndTurn } from './gameActions';
import { loadGameState, saveGameState } from './gameState';
import { GameState, PlayerState } from '../types'; // Import GameState and PlayerState
// import { addStatsSnapshot } from './statsManager';

import { bots } from '../bot/botMetadataManager';
import { Jobs } from '../enums/jobNames';
import { gameQueue } from '../jobs/jobs';
import { gameKey, redis } from '../redis/redis'; // Added for Redis operations





// New function to load all bots from Redis on server startup


export * from './gameActions';
export * from './gameState';
const doctorBot = new DoctorBot()
async function runDoctorBot(state: GameState,) {[[]]
 if (state.isSimulation) {
     doctorBot.checkGameState(state);
}
}

export async function endTurn(gameId: string, playerId: string, io: Server, socket?: any ,) {
   
const state = await handleEndTurn(gameId, playerId,io);




    if ('error' in state!) {
    console.log(state.error)
    if (socket) {
      socket.emit('error', { message: state.error });
    }
    return;
  }
 await runDoctorBot(state,);

  // Record player stats for this turn
  state.turnNumber = (state.turnNumber || 0) + 1;
  
  await saveGameState(gameId, state);


  const {turn,phase,status,players,propertyStates,order} = state
  io.to(gameId).emit(SocketEvent.GameStateUpdate, {turn,phase,status});

  const canBeJailedPlayer = state.players[state.turn];
  if (!canBeJailedPlayer.isBot && canBeJailedPlayer.inJail) {
    const socketId = canBeJailedPlayer.socketId;
    if (socketId) {
      io.to(socketId).emit(SocketEvent.GameEvents, {
        type:"IN_JAIL_NOTIF",
        playerId: canBeJailedPlayer.id,
        canUseCard: canBeJailedPlayer.getOutOfJailFreeCards > 0,
      });
    }
  }
  // io.to(gameId).emit(SocketEvent.GameStateUpdate, {turnIndex,phase,status,players,propertyStates});

  
await  gameQueue.add(Jobs.CalculateStats,{gameId},{
    delay:100
  })

  if(state.order.length>1){
  const nextPlayerId = state.turn;
  const nextPlayer = state.players[nextPlayerId];
  if (nextPlayer && nextPlayer.isBot) {
    const bot = bots.get(nextPlayerId);
    if (bot) {
      await bot.takeTurn(state);
    }
    else{
      console.log("bot issue here")
    }
  }


  }

}

// --- Color Management ---
const COLORS = [
  '#C00000', // Red
  '#0000C0', // Blue
  '#006000', // Green
  '#C0C000', // Yellow
  '#600060', // Purple
  '#C08000', // Orange
  '#C09090', // Pink
  '#006060', // Teal
  '#00C0C0', // Cyan
  '#C000C0', // Magenta
  '#00C000', // Lime
  '#802020', // Brown
];

export function getAvailableColor(gameState: GameState): string | null {
  const usedColors = new Set<string>();
  for (const playerId in gameState.players) {
    if (gameState.players.hasOwnProperty(playerId)) {
      const player = gameState.players[playerId];
      if (player.color) { // Check if player has a color assigned
        usedColors.add(player.color);
      }
    }
  }

  const availableColors = COLORS.filter(color => !usedColors.has(color));

  if (availableColors.length > 0) {
    const randomIndex = Math.floor(Math.random() * availableColors.length);
    return availableColors[randomIndex];
  }

  return null; // No colors available
}

export async function getAvailableGames(): Promise<GameState[]> {

  const gameKeys = await redis.keys('game:*');
  const games: GameState[] = [];
  for (const key of gameKeys) {
    const gameId = key.replace('game:', ''); // Extract gameId from key
    const game=await getGame(gameId)
    if(game && game.status === 'lobby' && Object.keys(game.players).length < 4)
    { 
      games.push(game)
      break
    }
     
  }
  return games;

}

export async function getSuitableGame(playerId:string): Promise<GameState|undefined> {

    const game =await getActiveGame(playerId)

    if(game)
      return game
      const games = await getAvailableGames()
      if(games && games.length>0){
          return games[0]
      }

}


export async function getGame(gameId:string): Promise<GameState|undefined> {
   const gameData = await redis.get(`game:${gameId}`);
    if (gameData) {
      const game = JSON.parse(gameData) as GameState;

       return game
    
    }
    return undefined 
}


export async function getActiveGame(playerId:string): Promise<GameState|undefined> {
  const activeGame=  await redis.get(`player:${playerId}:current_game`);
  if(activeGame)
  {
    const game = await getGame(activeGame)
    if(game && game.status === 'active' && game.phase!=='game_over')
    return game // Corrected: return game
  }
  return undefined; // Ensure a return value if no active game is found
}

export async function clearAllGames(){
  const gameKeys = await redis.keys('game:*');
  const tradeKeys = await redis.keys('trade:*');
  const eventsKeys = await redis.keys('events:*');
  const playerKeys = await redis.keys('player::*');
  const metaKeys = await redis.keys('bot_metadata::*');
  // const locKeys = await redis.keys('events:*');

  for (const key of gameKeys) {
  await redis.del(key);
  }
  for (const key of tradeKeys) {
  await redis.del(key);
  }
  for (const key of eventsKeys) {
  await redis.del(key);
  }
  for (const key of playerKeys) {
  await redis.del(key);
  }
  for (const key of metaKeys) {
  await redis.del(key);
  }
  console.info("all keys cleared")
 // Clear the in-memory bots map
}

export async function joinGame(gameId: string, player: PlayerState): Promise<GameState> {
  const key = gameKey(gameId);
  const gameData = await redis.get(key);
  if (!gameData) {
    throw new Error('Game not found');
  }
  const gameState = JSON.parse(gameData) as GameState;

  if (Object.keys(gameState.players).length >= 4) {
    throw new Error('Game is full');
  }

  if (gameState.status !== 'lobby') {
    throw new Error('Game has already started');
  }

  if (!gameState.order.includes(player.id)) {
    player.color=  gameState.players[player.id].color
    gameState.players[player.id] = player;
    gameState.order.push(player.id);
  } else {
    player.color=  gameState.players[player.id].color
    // If player already exists in order, just update their state (e.g., if they reconnected)
    gameState.players[player.id] = player;
  }

  await redis.set(key, JSON.stringify(gameState));

  return gameState;
}



export async function delay(delay?:number){
  if(!delay)
   delay = Math.floor(Math.random() * 1000) + 1000; // 1-2 seconds
    await new Promise(resolve => setTimeout(resolve, delay));
}

export async function dispatchGameEventToBotResponder(
    io: Server,
    gameId: string,
    event: any, // The game event object
    responderId: string // The ID of the potential bot responder
) {
    try {
        // Broadcast the event to all clients in the room
        // io.to(gameId).emit(SocketEvent.GameEvents, event);

        // Check if the responder is a bot and call handleGameEvent
        const gameState = await loadGameState(gameId);
        if (gameState && gameState.players[responderId] && gameState.players[responderId].isBot) {
            const bot = bots.get(responderId);
            if (bot) {
                await bot.handleGameEvent(event, gameState);
            }
        }
    } catch (error) {
        console.error('Error dispatching game event to bot responder:', error);
    }
}

