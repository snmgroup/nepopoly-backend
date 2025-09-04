// import { supabaseAdmin } from './supabaseClient';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { BotPlayer } from '../bot/botManager';
import { bots, setBotMetadata } from '../bot/botMetadataManager';
import { BOT_NAMES } from '../bot/botNames';
import { SocketEvent } from '../enums/SocketEventNames';
import { gameEventsKey, gameKey, redis } from '../redis/redis';
import { BOARD, CHANCE_CARDS, COMMUNITY_CHEST_CARDS, GAME_SETTINGS, GameState, PlayerAsset, PlayerState } from '../types';
import { getAvailableColor, } from './gameManager';
// import { supabaseAdmin } from './supabaseClient';


export function createPlayerState({
  id,
  name,
  userId,
  isBot = false,
  money = GAME_SETTINGS.initialPlayerMoney,
  position = 0,
  lastActive = new Date().toISOString(),
  color = null,
}: Partial<PlayerState>): PlayerState {
  return {
    id: id!,
    userId,
    name: name!,
    money,
    position,
    properties: [],
    inJail: false,
    isBot,
    jailTurns: 0,
    isConnected: true,
    order: 0,
    status: 'active',
    lastRollWasDouble: false,
    consecutiveDoubles: 0,
    getOutOfJailFreeCards: 0,
    lastActive,
    color: color,
    socketId:null,
    assets: {
      properties: 0,
      houses: 0,
      utilities: 0,
      routes: 0,
      totalValue: 0,
    },
  };
}

const localCache = new Map<string, GameState>();

export async function loadGameState(gameId:string): Promise<GameState|null> {
  // Try Redis
  try {
    const raw = await redis.get(gameKey(gameId));
   
    if (raw) {
      const state = JSON.parse(raw) as GameState;
      localCache.set(gameId, state);
      return state;
    }
  } catch (e) {
    console.warn('Redis load failed, using local cache');
  }
  return localCache.get(gameId) || null;
}


export async function loadGameEvents(gameId:string): Promise<{}[]> {
  // Try Redis
  try {
    const raw = await redis.get(gameEventsKey(gameId));
   
    if (raw) {
      const events = JSON.parse(raw) as [];
      // localCache.set(gameId, state);
      return events;
    }
  } catch (e) {
    console.warn('Redis load failed, using local cache');
    
  }
 return []
}

export async function addToEvents(gameId:string,event:{}){
    // const events = await loadGameEvents(gameId)
    // events.push(event)
    // await saveGameEvents(gameId,events)
    // return events
}

export async function saveGameEvents(gameId:string, events:{}[]) {
  try {
    await redis.set(gameEventsKey(gameId), JSON.stringify(events));
  } catch (e: unknown) {
    console.warn('Redis save failed, storing locally');
   
  }
}

export async function saveGameState(gameId:string, state:GameState) {
  try {
    const stateToSave = {
      ...state,
      eventLog: state.eventLog.slice(-10),
    };
    await redis.set(gameKey(gameId), JSON.stringify(stateToSave));
  } catch (e: unknown) {
    console.warn('Redis save failed, storing locally');
    localCache.set(gameId, state);
  }
  // Persist snapshot to Supabase asynchronously (best-effort)
  // supabaseAdmin.from('game_state_snapshots').insert({
  //   game_id: gameId,
  //   state: state,
  // }).then(({ error }) => {
  //   if (error) {
  //     console.warn('Supabase snapshot failed', error.message);
  //   }
  // });
}

export async function createGame(initialState: Partial<GameState>): Promise<GameState> {
  const id = uuidv4();
  const state: GameState = {
    gameId: initialState.gameId|| id,
    players: {},
    order: [],
    turn: '',
    phase: 'before_roll',
    propertyStates: {},
    deck: { chance: [], community: [] },
    eventLog: [],
    status:'lobby',
    turnNumber: 0,
    // Initialize turnNumber
    ...initialState,
  };
  await saveGameState(state.gameId, state);
  // insert games table row
  // await supabaseAdmin.from('games').insert({ id, status: 'lobby', settings: {} });
  return state;
}



export async function startGame(gameId: string,io:Server, gameState?:GameState, skipInitialization: boolean = false,isSimulation?:boolean,) {
    const state = gameState || await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
    // let p1
    if (Object.keys(state.players).length < 2) {
      throw new Error('Need at least 2 players to start the game.');
    }
    
    if (!skipInitialization) { // Only initialize if not skipping
        // Set initial money for all players
        for (const playerId in state.players) {
          // if(playerId!==state.host)
          //   p1=playerId
          state.players[playerId].money = GAME_SETTINGS.initialPlayerMoney; // Standard Monopoly starting money
          state.players[playerId].position = 1; // Start at Go
          state.players[playerId].inJail = false;
          state.players[playerId].jailTurns = 0;
          state.players[playerId].properties = [];
          state.players[playerId].lastRollWasDouble = false;
          state.players[playerId].consecutiveDoubles = 0;
          state.players[playerId].getOutOfJailFreeCards = 0; // Initialize GOOJF cards
          state.players[playerId].status = 'active';
          state.players[playerId].assets = {properties:0,houses:0,utilities:0,routes:0,totalValue:0} as PlayerAsset;
        }

        // Shuffle player order
        for (let i = state.order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
        }

        // Initialize property states (all unowned, level 0, not mortgaged)
        state.propertyStates = {};
        BOARD.forEach(tile => {
          if (tile.type === 'property' || tile.type === 'route' || tile.type === 'utility') {
            state.propertyStates[tile.id] = { owner: undefined, level: 0, mortgaged: false };
          }
        });

        // Shuffle chance and community chest decks
        state.deck.chance = CHANCE_CARDS.map(c => c.id);
        for (let i = state.deck.chance.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [state.deck.chance[i], state.deck.chance[j]] = [state.deck.chance[j], state.deck.chance[i]];
        }

        state.deck.community = COMMUNITY_CHEST_CARDS.map(c => c.id);
        for (let i = state.deck.community.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [state.deck.community[i], state.deck.community[j]] = [state.deck.community[j], state.deck.community[i]];
        }
    }
    
    state.turn = state.order[0]; // Set the first player's ID as the current turn
    state.phase = 'before_roll'; // Initial phase for the first player to roll
    state.status='active';
    state.eventLog.push({ type: 'GAME_STARTED', ts: new Date().toISOString() });
    state.turnNumber = 0;
    state.isSimulation = isSimulation;


    
  //  BOARD.forEach((tile)=>{
  //   if(tile.type==="property")
  //   {
  //    state.propertyStates[tile.id]={
  //       owner:state.host,level:5
  //     }
  //     state.players[state.host!].properties.push(tile.id)
  //   }
 
  //  })

 
  //  state.propertyStates[40] ={owner:p1,level:5},
  //  state.propertyStates[38] ={owner:p1,level:5}

  //  state.players[p1!].properties.push(38)
  //  state.players[p1!].properties.push(40)

    //
    await saveGameState(gameId, state);

    const stateSize = Buffer.byteLength(JSON.stringify(state));
    console.log("String size:",stateSize, "bytes");



      // console.log()
            io.to(gameId).emit(SocketEvent.GameEvents, {type:"GAME_STARTED",ts:new Date().toISOString()});

            const {eventLog,...newState}=state;
             io.to(gameId).emit(SocketEvent.GameStateUpdate,newState );
    const currentPlayerId = state.turn;
    const currentPlayer = state.players[currentPlayerId];
    if (currentPlayer && currentPlayer.isBot) {
        const bot = bots.get(currentPlayerId);
        if (bot) {
            await bot.takeTurn(state);
        }
    }

    // // --- SCHEDULE INITIAL TURN TIMER JOB ---
    // const turnTimeLimit = GAME_SETTINGS.turnTimeLimit;
    // const initialTurnJobId = `turn-timer-${gameId}-${state.turn}`;
    // await gameQueue.add(Jobs.TurnTimerExpired, {
    //     gameId: gameId,
    //     playerId: state.turn,
    // }, {
    //     delay: turnTimeLimit,
    //     jobId: initialTurnJobId,
    // });
    // // --- END SCHEDULE ---
    
    return state;
}
   
export async function addPlayer(gameId:string, player: PlayerState) {
    const state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
const event = { type: 'PLAYER_JOINED', player:player.name}
    if(state.players[player.id])
      return {state,event}
    // Initialize new player properties
    player.lastRollWasDouble = false;
    player.consecutiveDoubles = 0;
    player.getOutOfJailFreeCards = 0;
    player.inJail = false;
    player.jailTurns = 0;
    player.properties = [];
    player.status = 'active';
    player.color =getAvailableColor(state)

    state.players[player.id] = player;
    if(!state.order.includes(player.id))
    state.order.push(player.id);

  state.eventLog.push(event)
    await saveGameState(gameId, state);
    await addToEvents(gameId,event)
    // Set player's current game in Redis
    await redis.set(`player:${player.id}:current_game`, gameId);
    // await supabaseAdmin.from('players').insert({
    //   id: player.id,
    //   game_id: gameId,
    //   user_id: player.userId || null,
    //   name: player.name,
    //   position: player.position,
    //   money: player.money,
    // });
    return {state,event};
}

export async function addBot(gameId:string, io: Server,id?:string) {
    const state = await loadGameState(gameId);
 
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
    if (state.status !== 'lobby') {
      throw new Error('Cannot add a bot to a game that is already in progress.');
    }

    const existingNames = Object.values(state.players).map(p => p.name);
    const availableNames = BOT_NAMES.filter(n => !existingNames.includes(n));
    if (availableNames.length === 0) {
      throw new Error('No more available bot names.');
    }
    const name = availableNames[Math.floor(Math.random() * availableNames.length)];

    const botId = id || uuidv4();
    const player = createPlayerState({id: botId, name: name, isBot: true, position: 1, money: GAME_SETTINGS.initialPlayerMoney, lastActive: new Date().toISOString(), color: getAvailableColor(state)});

    state.players[player.id] = player;
    state.order.push(player.id);
    const event = {type:"PLAYER_JOINED",player:player.name}
    state.eventLog.push(event)
    await saveGameState(gameId, state);
     await addToEvents(gameId,event)
    // await supabaseAdmin.from('players').insert({
    //   id: player.id,
    //   game_id: gameId,
    //   user_id: null,
    //   name: player.name,
    //   position: player.position,
    //   money: player.money,
    // });
    const bot = new BotPlayer(player.id, gameId, io, GAME_SETTINGS.botDifficulty);
    bots.set(player.id, bot);
    // Save bot metadata to Redis for persistence
    await setBotMetadata(gameId, player.id, {
        playerId: player.id,
        gameId: gameId,
        botDifficulty: GAME_SETTINGS.botDifficulty // Assuming botDifficulty is part of GAME_SETTINGS
    });
    return {state,event,bot};
}

export async function setPlayerConnected(gameId:string, playerId:string, socketId?:string|null, connected=true) {
    const state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
    const p = state.players[playerId];
    if (!p) return null;
    p.socketId = socketId || null;
    p.isConnected = connected;
    p.lastActive = new Date().toISOString();
    await saveGameState(gameId, state);
    // await supabaseAdmin.from('players').update({ is_connected: connected, last_active: new Date().toISOString() }).eq('id', playerId);
    return p;
}