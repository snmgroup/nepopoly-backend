import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import { bots, deleteBotMetadata } from '../bot/botMetadataManager';
import { Jobs } from '../enums/jobNames';
import { SocketEvent } from '../enums/SocketEventNames';
import { endTurn } from './gameManager';
import { addToEvents, loadGameState, saveGameState } from './gameState';
import { botDelay, getErrorMessage } from '../utils/helpers';
import { addTurnExpiryJob, gameQueue } from '../jobs/jobs';
import { redis } from '../redis/redis';
import { acquireLock, releaseLock } from '../redis/redisLock';
import { addStatsSnapshot, deleteGameStats, getGameStats } from './statsManager';
import { BOARD, BoardTile, CardType, CHANCE_CARDS, ChanceCard, COMMUNITY_CHEST_CARDS, CommunityChestCard, GAME_SETTINGS, GameState, GameStateUpdate, PlayerState, PlayerStatsSnapshot, Trade, TradeOffer } from '../types';

// Helper to get all properties in a group
function getPropertiesInGroup(group: string): BoardTile[] {
  return BOARD.filter(tile => tile.group === group && tile.type === 'property');
}

// Helper to calculate rent
function calculateRent(state: GameState, tile: BoardTile, diceRoll: number): number {
  const propertyState = state.propertyStates[tile.id]; // Get property state

  if (!propertyState || !propertyState.owner) return 0; // Use propertyState.owner
  if (propertyState.mortgaged) return 0; // Use propertyState.mortgaged

  const ownerPlayer = state.players[propertyState.owner]; // Use propertyState.owner
  if (!ownerPlayer) return 0; // Owner not found

  if (tile.type === 'property') {
    if (propertyState && propertyState.level > 0 && tile.rent) {
      return tile.rent[propertyState.level - 1]; // Rent with houses/hotel
    }

    // Check for monopoly
    const groupProperties = getPropertiesInGroup(tile.group!);
    const ownerPropertiesInGroup = groupProperties.filter(p => state.propertyStates[p.id]?.owner === propertyState.owner); // Use propertyState.owner
    if (ownerPropertiesInGroup.length === groupProperties.length) {
      // Monopoly - rent is doubled if no houses
      return (tile.baseRent || 0) * 2;
    }
    return tile.baseRent || 0;
  } else if (tile.type === 'route') {
    const ownedRoutes = BOARD.filter(t => t.type === 'route' && state.propertyStates[t.id]?.owner === propertyState.owner); // Use propertyState.owner
    return tile.baseRent! * ownedRoutes.length // 25, 50, 100, 200
    // return tile.baseRent! *(ownedRoutes.length===1?1: (2 * (ownedRoutes.length-1))); // 25, 50, 100, 200
  } else if (tile.type === 'utility') {
    const ownedUtilities = BOARD.filter(t => t.type === 'utility' && state.propertyStates[t.id]?.owner === propertyState.owner); // Use propertyState.owner
    if (ownedUtilities.length === 1) {
      return diceRoll * 40 ;
    } else if (ownedUtilities.length === 2) {
      return diceRoll * 100;
    }
  }
  return 0;
}

// Function to handle buying a property
export async function buyProperty(gameId: string, playerId: string, tileId: number,io:Server) {
  await acquireLock(gameId);
  try {
    const state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
      // console.log(state.phase)
    const player = state.players[playerId];
    const tile = BOARD[tileId - 1];

    if (!player || !tile || !tile.cost || tile.type === 'start' || tile.type === 'jail' || tile.type === 'festival' || tile.type === 'go_to_jail' || tile.type === 'chance' || tile.type === 'community') {
      throw new Error('Invalid property to buy.');
    }

    const propertyState = state.propertyStates[tileId];
    if (propertyState && propertyState.owner) {
      throw new Error('Property already owned.');
    }

    if (player.money < tile.cost) {
      throw new Error('Insufficient funds to buy property.');
    }

    player.money -= tile.cost;
    player.properties.push(tileId);
    state.propertyStates[tileId] = { owner: playerId, level: 0, mortgaged: false };
    updatePlayerAssets(player, state.propertyStates);

    const event = { type: 'BUY_PROPERTY', playerId, tileId, cost: tile.cost, ts: new Date().toISOString() };
  state.eventLog.push(event)
addToEvents(gameId,event);

     // Return to after_roll phase after buying

    await saveGameState(gameId, state);
       io.to(gameId).emit(SocketEvent.GameEvents,event)
    addToEvents(gameId,state)
    return {state};
  } 
  
  finally {
    await releaseLock(gameId);
  }
}

// Function to handle building a house/hotel
export async function buildHouse(gameId: string, playerId: string, tileId: number,io:Server) {
  await acquireLock(gameId);
  try {
    const state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
    const player = state.players[playerId];
    const tile = BOARD[tileId - 1];

    if (!player || !tile || tile.type !== 'property' || !tile.group || !tile.houseCost) {
      throw new Error('Invalid property for building.');
    }

    const propertyState = state.propertyStates[tileId];
    if (!propertyState || propertyState.owner !== playerId) {
      throw new Error('Player does not own this property.');
    }

    // Check for monopoly
    const groupProperties = getPropertiesInGroup(tile.group);
    const ownerPropertiesInGroup = groupProperties.filter(p => state.propertyStates[p.id]?.owner === playerId);
    if (ownerPropertiesInGroup.length !== groupProperties.length) {
      throw new Error('Player does not own all properties in this group (no monopoly).');
    }

    // Check house limits
    if (propertyState.level >= 5) { // 4 houses + 1 hotel
      throw new Error('Property already has maximum development.');
    }

    // Check money
    if (player.money < tile.houseCost) {
      throw new Error('Insufficient funds to build house/hotel.');
    }
    if(player.isBot)
 await botDelay(state.isSimulation);
    player.money -= tile.houseCost;
    propertyState.level += 1;
    updatePlayerAssets(player, state.propertyStates);
    const event = { type: 'BUILD_HOUSE', playerId, tileId, level: propertyState.level, cost: tile.houseCost, ts: new Date().toISOString() }
    io.to(gameId).emit(SocketEvent.GameEvents,event)
    state.eventLog.push(event)
addToEvents(gameId,event);
    await saveGameState(gameId, state);
    return {state};
  } finally {
    await releaseLock(gameId);
  }
}

// Function to handle selling a house/hotel
export async function sellHouse(gameId: string, playerId: string, tileId: number,io:Server,gameState?:GameState) {

    
    let state = gameState ||  await loadGameState(gameId);
         
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }

    const player = state.players[playerId];
    const tile = BOARD[tileId -1];

    if (!player || !tile || tile.type !== 'property' || !tile.group || !tile.houseCost) {
      throw new Error('Invalid property for selling house.');
    }

    const propertyState = state.propertyStates[tile.id];
    if (!propertyState || propertyState.owner !== playerId) {
      throw new Error('Player does not own this property.');
    }

    if (propertyState.level <= 0) {
      throw new Error('No houses/hotels to sell on this property.');
    }
     
    const refund = tile.houseCost / 2;
   state.players[playerId].money += refund;
   state.propertyStates[tile.id].level -= 1;
   updatePlayerAssets(player, state.propertyStates);

       const event = { type: 'SELL_HOUSE', playerId, tileId, level: propertyState.level, refund, ts: new Date().toISOString() }
          io.to(gameId).emit(SocketEvent.GameEvents,event)


    state!.eventLog.push(event);
      if(player.isBot)
      await botDelay(state.isSimulation);
      state =  await checkAndSettleDebt(gameId, playerId, state,io);

    
    await saveGameState(gameId, state!);

    return {state,event};

  

}

// Function to handle mortgaging a property
export async function mortgageProperty(gameId: string, playerId: string, tileId: number,io:Server) {
  await acquireLock(gameId);
  try {
    const state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
    const player = state.players[playerId];
    const tile = BOARD[tileId - 1];

    if (!player || !tile || (tile.type !== 'property' && tile.type !== 'route' && tile.type !== 'utility')) {
      throw new Error('Invalid tile for mortgaging.');
    }

    const propertyState = state.propertyStates[tileId];
    if (!propertyState || propertyState.owner !== playerId) {
      throw new Error('Player does not own this property.');
    }
    if (propertyState.mortgaged) {
      throw new Error('Property is already mortgaged.');
    }
    if (propertyState.level > 0) {
      throw new Error('Cannot mortgage property with houses/hotels. Sell them first.');
    }

    const mortgageValue = tile.mortgageValue || (tile.cost! / 2);
    player.money += mortgageValue;
    propertyState.mortgaged = true;
    updatePlayerAssets(player, state.propertyStates);

    if (!player.isBot) { // Add this condition
        await checkAndSettleDebt(gameId, playerId, state,io);
    }
    const event = { type: 'MORTGAGE_PROPERTY', playerId, tileId, amount: mortgageValue, ts: new Date().toISOString() }
    state.eventLog.push(event)
addToEvents(gameId,event);
        io.to(gameId).emit(SocketEvent.GameEvents,event)

    await saveGameState(gameId, state);
    return state;
  } finally {
    await releaseLock(gameId);
  }
}

// Function to handle selling a property to the bank
export async function sellPropertyToBank(gameId: string, playerId: string, tileId: number,io:Server,gameState?:GameState) {
  // await acquireLock(gameId);
  try {
    let state = gameState ||await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
    const player = state.players[playerId];
    const tile = BOARD[tileId - 1];

//     process.stdout.write(`
// [sellPropertyToBank] Player ${playerId} money before sale: ${player.money}`);

    if (!player || !tile || (tile.type !== 'property' && tile.type !== 'route' && tile.type !== 'utility')) {
      throw new Error('Invalid tile for selling to bank.');
    }

    const propertyState = state.propertyStates[tileId];
    if (!propertyState || propertyState.owner !== playerId) {
      throw new Error('Player does not own this property.');
    }
    if (propertyState.level > 0) {
      throw new Error('Cannot sell property with houses/hotels. Sell them first.');
    }

    const salePrice = tile.cost! / 2; // Sell for half the original cost
    player.money += salePrice;
//     process.stdout.write(`
// [sellPropertyToBank] Player ${playerId} money after sale: ${player.money}`);

    // Remove property from player's ownership
    player.properties = player.properties.filter(id => id !== tileId);
    delete state.propertyStates[tileId]; // Property becomes unowned
    if(player.isBot)
     await botDelay(state.isSimulation);
    updatePlayerAssets(player, state.propertyStates);
    // if (!isBot) { // Add this condition
    const st= await checkAndSettleDebt(gameId, playerId, state,io);
      // if(st)
      // state =st
    // }
      st.phase = "after_roll"
      const event ={ type: 'SELL_PROPERTY_TO_BANK', playerId, tileId, amount: salePrice, ts: new Date().toISOString() }
              io.to(gameId).emit(SocketEvent.GameEvents,event)
 
    st.eventLog.push(event);
    await saveGameState(gameId, st);
    return {state:st,event};
  } finally {
    // await releaseLock(gameId);
  }
}

// Function to handle unmortgaging a property
export async function unmortgageProperty(gameId: string, playerId: string, tileId: number,io:Server) {
  await acquireLock(gameId);
  try {
    const state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
    const player = state.players[playerId];
    const tile = BOARD[tileId - 1];

    if (!player || !tile || (tile.type !== 'property' && tile.type !== 'route' && tile.type !== 'utility')) {
      throw new Error('Invalid tile for unmortgaging.');
    }

    const propertyState = state.propertyStates[tileId];
    if (!propertyState || propertyState.owner !== playerId) {
      throw new Error('Player does not own this property.');
    }
    if (!propertyState.mortgaged) {
      throw new Error('Property is not mortgaged.');
    }

    const unmortgageCost = Math.ceil((tile.mortgageValue || (tile.cost! / 2)) * (1 + GAME_SETTINGS.unmortgageInterestRate));
    if (player.money < unmortgageCost) {
      throw new Error('Insufficient funds to unmortgage property.');
    }

    player.money -= unmortgageCost;
    propertyState.mortgaged = false;
    updatePlayerAssets(player, state.propertyStates);
    await checkAndSettleDebt(gameId, playerId, state,io);

    const event = { type: 'UNMORTGAGE_PROPERTY', playerId, tileId, amount: unmortgageCost, ts: new Date().toISOString() }
            io.to(gameId).emit(SocketEvent.GameEvents,event)

    state.eventLog.push();
    await saveGameState(gameId, state);
    return state;
  } finally {
    await releaseLock(gameId);
  }
}

// Function to pay bail to get out of jail
export async function payBail(gameId: string, playerId: string,io:Server) {
  await acquireLock(gameId);
  try {
    const state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
    const player = state.players[playerId];
    const BAIL_AMOUNT = GAME_SETTINGS.bailAmount;

    if (!player.inJail) {
      throw new Error('Player is not in jail.');
    }
    if (player.money < BAIL_AMOUNT) {
      throw new Error('Insufficient funds to pay bail.');
    }
    if(player.isBot)
 await botDelay(state.isSimulation,600);
    player.money -= BAIL_AMOUNT;
    player.inJail = false;
    player.jailTurns = 0;
    await checkAndSettleDebt(gameId, playerId, state,io);

    const event = { type: 'PAY_BAIL', playerId, amount: BAIL_AMOUNT, ts: new Date().toISOString() }
                io.to(gameId).emit(SocketEvent.GameEvents,event)

    state.eventLog.push(event)
addToEvents(gameId,event);
    await saveGameState(gameId, state);
    return state;
  } finally {
    await releaseLock(gameId);
  }
}

// Function to roll dice to get out of jail
export async function rollForJail(gameId:string, playerId: string,state:GameState,io: Server) {


     

    const player = state.players[playerId];
    let event
    if (!player.inJail) {
      throw new Error('Player is not in jail.');
    }
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;

      io.to(gameId).emit(SocketEvent.GameStateUpdate,{phase:"roll_done"}as Partial<GameStateUpdate>)
    if (d1 === d2) {
      player.inJail = false;
      player.jailTurns = 0;
      event = { type: 'ROLLED_DOUBLES_OUT_OF_JAIL', playerId, d1, d2, ts: new Date().toISOString() }
  
      
      
      
    } else {
      player.jailTurns += 1;
      

      if (player.jailTurns >= 3) {
        player.inJail = false;
          player.jailTurns = 0;
          event = { type: 'FORCED_USE_GOOJF_CARD', playerId, ts: new Date().toISOString() }
      
      } else {
        if(player.isBot)
        {
    const bot =bots.get(player.id)
           if(bot){
                 if (player.getOutOfJailFreeCards > 0) {
          player.getOutOfJailFreeCards -= 1;
          player.inJail = false;
          player.jailTurns = 0;
          event = { type: 'FORCED_USE_GOOJF_CARD', playerId, ts: new Date().toISOString() }
       
        } else if (player.money >= GAME_SETTINGS.bailAmount) {
          player.money -= GAME_SETTINGS.bailAmount;
          player.inJail = false;
          player.jailTurns = 0;
          event = { type: 'FORCED_PAY_BAIL', playerId, amount: GAME_SETTINGS.bailAmount, ts: new Date().toISOString() }
        // return {events: state.eventLog.slice(initialEventLogLength) };
          
        } else {
          // Player cannot pay bail or use GOOJF card, goes bankrupt
          if(player.money<=0)
          {
            event = { type: 'FORCED_BANKRUPTCY_IN_JAIL', playerId, ts: new Date().toISOString() }
  state= await bot.handleBankruptcy(player,state,GAME_SETTINGS.bailAmount)
          }
          else{
            event={ type: 'ROLLED_NO_DOUBLES_IN_JAIL', playerId, d1, d2, jailTurns: player.jailTurns, ts: new Date().toISOString() }
          }
        
        
         
          
        }
           }
        }
        else{
           event={ type: 'ROLLED_NO_DOUBLES_IN_JAIL', playerId, d1, d2, jailTurns: player.jailTurns, ts: new Date().toISOString() }
    
        }
     
    
       
      }
    }
      state.eventLog.push(event)
addToEvents(gameId,event!);
    await saveGameState(gameId,state)
    
                    io.to(gameId).emit(SocketEvent.GameEvents,event)

 return {events:[event]}
  
  
}

// Function to use a Get Out of Jail Free card
export async function useGetOutOfJailFreeCard(gameId: string, playerId: string,io:Server) {
  await acquireLock(gameId);
  try {
    const state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
    const player = state.players[playerId];

    if (!player.inJail) {
      throw new Error('Player is not in jail.');
    }
    if (player.getOutOfJailFreeCards <= 0) {
      throw new Error('Player does not have a Get Out of Jail Free card.');
    }

    player.getOutOfJailFreeCards -= 1;
    player.inJail = false;
    player.jailTurns = 0;
    const event = { type: 'USE_GOOJF_CARD', playerId, ts: new Date().toISOString() }
    state.eventLog.push(event)
addToEvents(gameId,event);
            io.to(gameId).emit(SocketEvent.GameEvents,event);

    await saveGameState(gameId, state);
    return state;
  } finally {
    await releaseLock(gameId);
  }
}

// Helper function toply card effects
export async function applyCardEffect(gameId: string, state: GameState, playerId: string, card: ChanceCard | CommunityChestCard,io:Server) {
  const player = state.players[playerId];
  const players =Object.keys(state.players).length
  if (!player) return;


   await botDelay(state.isSimulation,510);
  switch (card.type) {
    case CardType.Money:
      let amount = (card.allPlayer? card.amount*(players-1):card.amount)
      player.money += amount;
      if(card.allPlayer)
      {
        Object.values(state.players).forEach((pl)=>{
          if(pl.id!==playerId)
          pl.money += -card.amount
        })
      }
      state = await botBankRuptcyHelper(player,state)
      const event = { type: 'CARD_MONEY_EFFECT', playerId, amount: amount, eachAmount:card.allPlayer? -card.amount:null, description: card.description, ts: new Date().toISOString() }
      state.eventLog.push(event)
addToEvents(gameId,event);
            io.to(gameId).emit(SocketEvent.GameEvents,event)

      break;
    case CardType.Move:
      const oldPosition = player.position;
      let newPosition = oldPosition;
      if (card.destination) {
        newPosition = card.destination;
        // Check if passed Go
        if (card.collectGo && newPosition < oldPosition) {
          player.money += GAME_SETTINGS.passGoAmount + (card.destination===1?1000:0);
          const event = { type: 'PASS_GO', playerId, ts: new Date().toISOString(),amount:GAME_SETTINGS.passGoAmount }
          state.eventLog.push(event)
addToEvents(gameId,event);
                io.to(gameId).emit(SocketEvent.GameEvents,event)

        }
      } else if (card.spaces) {
        newPosition = (oldPosition - 1 + card.spaces) % 40;
        if (newPosition < 0) newPosition += 40;
        newPosition += 1;
        // No pass Go check for relative moves in Monopoly rules unless specified
      }

        //  await botDelay(state.isSimulation);

      player.position = newPosition;
      const ev = { type: 'CARD_MOVE_EFFECT', playerId, newPosition, description: card.description, ts: new Date().toISOString() }
      state.eventLog.push(ev);
            io.to(gameId).emit(SocketEvent.GameEvents,ev)

      // Handle landing on the new tile
      const tile = BOARD[newPosition - 1];
        

      switch (tile.type) {
        case 'go_to_jail':
          player.position = 11;
          player.inJail = true;
          player.jailTurns = 0;
     
          await botDelay(state.isSimulation)

          const evnt= { type: 'GO_TO_JAIL', playerId, ts: new Date().toISOString(),position:player.position }
          state.eventLog.push(evnt);
                io.to(gameId).emit(SocketEvent.GameEvents,evnt)

                if(!player.isBot){

                  await saveGameState(gameId,state)
                  return await endTurn(gameId,player.id,io,)
                }

          break;
        case 'tax':
          if (tile.cost) {
            player.money -= tile.cost;

            const evnt= { type: 'PAY_TAX', playerId, amount: tile.cost, ts: new Date().toISOString() }
          state.eventLog.push(evnt);
                io.to(gameId).emit(SocketEvent.GameEvents,evnt)
            state = await botBankRuptcyHelper(player,state)
          }
          break;
          case 'chance':
            await drawCard(gameId,state,player.id,'chance',io)
            case 'community':
 await drawCard(gameId,state,player.id,'community',io)
        case 'property':
        case 'route':
        case 'utility':
          await handlePropertyLanding(gameId, playerId, tile, 0, state,io); // Dice roll is 0 for card moves
          break;
        // No action for start, jail, free, chance, community when moved by card[]
      }
      break;
    case CardType.GetOutOfJailFree:
      player.getOutOfJailFreeCards += 1;

    const  evnt= { type: 'GET_OUT_OF_JAIL_FREE_FREE_CARD', playerId, description: card.description, ts: new Date().toISOString() }
          state.eventLog.push(evnt);
                io.to(gameId).emit(SocketEvent.GameEvents,evnt)
                io.to(gameId).emit(SocketEvent.GameStateUpdate,{players:state.players})
   
      break;
    case CardType.GoToJail:
      player.position = 11;
      player.inJail = true;
      player.jailTurns = 0;
      await botDelay(state.isSimulation,550);
       const evnet= { type: 'GO_TO_JAIL_CARD', playerId, description: card.description, ts: new Date().toISOString() }
          state.eventLog.push(evnet);
                io.to(gameId).emit(SocketEvent.GameEvents,evnet)


      if (!player.isBot) {
        // Force end turn for human players
            await saveGameState(gameId,state)
        await endTurn(gameId, playerId,io);
      }
      break;
    case CardType.Repairs:
      let totalCost = 0;
      for (const propId of player.properties) {
        const propState = state.propertyStates[propId];
        if (propState) {
          if (propState.level <= 4) { // Houses
            totalCost += propState.level * card.houseCost;
          } else if (propState.level === 5) { // Hotel
            totalCost += card.hotelCost;
          }
        }
      }
      player.money -= totalCost;
         const evntt= { type: 'REPAIRS_CARD', playerId, amount: -totalCost, description: card.description, ts: new Date().toISOString() }
          state.eventLog.push(evntt);
                io.to(gameId).emit(SocketEvent.GameEvents,evntt)
       state = await botBankRuptcyHelper(player,state)
              
    
      break;
  }


}

export async function botBankRuptcyHelper(player:PlayerState,state:GameState){
      if(player.isBot && player.money<=0){
                  const bot = bots.get(player.id)
                  if(bot){
                    state = await bot.handleBankruptcy(player,state,)
                  }
                }
                return state
}
// Function to draw a card from a deck
export async function drawCard(gameId: string,state:GameState, playerId: string, deckType: 'chance' | 'community',io:Server) {
  // await acquireLock(gameId);
  try {
 
    const player = state.players[playerId];

    // let deck: (ChanceCard | CommunityChestCard)[];
    let card: ChanceCard | CommunityChestCard;

    if (deckType === 'chance') {
      if (state.deck.chance.length === 0) {
        // Reshuffle if deck is empty
        state.deck.chance = CHANCE_CARDS.map(c => c.id);
        // Shuffle the deck (Fisher-Yates algorithm)
        for (let i = state.deck.chance.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [state.deck.chance[i], state.deck.chance[j]] = [state.deck.chance[j], state.deck.chance[i]];
        }
      }
      const cardId = state.deck.chance.shift()!;
      card = CHANCE_CARDS.find(c => c.id === cardId)!;
      state.deck.chance.push(cardId); // Put card at bottom of deck
    } else { // community
      if (state.deck.community.length === 0) {
        // Reshuffle if deck is empty
        state.deck.community = COMMUNITY_CHEST_CARDS.map(c => c.id);
        // Shuffle the deck
        for (let i = state.deck.community.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [state.deck.community[i], state.deck.community[j]] = [state.deck.community[j], state.deck.community[i]];
        }
      }
      const cardId = state.deck.community.shift()!;
      card = COMMUNITY_CHEST_CARDS.find(c => c.id === cardId)!;
      state.deck.community.push(cardId); // Put card at bottom of deck
    }

     const event = { type: 'DRAW_CARD', playerId, deckType, cardDescription: card.description, ts: new Date().toISOString() }
     io.to(gameId).emit(SocketEvent.GameEvents,event)
    state.eventLog.push(event)
addToEvents(gameId,event);


       await botDelay(state.isSimulation,510)

    await applyCardEffect(gameId, state, playerId, card,io);
   

    state.phase = 'after_roll'; // After card effect, return to after_roll phase
    // console.log(state.eventLog);
    await saveGameState(gameId, state);
    return card;
  } 
  catch(e){
    console.log(e)
  }
  finally {
    
    // await releaseLock(gameId);
  }
}

// Handle landing on a property, route, or utility
export async function handlePropertyLanding(gameId: string, playerId: string, tile: BoardTile, diceRoll: number, state: GameState,io:Server) {
  // This function is called from handleRoll, which already acquires a lock.
  // No need for a separate lock here.
  const propertyState = state.propertyStates[tile.id];
  let event
  if (!propertyState || !propertyState.owner) {
    // Unowned property - offer to buy

      event= { type: 'PROPERTY_UNOWNED', playerId, tileId: tile.id, cost: tile.cost, ts: new Date().toISOString() }
          state.eventLog.push(event)
addToEvents(gameId,event);
                io.to(gameId).emit(SocketEvent.GameEvents,event)
    state.phase =  'after_roll'; // Change phase to allow buying or auction
  } else if (propertyState.owner === playerId) {
    // Owned by current player - no action

      event= { type: 'PROPERTY_OWNED_BY_SELF', playerId, tileId: tile.id, ts: new Date().toISOString() }
          state.eventLog.push(event)
addToEvents(gameId,event);
                io.to(gameId).emit(SocketEvent.GameEvents,event)


    state.phase = 'after_roll'; // Stay in after_roll phase
  } else {
    // Owned by another player - pay rent
     const owner = state.players[propertyState.owner];
     if(owner.inJail)
      return
    const rent = calculateRent(state, tile, diceRoll);
   
    const player = state.players[playerId];

    if (player.money < rent) {
      // Player cannot afford rent - partial payment and track debt
      const amountPaid = player.money;
      owner.money += amountPaid; // Owner receives all available money
      const remainingDebt = rent - amountPaid;
      

      
      player.money = 0; // Player's money becomes 0
      player.debtToPlayerId = owner.id;
      player.debtAmount = remainingDebt;


         event= {
        type: 'CANNOT_AFFORD_RENT',
        playerId,
        tileId: tile.id,
        amount: rent,
        amountPaid,
        remainingDebt,
        ownerId: owner.id,
        ts: new Date().toISOString(),
      }
          state.eventLog.push(event)
addToEvents(gameId,event);
                io.to(gameId).emit(SocketEvent.GameEvents,event)

      // state.phase = 'bankruptcy_imminent'; // Indicate bankruptcy
      if(player.isBot){
        const bot = bots.get(player.id)
        if(bot){
          state =await bot.handleBankruptcy(state.players[player.id],state,player.debtAmount);
        }
      }
    } else {
      player.money -= rent;
      owner.money += rent;

            event= { type: 'PAY_RENT', playerId, tileId: tile.id, amount: rent, ownerId: owner.id, ts: new Date().toISOString() }
          state.eventLog.push(event)
addToEvents(gameId,event);
                io.to(gameId).emit(SocketEvent.GameEvents,event)


      state.phase = 'after_roll'; // Stay in after_roll phase
    }
  }
  // saveGameState is called by handleRoll, no need to call here
  return state
}

// Simple roll dice handler
// Function to end a player's turn
// Helper function to check and settle debt
export async function checkAndSettleDebt(gameId: string, playerId: string, state: GameState,io:Server) {
  const player = state.players[playerId];

  if (player.debtAmount && player.debtAmount > 0) {
    const amountToSettle = Math.min(player.money, player.debtAmount); // Amount to transfer

    if (amountToSettle > 0) { // Only settle if there's money to transfer
      const creditor = state.players[player.debtToPlayerId!];
      if (creditor) {
        
        creditor.money += amountToSettle;

      }
      state.players[playerId].money -= amountToSettle;
      state.players[playerId].debtAmount! -= amountToSettle; // Reduce debt
      if (state.players[playerId].debtAmount! <= 0) { // Clear debt if fully paid
        state.players[playerId].debtAmount = undefined;
        state.players[playerId].debtToPlayerId = undefined;
      }

             const event = {
          type: 'DEBT_SETTLED',
          
          playerId,
          creditorId: creditor?.id,
          money:  state.players[playerId].money,
          debtAmount:state.players[playerId].debtAmount,
          creditorMoney: creditor?.money,
          ts: new Date().toISOString(),

          
        }

                         io.to(gameId).emit(SocketEvent.GameEvents,event)

        state.eventLog.push(event)
addToEvents(gameId,event);
    }
  }
  // console.log(state.players)
  return state;
}

export async function handleEndTurn(gameId: string, playerId: string,io:Server): Promise<GameState | { error: string }> {
  await acquireLock(gameId);
  try {
    let state = await loadGameState(gameId);
    if (!state) {
      return { error: `Game with ID ${gameId} not found.` };
    }
    const player = state.players[playerId];

    // --- CANCEL PREVIOUS PLAYER'S TURN TIMER JOB --- 
    // Construct the job ID for the current player's turn timer
    const currentTurnJobId = `turn-timer-${gameId}-${playerId}`;
    await gameQueue.remove(currentTurnJobId);
    // --- END CANCEL ---

    // If the player is bankrupt, their turn is effectively over.
    // Do not process further turn logic for them.
    if (player.status === 'bankrupt') {
      return state; // Return current state without advancing turn
    }

    if (state.turn !== playerId) {
      return { error: 'Not your turn' };
    }

    // Check and settle debt before ending turn
   state = await checkAndSettleDebt(gameId, playerId, state,io);


    if (!state) {
      return { error: `Game with ID ${gameId} not found after debt check.` };
    }
    const updatedPlayer = state.players[playerId];

    // If after debt check, player still has debt or negative money, prevent turn end for players
    if ((updatedPlayer.debtAmount && updatedPlayer.debtAmount > 0 || updatedPlayer.money < 0)) {
      if (updatedPlayer.isBot) {
       state = await handleBankruptcy(gameId, updatedPlayer.id, io, updatedPlayer.debtToPlayerId);
if (state.order.length <= 1) {
    return await handleGameOver(gameId, state, io);
}
      } else {
        state.phase = 'bankruptcy_imminent';
        await saveGameState(gameId, state);
        return { error: `You must resolve your outstanding debt or negative balance before ending your turn.` };
      }
    }

       if (updatedPlayer.isBot && updatedPlayer.lastRollWasDouble && !updatedPlayer.inJail) {
      if (updatedPlayer.consecutiveDoubles < 3) {
        // Player gets another turn

        const event = { type: 'ANOTHER_TURN', playerId, consecutiveDoubles: updatedPlayer.consecutiveDoubles, ts: new Date().toISOString() }
        state.eventLog.push(event)
addToEvents(gameId,event);
                        io.to(gameId).emit(SocketEvent.GameEvents,event)

        state.phase = 'before_roll'; // Stay in before_roll phase for the same player
        updatedPlayer.lastRollWasDouble = false; // Reset for next roll
      } else {
        // 3 consecutive doubles, go to jail
        updatedPlayer.position = 11; // Move to Jail tile (id 11)
        updatedPlayer.inJail = true;
        updatedPlayer.jailTurns = 0;
        const event = { type: 'THREE_CONSECUTIVE_DOUBLES_TO_JAIL', playerId, ts: new Date().toISOString() }
        state.eventLog.push(event)
addToEvents(gameId,event);
                        io.to(gameId).emit(SocketEvent.GameEvents,event)

        updatedPlayer.lastRollWasDouble = false;
        updatedPlayer.consecutiveDoubles = 0;
        // Advance to next player's turn
        const currentIndex = state.order.indexOf(playerId);
        let nextIndex = (currentIndex + 1) % state.order.length;
        let nextPlayerId = '';
        for (let i = 0; i < state.order.length; i++) {
            const potentialNextPlayerId = state.order[nextIndex];
            if (state.players[potentialNextPlayerId] && state.players[potentialNextPlayerId].status !== 'bankrupt') {
                nextPlayerId = potentialNextPlayerId;
                break;
            }
            nextIndex = (nextIndex + 1) % state.order.length;
        }
        state.turn = nextPlayerId;
        state.phase = 'before_roll';
      }
    }
    else{
// Normal turn end, advance to next player

if (state.order.length <= 1) {
    return await handleGameOver(gameId, state, io);
} else {
    updatedPlayer.consecutiveDoubles = 0; // Reset consecutive doubles

    const currentIndex = state.order.indexOf(playerId);
    let nextPlayerId = '';

    if (currentIndex !== -1) {
        // If the player is still in the order, find the next active player
        let nextIndex = (currentIndex + 1) % state.order.length;
        let foundNextPlayer = false;
        for (let i = 0; i < state.order.length; i++) {
            const potentialNextPlayerId = state.order[nextIndex];
            if (state.players[potentialNextPlayerId] && state.players[potentialNextPlayerId].status !== 'bankrupt') {
                nextPlayerId = potentialNextPlayerId;
                foundNextPlayer = true;
                break;
            }
            nextIndex = (nextIndex + 1) % state.order.length;
        }
        if (!foundNextPlayer) {
            // No active players left, game over
            state.phase = 'game_over';
            nextPlayerId = ''; // Or handle as appropriate for game over
        }
    } else {
        // The player whose turn just ended was removed from the order array (e.g., bankrupt).
        // Find the first active player in the updated order array.
        let foundNextPlayer = false;
        for (let i = 0; i < state.order.length; i++) {
            const potentialNextPlayerId = state.order[i];
            if (state.players[potentialNextPlayerId] && state.players[potentialNextPlayerId].status !== 'bankrupt') {
                nextPlayerId = potentialNextPlayerId;
                foundNextPlayer = true;
                break;
            }
        }
        if (!foundNextPlayer) {
            // No active players left, game over
            state.phase = 'game_over';
            nextPlayerId = ''; // Or handle as appropriate for game over
        }
    }

    state.turn = nextPlayerId;
    state.phase = 'before_roll';
}
    }

    await saveGameState(gameId, state);

    // --- SCHEDULE NEXT PLAYER'S TURN TIMER JOB ---
   
    await addTurnExpiryJob(gameId,state.turn);
    // --- END SCHEDULE ---

    // console.log(`[handleEndTurn] Game ${gameId}: Player ${playerId} ended turn. Next turnIndex: ${updatedState.turnIndex}, Phase: ${updatedState.phase}`);
    return state;
  } finally {
    await releaseLock(gameId);
  }
}

async function handleGameOver(gameId: string, state: GameState, io: Server) {
  state.phase = 'game_over';
  const event = { type: 'GAME_OVER', winnerId: state.order[0], ts: new Date().toISOString() };
  state.eventLog.push(event);
  addToEvents(gameId, event);
  io.to(gameId).emit(SocketEvent.GameEvents, event);

  await saveGameState(gameId, state);

     const stateSize = Buffer.byteLength(JSON.stringify(state));
    console.log("String size:",stateSize, "bytes");
  // Emit final game stats
  const stats = await getGameStats(gameId);


  if (stats) {
     const orgStats:{playerId:string,stats:PlayerStatsSnapshot[]}[] = []
      Object.entries(stats).forEach(([playerId,stats])=>{
            orgStats.push({playerId,stats})
      })
     
    io.to(gameId).emit(SocketEvent.GameEvents, {type:"GAME_STATS",stats:orgStats});
    await deleteGameStats(gameId); // Clean up stats from Redis
  }


  Object.values(state.players).forEach(async(e)=>{
    if(e.isBot)
    {
      bots.delete(e.id)
      await deleteBotMetadata(gameId,e.id)
    }
  })
  // Clean up other Redis keys
  const cooldownKeysToDelete = await redis.keys(`trade-cooldown:${gameId}:*`);
  if (cooldownKeysToDelete.length > 0) {
    await redis.del(cooldownKeysToDelete);
  }
  const tradeKeysToDelete = await redis.keys(`trade:${gameId}:*`);
  if (tradeKeysToDelete.length > 0) {
    await redis.del(tradeKeysToDelete);
  }
  await redis.del(`game:${gameId}`);
  



  return state;
}

// Function to handle player bankruptcy
export async function handleBankruptcy(gameId: string, bankruptPlayerId: string,io:Server, creditorId?:string,gameState?:GameState) {
  await acquireLock(gameId);
  try {
    const state = gameState || await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
    const bankruptPlayer = state.players[bankruptPlayerId];
    if (!bankruptPlayer) {
      throw new Error('Bankrupt player not found.');
    }

    const creditor = creditorId ? state.players[creditorId] : undefined;

    // Transfer money
    if (creditor) {
      creditor.money += bankruptPlayer.money;
    }
    bankruptPlayer.money = 0;

    // Transfer properties
    for (const tileId of bankruptPlayer.properties) {
      const propertyState = state.propertyStates[tileId];
      if (propertyState) {
        if (creditor) {
          propertyState.owner = creditorId;
          propertyState.level = 0;
          creditor.properties.push(tileId);
          updatePlayerAssets(creditor, state.propertyStates); // Update creditor's assets
        } else {
          // Return to bank
          state.propertyStates[tileId].owner=undefined
          state.propertyStates[tileId].level=0
          delete state.propertyStates[tileId];
        }
        propertyState.mortgaged = false; // Unmortgage if mortgaged
        propertyState.level = 0; // Remove houses/hotels
      }
    }
    bankruptPlayer.properties = [];
    updatePlayerAssets(bankruptPlayer, state.propertyStates);

    // Remove Get Out of Jail Free cards (if implemented)
    // For now, just log it if they had any
    // if (bankruptPlayer.getOutOfJailFreeCards>1) {
    //   state.eventLog.push({ type: 'LOST_GOOJF_CARD', playerId: bankruptPlayerId, ts: new Date().toISOString() });
    // }

    bankruptPlayer.status = 'bankrupt';
    bankruptPlayer.debtAmount = undefined;
    bankruptPlayer.debtToPlayerId = undefined;
    bankruptPlayer.inJail = false; // Ensure not in jail

    // Remove from turn order
    state.order = state.order.filter(id => id !== bankruptPlayerId);
    await redis.del(`player:${bankruptPlayer.id}:current_game`);
    // If the bankrupt player was the current player, advance the turn
    if (state.turn === bankruptPlayerId) {
        let nextPlayerId = '';
        if (state.order.length > 0) {
            // Find the first active player in the remaining order
            for (const playerIdInOrder of state.order) {
                if (state.players[playerIdInOrder] && state.players[playerIdInOrder].status !== 'bankrupt') {
                    nextPlayerId = playerIdInOrder;
                    break;
                }
            }
        }
        state.turn = nextPlayerId;
        state.phase="before_roll"
    }
    if(bankruptPlayer.isBot)
     await botDelay(state.isSimulation);
    const event = { type: 'BANKRUPTCY', bankruptPlayerId, creditorId: creditorId || 'bank', ts: new Date().toISOString() }
    state.eventLog.push(event)
addToEvents(gameId,event);
          io.to(gameId).emit(SocketEvent.GameEvents,event)
            io.to(gameId).emit(SocketEvent.GameStateUpdate,{propertyStates:state.propertyStates,players:state.players,order:state.order,phase:state.phase} as Partial<GameStateUpdate>)

          await addStatsSnapshot(gameId, state);
 if (state.order.length <= 1) {
      return await handleGameOver(gameId, state, io);
    }


 await saveGameState(gameId, state);
    // Check for game end
   
    
    return state;
  } finally {
    await releaseLock(gameId);
  }
}



// Function to start an auction for a property
export async function startAuction(gameId: string, tileId: number) {
  await acquireLock(gameId);
  try {
    const state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
    const tile = BOARD[tileId - 1];

    if (!tile || (tile.type !== 'property' && tile.type !== 'route' && tile.type !== 'utility')) {
      throw new Error('Invalid tile for auction.');
    }

    const propertyState = state.propertyStates[tileId];
    if (propertyState && propertyState.owner) {
      throw new Error('Property is already owned.');
    }

    state.auction = {
      tileId: tileId,
      currentBid: 0,
      currentBidderId: null,
      playersInAuction: state.order.filter(playerId => state.players[playerId].status === 'active'), // All active players can bid
    };
    state.phase = 'auction';
    state.eventLog.push({ type: 'AUCTION_STARTED', tileId, ts: new Date().toISOString() });

    await saveGameState(gameId, state);
    return state;
  } finally {
    await releaseLock(gameId);
  }
}

// Function for a player to place a bid in an auction
export async function placeBid(gameId: string, playerId: string, bidAmount: number) {
  await acquireLock(gameId);
  try {
    const state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
    const player = state.players[playerId];

    if (state.phase !== 'auction' || !state.auction) {
      throw new Error('No active auction.');
    }
    if (!state.auction.playersInAuction.includes(playerId)) {
      throw new Error('Player is not part of this auction.');
    }
    if (bidAmount <= state.auction.currentBid) {
      throw new Error('Bid must be higher than current bid.');
    }
    if (player.money < bidAmount) {
      throw new Error('Insufficient funds to place bid.');
    }

    state.auction.currentBid = bidAmount;
    state.auction.currentBidderId = playerId;
    state.eventLog.push({ type: 'AUCTION_BID', playerId, bidAmount, ts: new Date().toISOString() });

    await saveGameState(gameId, state);
    return state;
  } finally {
    await releaseLock(gameId);
  }
}

// Function for a player to pass their bid in an auction
export async function passBid(gameId: string, playerId: string) {
  await acquireLock(gameId);
  try {
    const state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }

    if (state.phase !== 'auction' || !state.auction) {
      throw new Error('No active auction.');
    }
    if (!state.auction.playersInAuction.includes(playerId)) {
      throw new Error('Player is not part of this auction.');
    }

    state.auction.playersInAuction = state.auction.playersInAuction.filter(id => id !== playerId);
    state.eventLog.push({ type: 'AUCTION_PASS', playerId, ts: new Date().toISOString() });

    // If only one player remains, end the auction
    if (state.auction.playersInAuction.length === 1) {
      await endAuction(gameId);
    } else if (state.auction.playersInAuction.length === 0) {
      // No one left to bid, auction fails
      await endAuction(gameId);
    }

    await saveGameState(gameId, state);
    return state;
  } finally {
    await releaseLock(gameId);
  }
}

// Function to end an auction (e.g., when all but one player have passed)
export async function endAuction(gameId: string) {
  await acquireLock(gameId);
  try {
    const state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }

    if (state.phase !== 'auction' || !state.auction) {
      throw new Error('No active auction to end.');
    }

    const { tileId, currentBid, currentBidderId } = state.auction;
    const tile = BOARD[tileId - 1];

    if (currentBidderId && currentBid > 0) {
      // Property sold to highest bidder
      const winner = state.players[currentBidderId];
      if (!winner) throw new Error('Auction winner not found.');

      winner.money -= currentBid;
      winner.properties.push(tileId);
      state.propertyStates[tileId] = { owner: currentBidderId, level: 0, mortgaged: false };
      state.eventLog.push({ type: 'AUCTION_WON', winnerId: currentBidderId, tileId, amount: currentBid, ts: new Date().toISOString() });
    } else {
      // No bids or all players passed
      state.eventLog.push({ type: 'AUCTION_FAILED', tileId, ts: new Date().toISOString() });
    }

    state.auction = null; // Clear auction state
    state.phase = 'after_roll'; // Return to normal game flow

    await saveGameState(gameId, state);
    return state;
  } finally {
    await releaseLock(gameId);
  }
}


// Function to cancel a trade by the proposer
export async function cancelTrade(gameId: string, tradeId: string, playerId: string,expired:boolean=false,io:Server) {
  await acquireLock(gameId);
  try {
    const state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
    const tradeJSON = await redis.get(`trade:${gameId}:${tradeId}`);
    if (!tradeJSON) throw new Error('Trade not found');
    const tradeRows: Trade = JSON.parse(tradeJSON);
    // if (tradeRows.proposer_id !== playerId) throw new Error('Only the proposer can cancel this trade.');
    // if (tradeRows.status !== 'pending') throw new Error('Trade is not pending and cannot be cancelled.');

    tradeRows.status = 'cancelled';
    await redis.set(`trade:${gameId}:${tradeId}`, JSON.stringify(tradeRows));
    const event = { type: 'TRADE_CANCELLED', tradeId, by: playerId, ts: new Date().toISOString(),expired }
    state.eventLog.push(event)
addToEvents(gameId,event);
 io.to(gameId).emit(SocketEvent.GameEvents, event);
    await saveGameState(gameId, state);
    return { ok: true,event };
  } finally {
    await releaseLock(gameId);
  }
}
  
export async function loadTrade(gameId:string,tradeId:string){
  const tradeJSON = await redis.get(`trade:${gameId}:${tradeId}`);
   if (!tradeJSON) throw new Error('Trade not found');
    const trade: Trade = JSON.parse(tradeJSON);
    return trade
}
// Function to decline a trade by the responder
export async function declineTrade(gameId: string, tradeId: string, playerId: string) {
  await acquireLock(gameId);
  try {
    const state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
    const tradeJSON = await redis.get(`trade:${gameId}:${tradeId}`);
    if (!tradeJSON) throw new Error('Trade not found');
    const tradeRows: Trade = JSON.parse(tradeJSON);
    // if (tradeRows.responder_id !== playerId) throw new Error('Only the responder can decline this trade.');
    // if (tradeRows.status !== 'pending') throw new Error('Trade is not pending and cannot be declined.');
    if(state.players[playerId].isBot)
     await botDelay(state.isSimulation);
    tradeRows.status = 'declined';
    await redis.set(`trade:${gameId}:${tradeId}`, JSON.stringify(tradeRows));
    const event = { type: 'TRADE_DECLINED', tradeId, by: playerId, ts: new Date().toISOString() }
    state.eventLog.push(event)
addToEvents(gameId,event);
    await saveGameState(gameId, state);
    return { ok: true,event };
  } finally {
    await releaseLock(gameId);
  }
}

// Function for a player to leave the game
export async function leaveGame(gameId: string, playerId: string,io:Server) {
  await acquireLock(gameId);
  try {
    const state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }
    const player = state.players[playerId];

    if (!player) {
      throw new Error('Player not found in this game.');
    }

    // Transfer assets to the bank (or handle bankruptcy if debts)
    // For simplicity, just return properties to bank and set money to 0
    for (const tileId of player.properties) {
      const propertyState = state.propertyStates[tileId];
      if (propertyState) {
        delete state.propertyStates[tileId]; // Property becomes unowned
      }
    }
    player.properties = [];
    player.money = 0;
    player.getOutOfJailFreeCards = 0; // Return GOOJF cards

    player.status = 'left';
    player.inJail = false; // Ensure not in jail

    // Remove from turn order
    state.order = state.order.filter(id => id !== playerId);

    state.eventLog.push({ type: 'PLAYER_LEFT', playerId, ts: new Date().toISOString() });

    // Check for game end
    if (state.order.length <= 1) {
      return await handleGameOver(gameId, state, io);
    }

    await saveGameState(gameId, state);
    return state;
  } finally {
    await releaseLock(gameId);
  }
}

export async function handleRoll(gameId:string, playerId:string,io: Server) {
  // console.log(playerId);
  await acquireLock(gameId);
  try {
    let event
    let state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);[]
    }
    const initialEventLogLength = state.eventLog.length;
    const player = state.players[playerId];
    if (player.inJail) {
      return await rollForJail(gameId,playerId,state,io);
    }
    const current = state.turn;
    if (current !== playerId) throw new Error('Not your turn');
    // server-side dice
    const d1 = Math.floor(Math.random()*6)+1;
    const d2 = Math.floor(Math.random()*6)+1;
    const steps = d1 + d2;

    // Update consecutive doubles
    if (d1 === d2) {
      player.lastRollWasDouble = true;
      player.consecutiveDoubles += 1;
    } else {
      player.lastRollWasDouble = false;
      player.consecutiveDoubles = 0;
    }

    const oldPosition = player.position;
    let newPosition = (oldPosition - 1 + steps) % 40;
    if (newPosition < 0) newPosition += 40; // Ensure positive index
    newPosition += 1; // Convert to 1-indexed
    
    player.position = newPosition;
      event = { type: 'ROLL', playerId, d1, d2, steps, pos: player.position, ts: new Date().toISOString() }
      io.to(gameId).emit(SocketEvent.GameEvents,event)
      io.to(gameId).emit(SocketEvent.GameStateUpdate,{phase:"roll_done"}as Partial<GameStateUpdate>)
       state.eventLog.push(event)
addToEvents(gameId,event);
    // Check if player passed Go
    const tile = BOARD[newPosition - 1]; 
    if (newPosition < oldPosition) {
      const amount = GAME_SETTINGS.passGoAmount + ( tile.type==="start"?1000:0)
      player.money += amount; // Collect $200 for passing Go
      event = { type: 'PASS_GO', playerId, ts: new Date().toISOString(),amount:amount,onStart:tile.type==="start" }
      state.eventLog.push(event)
addToEvents(gameId,event);
            io.to(gameId).emit(SocketEvent.GameEvents,event)

    }


    // Get the tile from the 0-indexed BOARD array
    await botDelay(state.isSimulation);
    switch (tile.type) {
      case 'go_to_jail':
        player.position = 11; // Move to Jail tile (id 11)
        player.inJail = true;
        player.jailTurns = 0;
        event = { type: 'GO_TO_JAIL', playerId, ts: new Date().toISOString() }
            io.to(gameId).emit(SocketEvent.GameEvents,event)
        state.eventLog.push(event)
addToEvents(gameId,event);
        // state.phase = 'after_roll'; // End turn after going to jail
            await saveGameState(gameId,state)
            if(!player.isBot)
          return await endTurn(gameId,player.id,io,null)
      
      case 'tax':
        if (tile.cost) {
          const tax = Math.floor(player.money*(tile.cost/100))
          player.money -= tax;
           event = { type: 'PAY_TAX', playerId, amount: tax, ts: new Date().toISOString() }
            io.to(gameId).emit(SocketEvent.GameEvents,event)
  state.eventLog.push(event)
addToEvents(gameId,event);
             state = await botBankRuptcyHelper(player,state)
        
        }
        state.phase = 'after_roll'; // End turn after paying tax
        break;
      case 'start': // Go
      case 'jail': // Just Visiting
        state.phase = 'after_roll'; // No immediate action, end turn
        break;
      case 'festival':
        // state = handleFestivalTile(state, player, [d1, d2],io); // Pass dice roll for event selection[
        state.phase = 'after_roll'; // After festival action, end turn]
        break;
      case 'chance':
        await drawCard(gameId,state, playerId, 'chance',io,);
        break;
      case 'community':
        await drawCard(gameId,state, playerId, 'community',io,);
        break;
      case 'property':
      case 'route':
      case 'utility':
        await handlePropertyLanding(gameId, playerId, tile, steps, state,io);
        break;
    }

    // Only push ROLL event once, after all landing effects
 
    // state.phase is set within switch or by default

 
    await saveGameState(gameId, state);

    // persist event to DB
    // await supabaseAdmin.from(SocketEvent.GameEvents).insert({
    //   game_id: gameId, player_id: playerId, type: 'ROLL', data: { d1,d2,steps, pos: player.position }
    // });
  
    const newEvents = state.eventLog.slice(initialEventLogLength);
 
    return { roll: { d1, d2, steps, position: player.position }, events: newEvents };
  } finally {
    await releaseLock(gameId);
  }
}


// Trade propose minimal implementation (persistent)
export async function proposeTrade(trade:Partial<Trade>) {
  const id = uuidv4();
  if(!trade)
    throw new Error("Invalid trade")
  trade.id = id
  trade.status = "pending"
  // trade.expiresAt = new Date().toISOString()
  trade.createdAt = new Date().toISOString()

  await redis.set(`trade:${trade.gameId}:${id}`, JSON.stringify(trade),'EX', 70);
  const state = (await loadGameState(trade.gameId!))!;
  const event = { type: 'TRADE_OFFER', trade: trade }
  state.eventLog.push(event)
addToEvents(trade.gameId!,event);
  await saveGameState(trade.gameId!, state);

  // Add a job to the queue to expire the trade
  await gameQueue.add(Jobs.TradeExpired, {
    gameId: trade.gameId,
    tradeId: id,
    playerId: trade.proposerId,
  }, {
    delay: 60000 // 60 seconds
  });

  return event
}

export async function getTrade(gameId: string, tradeId: string): Promise<Trade | null> {
  const tradeJSON = await redis.get(`trade:${gameId}:${tradeId}`);
  if (!tradeJSON) return null;
  return JSON.parse(tradeJSON) as Trade;
}

export async function acceptTrade(gameId:string, tradeId:string, accepterId:string,io:Server,socket?:any|undefined) {
  await acquireLock(gameId);
  
  try {
        // throw new Error(`Something went wrong`);
    const state = await loadGameState(gameId);
    if (!state) {
      throw new Error(`Game with ID ${gameId} not found.`);
    }


    const tradeJSON = await redis.get(`trade:${gameId}:${tradeId}`);
    if (!tradeJSON) throw new Error('Trade not found or expired');
    const tradeRows: Trade = JSON.parse(tradeJSON);
    if (tradeRows.status !== 'pending') throw new Error('Trade not pending');

    const proposer = state.players[tradeRows.proposerId];

    const responder = state.players[tradeRows.responderId!];
    if(responder.isBot)
     await botDelay(state.isSimulation);
    if (!proposer || !responder) {
      throw new Error('Trade participants not found.');
    }

    const offer: TradeOffer = tradeRows.offer;
    const request: TradeOffer = tradeRows.request;

    // Validate if participants have the assets to trade
    // Proposer offers:
    if (offer.money && proposer.money < offer.money) throw new Error('Proposer has insufficient money.');
    if (offer.properties) {
      for (const propId of offer.properties) {
        const propState = state.propertyStates[propId];
        if (!propState || propState.owner !== proposer.id) throw new Error(`Proposer does not own property ${propId}.`);
        if (propState.level > 0) throw new Error(`Property ${propId} has houses/hotels. Must be removed before trading.`);
      }
    }
    // Assuming GOOJF cards are tracked in PlayerState.getOutOfJailFreeCards
    // if (offer.getOutOfJailFreeCards && proposer.getOutOfJailFreeCards < offer.getOutOfJailFreeCards) throw new Error('Proposer has insufficient Get Out of Jail Free cards.');

    // Responder requests (which proposer gives)
    if (request.money && responder.money < request.money) throw new Error('Responder has insufficient money.');
    if (request.properties) {
      for (const propId of request.properties) {
        const propState = state.propertyStates[propId];
        if (!propState || propState.owner !== responder.id) throw new Error(`Responder does not own property ${propId}.`);
        if (propState.level > 0) throw new Error(`Property ${propId} has houses/hotels. Must be removed before trading.`);
      }
    }
    // if (request.getOutOfJailFreeCards && responder.getOutOfJailFreeCards < request.getOutOfJailFreeCards) throw new Error('Responder has insufficient Get Out of Jail Free cards.');


    // Perform the trade
    // Money transfer


    if (offer.money) {
      proposer.money -= offer.money;
      responder.money += offer.money;
    }
    if (request.money) {
      responder.money -= request.money;
      proposer.money += request.money;
    }

    // Property transfer
    if (offer.properties) {
      for (const propId of offer.properties) {
        state.propertyStates[propId].owner = responder.id;
        proposer.properties = proposer.properties.filter(p => p !== propId);
        responder.properties.push(propId);
      }
    }
    if (request.properties) {
      for (const propId of request.properties) {
        state.propertyStates[propId].owner = proposer.id;
        responder.properties = responder.properties.filter(p => p !== propId);
        proposer.properties.push(propId);
      }
    }

    // GOOJF cards transfer
    if (offer.getOutOfJailFreeCards) {
      proposer.getOutOfJailFreeCards -= offer.getOutOfJailFreeCards;
      responder.getOutOfJailFreeCards += offer.getOutOfJailFreeCards;
    }
    if (request.getOutOfJailFreeCards) {
      responder.getOutOfJailFreeCards -= request.getOutOfJailFreeCards;
      proposer.getOutOfJailFreeCards += request.getOutOfJailFreeCards;
    }

    updatePlayerAssets(proposer, state.propertyStates);
    updatePlayerAssets(responder, state.propertyStates);

    tradeRows.status = 'accepted';
    await redis.set(`trade:${gameId}:${tradeId}`, JSON.stringify(tradeRows));
    const event ={ type: 'TRADE_ACCEPTED', tradeId, by: accepterId, ts: new Date().toISOString(),proposer,responder,propertyState:state.propertyStates }
       io.to(gameId).emit(SocketEvent.GameEvents,event)
    state.eventLog.push(event)
addToEvents(gameId,event);
    await saveGameState(gameId, state);
    return { ok: true,event };
  }
  catch(e){
  
    if(socket)
      socket!.emit("error",{message:getErrorMessage(e)})
  }
  finally {
    await releaseLock(gameId);
  }
}



export async function handleAndEmitRoll(gameId: string, playerId: string, io: Server) {
    // console.log(`[handleAndEmitRoll] Game ${gameId}: Player ${playerId} is rolling dice.`);
    let state = await loadGameState(gameId);
    if (!state) {
        throw new Error(`Game with ID ${gameId} not found.`);
    }

    state.phase = 'rolling';
    let game_state_update = {phase:"rolling"} as Partial<GameStateUpdate>
    io.to(gameId).emit(SocketEvent.GameStateUpdate, game_state_update);
    await saveGameState(gameId, state);

    await botDelay(state.isSimulation);


    const result = await handleRoll(gameId, playerId,io);
      
    state = await loadGameState(gameId);
 

       if (state) {
            const player = state.players[playerId]

            if (!player.isBot && player.lastRollWasDouble && player.status!=='bankrupt') {
      if (player.consecutiveDoubles < 3) {
        // Player gets another turn

        const event = { type: 'ANOTHER_TURN', playerId, consecutiveDoubles: player.consecutiveDoubles, ts: new Date().toISOString() }
        io.to(gameId).emit(SocketEvent.GameEvents,event);
        state.eventLog.push(event)
addToEvents(gameId,event)
        state.phase = 'after_roll'; // Stay in before_roll phase for the same player
          
        player.lastRollWasDouble = false; // Reset for next roll
         game_state_update = {phase:state.phase}

      } else {
        // 3 consecutive doubles, go to jail
        player.position = 11; // Move to Jail tile (id 11)
        player.inJail = true;
        player.jailTurns = 0;
        const event = { type: 'THREE_CONSECUTIVE_DOUBLES_TO_JAIL', playerId, ts: new Date().toISOString() }
                io.to(gameId).emit(SocketEvent.GameEvents,event);

        state.eventLog.push(event );
        player.lastRollWasDouble = false;
        player.consecutiveDoubles = 0;
            await saveGameState(gameId,state)
        return await endTurn(gameId,player.id,io,null)
        // Advance to next player's turn
        // const currentIndex = state.order.indexOf(playerId);
        // let nextIndex = (currentIndex + 1) % state.order.length;
        // let nextPlayerId = '';
        // for (let i = 0; i < state.order.length; i++) {
        //     const potentialNextPlayerId = state.order[nextIndex];
        //     if (state.players[potentialNextPlayerId] && state.players[potentialNextPlayerId].status !== 'bankrupt') {
        //         nextPlayerId = potentialNextPlayerId;
        //         break;
        //     }
        //     nextIndex = (nextIndex + 1) % state.order.length;
        // }
        // state.turn = nextPlayerId;
        // state.phase = 'before_roll';
        //  game_state_update = {phase:state.phase,players:state.players,turn:state.turn} 
      }
    }
    else{
       game_state_update = {phase:"after_roll"} 
    }


    io.to(gameId).emit(SocketEvent.GameStateUpdate,game_state_update );
   
        // const update: GameStateUpdate = {
        //     phase: state.phase,
        //     players: state.players,
        //     turnIndex: state.turnIndex,
        //     propertyStates: state.propertyStates,
        //     auction: state.auction,
        // };
        // io.to(gameId).emit(SocketEvent.GameStateUpdate, update);
      if(result)
      {
           for (const event of result.events) {
            if (event.playerId) {
                const bot = bots.get(event.playerId);
                if (bot) {[]
                    bot.handleGameEvent(event, state,);
                }
            } else {
                // For game-wide events, notify all bots
                for (const bot of bots.values()) {
                    bot.handleGameEvent(event, state,);
                }
            }
        }
      }

       
    }


 
}
export function updatePlayerAssets(player: PlayerState, propertyStates: GameState['propertyStates']) {
  let properties = 0;
  let houses = 0;
  let utilities = 0;
  let routes = 0;
  let totalValue = 0;

  for (const tileId of player.properties) {
    const tile = BOARD[tileId - 1];
    const propertyState = propertyStates[tileId];

    if (tile && propertyState) {
      const mortgageValue = tile.mortgageValue || (tile.cost! / 2);
      if (propertyState.mortgaged) {
        totalValue += mortgageValue;
      } else {
        totalValue += tile.cost!;
      }

      if (tile.type === 'property') {
        properties += tile.cost!;
        if (propertyState.level > 0) {
          houses += propertyState.level * tile.houseCost!;
          totalValue += propertyState.level * tile.houseCost!;
        }
      } else if (tile.type === 'utility') {
        utilities += tile.cost!;
      } else if (tile.type === 'route') {
        routes += tile.cost!;
      }
    }
  }

  player.assets = {
    properties,
    houses,
    utilities,
    routes,
    totalValue,
  };
}