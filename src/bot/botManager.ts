import { GameState,  BOARD, GameStateUpdate, GAME_SETTINGS, PlayerState, Trade, BoardTile, TradeOffer, BotDifficulty  } from '../types';
import { Server } from 'socket.io';
import { acceptTrade,buildHouse, buyProperty, declineTrade, delay, endTurn, handleAndEmitRoll, handleBankruptcy, loadGameState, mortgageProperty, proposeTrade, sellHouse, sellPropertyToBank, dispatchGameEventToBotResponder, checkAndSettleDebt, saveGameState, loadTrade } from '../game/gameManager'; // Added loadTrade
import { SocketEvent } from '../enums/SocketEventNames';
import { redis } from '../redis/redis';
import { botDelay } from '../utils/helpers';

// A simple bot that makes decisions based on the game state.
export class BotPlayer {
    public playerId: string;
    public gameId: string;
    private io: Server;
    private declinedTrades: Map<string, number> = new Map();
    private botDifficulty:BotDifficulty
    constructor(playerId: string, gameId: string, io: Server, botDifficulty: BotDifficulty=BotDifficulty.Medium) {
        this.playerId = playerId;
        this.gameId = gameId;
        this.io = io;
        this.botDifficulty = botDifficulty;
    }

    

    // Main function for the bot to take its turn.
    public async takeTurn(gameState: GameState,) {
        const player = gameState.players[this.playerId];
        if (!player || player.status !== 'active') {
            return; // Bot is not active in the game.
        }

     
        await handleAndEmitRoll(this.gameId, this.playerId, this.io);
   
        await this.manageProperties(gameState);
        await this.proposeTrade(gameState);
        // console.log(gameState)
        // After the roll, the bot's turn ends.
        await this.handleBankruptcy(player,gameState)
           // BOT has gone bankrupt and has to sell something to end turn
         
     
        await botDelay(gameState.isSimulation);

        await endTurn(this.gameId, this.playerId, this.io, null);


        // const st =await loadGameState(this.gameId)
        //   process.stdout.write(`
// ?${st?.phase} ${st?.turn}`)`)
        // console.log(state)
    }

    public async handleBankruptcy(player:PlayerState,gameState:GameState,threshold:number=0){
        const needsToRaiseMoney = (player.debtAmount && player.money < player.debtAmount) || player.money < 0;

        if (needsToRaiseMoney) {
            gameState = await this.tryToAvoidBankruptcy(gameState, threshold);
      
            if(gameState){
                const updatedPlayer = gameState!.players[this.playerId];
                const stillInDebt = updatedPlayer.money < (updatedPlayer.debtAmount || 0) || updatedPlayer.money < 0;
          
                if (stillInDebt) { 
                    gameState=  await handleBankruptcy(this.gameId, this.playerId,this.io,updatedPlayer.debtToPlayerId,gameState);
                    // console.log(gameState)
                }
            }
        }

        return gameState
        
    }

    public async handleGameEvent(event: any, gameState: GameState) {
        if (event.playerId !== this.playerId && event.type !== 'TRADE_OFFER' && event.type !== 'TRADE_DECLINED') {
            return; // Not this bot's event
        }

        switch (event.type) {
            case 'PROPERTY_UNOWNED':
                await this.decideToBuyProperty(event, gameState);
                break;

            case 'ANOTHER_TURN':
                await this.takeTurn(gameState)
                break;
            
            case 'TRADE_OFFER':
                if (event.trade.responderId === this.playerId) {
                    try{
                        // console.log(`Bot ${this.playerId}: Attempting to load trade with gameId: ${this.gameId}, tradeId: ${event.trade.id}`);
                        const tradeToEvaluate = await loadTrade(this.gameId, event.trade.id);
                        if (!tradeToEvaluate) {
                            console.warn(`Bot ${this.playerId}: Trade ${event.trade.id} not found in Redis. Event trade object:`, event.trade);
                            return; // Cannot evaluate if trade not found
                        }
                        const decision = this.evaluateTrade(tradeToEvaluate, gameState);
                    if (decision) {
                     await acceptTrade(this.gameId, event.trade.id, this.playerId,this.io);
                  

                    } else {
                      const result=  await declineTrade(this.gameId, event.trade.id, this.playerId);
 this.io.to(this.gameId).emit(SocketEvent.GameEvents,result.event)
                    }
                    }
                    catch(e){
                        console.error(`Bot ${this.playerId} error evaluating/responding to trade:`, e);
                    }
                }
                break;
            case 'TRADE_DECLINED':
                if (event.responderId === this.playerId) {
                    const trade = event.trade;
                    const key = `${trade.responderId}-${trade.request.properties[0]}`;
                    const count = this.declinedTrades.get(key) || 0;
                    this.declinedTrades.set(key, count + 1);
                }
                break;
        }
    }

    private async decideToBuyProperty(event: any, gameState: GameState) {
        const player = gameState.players[this.playerId];
        const tile = BOARD[event.tileId - 1];

        let shouldBuy = false;

        if (player.money >= tile.cost!) {
            switch (this.botDifficulty) {
                case BotDifficulty.Easy:
                    // Easy bot is conservative, only buys if it has plenty of money left
                    shouldBuy = player.money - tile.cost! > 2000;
                    break;
                case BotDifficulty.Medium:
                    // Medium bot buys if it can afford it
                    shouldBuy = true;
                    break;
                case BotDifficulty.Hard:
                    // Hard bot is aggressive, buys if it can afford or if it's a strategic property
                    shouldBuy = true; // For now, same as medium, but can be expanded
                    break;
            }
        }

        if (shouldBuy) {
            const {state} = await buyProperty(this.gameId, this.playerId, event.tileId,this.io);
            // const update = {phase:state.phase,propertyStates:state.propertyStates} as Partial<GameStateUpdate>
            // this.io.to(this.gameId).emit(SocketEvent.GameStateUpdate, update);
          
         
        }
    }

    private async tryToAvoidBankruptcy(gameState: GameState,threshold:number): Promise<GameState> {
        let player = gameState.players[this.playerId];
        let needsToRaiseMoney = (player.debtAmount && player.money < player.debtAmount) || player.money <= 0;

        while (needsToRaiseMoney) {
            let actionTaken = false;

            // 1. Sell houses
            for (const tileId of player.properties) {
                const propertyState = gameState.propertyStates[tileId];
                if (propertyState && propertyState.level > 0) {
                    const r = await sellHouse(this.gameId, this.playerId, tileId,this.io,gameState);
                    gameState = r.state!;
                    player = gameState.players[this.playerId];
                    actionTaken = true;
                    break; // Sell one house at a time
                }
            }
            if (actionTaken) {
                needsToRaiseMoney = (player.debtAmount && player.money < player.debtAmount) || player.money < 0;
                if (needsToRaiseMoney) continue;
                else break;
            }

            // 2. Mortgage properties
            if (GAME_SETTINGS.mortgage) {
                for (const tileId of player.properties) {
                    const propertyState = gameState.propertyStates[tileId];
                    if (propertyState && !propertyState.mortgaged) {
                        const newState= await mortgageProperty(this.gameId, this.playerId, tileId,this.io);
                        gameState = newState;
                        player = gameState.players[this.playerId];
                        actionTaken = true;
                        break; // Mortgage one property at a time
                    }
                }
            }
            if (actionTaken) {
                needsToRaiseMoney = (player.debtAmount && player.money < player.debtAmount) || player.money < 0;
                if (needsToRaiseMoney) continue;
                else break;
            }

            // 3. Sell properties
            const sortedProperties = player.properties
                .map(tileId => BOARD[tileId - 1])
                .sort((a, b) => (a.cost || 0) - (b.cost || 0));
            for (const tile of sortedProperties) {
                const propertyState = gameState.propertyStates[tile.id];
                if (propertyState && !propertyState.mortgaged && propertyState.level === 0) {
                    const {state:newState}= await sellPropertyToBank(this.gameId, this.playerId, tile.id,this.io,gameState);
                    gameState = newState;
                    player = gameState.players[this.playerId];
                    actionTaken = true;
                    break; // Sell one property at a time
                }
            }
            
            needsToRaiseMoney = (player.debtAmount && player.money < player.debtAmount) || player.money < 0;

            // If no action was taken, break the loop to prevent infinite loops
            if (!actionTaken) {
                break;
            }
        }
        return gameState;
    }

    private evaluateTrade(trade: Trade, gameState: GameState): boolean {
        const botPlayer = gameState.players[this.playerId];
        const proposer = gameState.players[trade.proposerId];

        const offeredValue = this.calculateTradeOfferValue(trade.offer, botPlayer, gameState);
        const requestedValue = this.calculateTradeOfferValue(trade.request, proposer, gameState);

        // console.log(`offeredValue: ${offeredValue}`);
        // console.log(`requestedValue: ${requestedValue}`);

        // Do not trade properties that are part of a monopoly
        if (trade.request.properties) {
            for (const propId of trade.request.properties) {
                const tile = BOARD.find(t => t.id === propId) as BoardTile;
                if (tile.group) {
                    const groupProperties = BOARD.filter(p => p.group === tile.group);
                    const playerPropertiesInGroup = groupProperties.filter(p => botPlayer.properties.includes(p.id));
                    if (playerPropertiesInGroup.length === groupProperties.length) {
                        return false; // Already has a monopoly on this group
                    }
                }
            }
        }

        // Enhanced evaluation logic
        const botNetGain = offeredValue - requestedValue;

        switch (this.botDifficulty) {
            case BotDifficulty.Easy:
                // Easy bot is more lenient, accepts if net gain is non-negative or if it helps them
                if (botNetGain >= 0) {
                    return true;
                }
                // Still consider monopoly potential
                if (trade.request.properties) {
                    for (const propId of trade.request.properties) {
                        const tile = BOARD.find(t => t.id === propId) as BoardTile;
                        if (tile.group) {
                            const groupProperties = BOARD.filter(p => p.group === tile.group);
                            const playerPropertiesInGroup = groupProperties.filter(p => botPlayer.properties.includes(p.id));
                            if (playerPropertiesInGroup.length === groupProperties.length - 1) {
                                return true;
                            }
                        }
                    }
                }
                break;
            case BotDifficulty.Medium:
                // Medium bot is balanced
                if (botNetGain > 0) {
                    return true;
                }
                if (botPlayer.money < 5000) {
                    if (trade.request.money && trade.request.money > 0) {
                        return false;
                    }
                }
                if (trade.request.properties) {
                    for (const propId of trade.request.properties) {
                        const tile = BOARD.find(t => t.id === propId) as BoardTile;
                        if (tile.group) {
                            const groupProperties = BOARD.filter(p => p.group === tile.group);
                            const playerPropertiesInGroup = groupProperties.filter(p => botPlayer.properties.includes(p.id));
                            if (playerPropertiesInGroup.length === groupProperties.length - 1) {
                                return true;
                            }
                        }
                    }
                }
                break;
            case BotDifficulty.Hard:
                // Hard bot is aggressive, only accepts if it's clearly beneficial or strategic
                if (botNetGain > (requestedValue * 0.1)) { // At least 10% net gain
                    return true;
                }
                // Always accept if it completes a monopoly, regardless of immediate financial gain
                if (trade.request.properties) {
                    for (const propId of trade.request.properties) {
                        const tile = BOARD.find(t => t.id === propId) as BoardTile;
                        if (tile.group) {
                            const groupProperties = BOARD.filter(p => p.group === tile.group);
                            const playerPropertiesInGroup = groupProperties.filter(p => botPlayer.properties.includes(p.id));
                            if (playerPropertiesInGroup.length === groupProperties.length - 1) {
                                return true;
                            }
                        }
                    }
                }
                // Hard bot is less likely to give away money unless it's for a monopoly
                if (trade.request.money && trade.request.money > 0 && !trade.request.properties) {
                    return false;
                }
                break;
        }

        return false;
    }

    private calculateTradeOfferValue(offer: TradeOffer, player: PlayerState, gameState: GameState): number {
        let value = 0;

        if (offer.money) {
            value += offer.money;
        }

        if (offer.getOutOfJailFreeCards) {
            value += 500 * offer.getOutOfJailFreeCards; // Arbitrary value for the card
        }

        if (offer.properties) {
            for (const propId of offer.properties) {
                const tile = BOARD.find(t => t.id === propId) as BoardTile;
                const propertyState = gameState.propertyStates[propId];

                if (tile.cost) {
                    value += tile.cost;
                }

                if (propertyState) {
                    if (propertyState.mortgaged) {
                        value -= (tile.mortgageValue || 0) * 1.1; // Subtract mortgage value + 10% interest
                    }

                    if (propertyState.level > 0 && tile.houseCost) {
                        value += propertyState.level * tile.houseCost;
                    }
                }
            }
        }

        return value;
    }

    public async proposeTrade(gameState: GameState) {
        let tradeChance = 0.25; // Default for Medium

        switch (this.botDifficulty) {
            case BotDifficulty.Easy:
                tradeChance = 0.15;
                break;
            case BotDifficulty.Hard:
                tradeChance = 0.40;
                break;
        }

        // Decide whether to propose a trade
        if (Math.random() > tradeChance) { // 25% chance of proposing a trade
            return;
        }

        const botPlayer = gameState.players[this.playerId];
        const possibleTrades: Partial<Trade>[] = [];

        const colorGroups = [...new Set(BOARD.filter(p => p.group).map(p => p.group!))];

        for (const group of colorGroups) {
            const groupProperties = BOARD.filter(p => p.group === group);
            const botPropertiesInGroup = groupProperties.filter(p => botPlayer.properties.includes(p.id));

            if (botPropertiesInGroup.length > 0 && botPropertiesInGroup.length < groupProperties.length) {
                const missingProperties = groupProperties.filter(p => !botPlayer.properties.includes(p.id));
                for (const missingProp of missingProperties) {
                    const ownerId = gameState.propertyStates[missingProp.id]?.owner;
                    if (ownerId && ownerId !== this.playerId) {
                        const cooldownKey = `trade-cooldown:${this.gameId}:${this.playerId}:${ownerId}`;
                        const lastTradeTimestamp = await redis.get(cooldownKey);
                        if (lastTradeTimestamp) {
                            const cooldown = 0.45 * 60 * 1000; // 1 minutes
                            if (Date.now() - parseInt(lastTradeTimestamp) < cooldown) {
                                continue; // Cooldown active
                            }
                        }

                        const offer = this.createTradeOffer(gameState, botPlayer, group, missingProp);
                        if (offer) {
                            const trade: Partial<Trade> = {
                                gameId: this.gameId,
                                proposerId: this.playerId,
                                responderId: ownerId,
                                offer: offer,
                                request: { properties: [missingProp.id] },
                            };
                            possibleTrades.push(trade);
                        }
                    }
                }
            }
        }

        if (possibleTrades.length > 0) {
            const bestTrade = this.evaluateProposedTrades(possibleTrades, gameState);
            if (bestTrade) {
                const result =  await proposeTrade(bestTrade);
                if(result){
                    const cooldownKey = `trade-cooldown:${this.gameId}:${this.playerId}:${bestTrade.responderId}`;
                    await redis.set(cooldownKey, Date.now().toString(), 'EX', 5 * 60); // 5 minute expiry
                    await dispatchGameEventToBotResponder(this.io, this.gameId, result, result.trade.responderId!);
                }
                return result
            }
        }
    }

    private evaluateProposedTrades(trades: Partial<Trade>[], gameState: GameState): Partial<Trade> | null {
        let bestTrade: Partial<Trade> | null = null;
        let bestTradeScore = -Infinity;

        for (const trade of trades) {
            const score = this.calculateTradeScore(trade, gameState);
            if (score > bestTradeScore) {
                bestTradeScore = score;
                bestTrade = trade;
            }
        }

        return bestTrade;
    }

    private calculateTradeScore(trade: Partial<Trade>, gameState: GameState): number {
        const botPlayer = gameState.players[this.playerId];
        const responder = gameState.players[trade.responderId!];

        const offeredValue = this.calculateTradeOfferValue(trade.offer!, botPlayer, gameState);
        const requestedValue = this.calculateTradeOfferValue(trade.request!, responder, gameState);

        return requestedValue - offeredValue;
    }

    private createTradeOffer(gameState: GameState, botPlayer: PlayerState, excludedGroup: string, requestedProperty: BoardTile): TradeOffer | null {
        const offer: TradeOffer = {};
        let offeredValue = 0;
        const requestedValue = this.calculateTradeOfferValue({ properties: [requestedProperty.id] }, botPlayer, gameState);

        const responderId = gameState.propertyStates[requestedProperty.id]?.owner;
        const key = `${responderId}-${requestedProperty.id}`;
        const declineCount = this.declinedTrades.get(key) || 0;
        const improvementFactor = 1 + (declineCount * 0.2); // 20% improvement for each decline

        // Offer a property first
        const propertyToOffer = this.findPropertyToOffer(gameState, botPlayer, excludedGroup);
        if (propertyToOffer) {
            offer.properties = [propertyToOffer.id];
            offeredValue += this.calculateTradeOfferValue({ properties: [propertyToOffer.id] }, botPlayer, gameState);
        }

        // If offered value is less than requested value, add money
        if (offeredValue < requestedValue) {
            let moneyToOffer = (requestedValue - offeredValue) * improvementFactor;
            moneyToOffer = Math.ceil(moneyToOffer / 100) * 100; // Round up to nearest 100
            if (botPlayer.money > moneyToOffer) {
                offer.money = moneyToOffer;
            } else {
                offer.money = botPlayer.money - 100; // Offer all money except 100
            }
        }

        offeredValue += offer.money || 0;

        // If the bot has a get out of jail free card and is not in jail, it can offer it
        if (botPlayer.getOutOfJailFreeCards > 0 && !botPlayer.inJail) {
            offer.getOutOfJailFreeCards = 1;
            offeredValue += 500; // Arbitrary value for the card
        }

        // If the offered value is still less than the requested value, this trade is not good for the bot
        if (offeredValue < requestedValue) {
            return null;
        }

        return offer;
    }

    private findPropertyToOffer(gameState: GameState, botPlayer: PlayerState, excludedGroup: string): BoardTile | null {
        const monopolies = this.getMonopolies(botPlayer, gameState);
        const monopolyGroups = monopolies.map(m => m.group);

        for (const propId of botPlayer.properties) {
            const property = BOARD.find(p => p.id === propId) as BoardTile;
            if (property.group !== excludedGroup && !monopolyGroups.includes(property.group)) {
                const propertyState = gameState.propertyStates[propId];
                if (propertyState && propertyState.level === 0) {
                    return property;
                }
            }
        }
        return null;
    }

    public async manageProperties(gameState: GameState) {
        try {
            let botPlayer = gameState.players[this.playerId];
            const monopolies = this.getMonopolies(botPlayer, gameState);

            if (monopolies.length > 0) {
                const sortedMonopolies = monopolies.sort((a, b) => {
                    const aRoi = this.calculateMonopolyRoi(a, gameState);
                    const bRoi = this.calculateMonopolyRoi(b, gameState);
                    return bRoi - aRoi;
                });

                for (const monopoly of sortedMonopolies) {
                    let canStillBuild = true;
                    while (canStillBuild) {
                        canStillBuild = false;
                        const groupProperties = BOARD.filter(p => p.group === monopoly.group);

                        // Find the property with the minimum level in the group
                        let minLevel = 5;
                        let propertyToBuildOn: BoardTile | null = null;
                        for (const prop of groupProperties) {
                            const propState = gameState.propertyStates[prop.id];
                            if (propState && propState.level < minLevel) {
                                minLevel = propState.level;
                                propertyToBuildOn = prop;
                            }
                        }
                      
                        if (propertyToBuildOn && propertyToBuildOn.houseCost && botPlayer.money >= propertyToBuildOn.houseCost ) {
                            let shouldBuild = false;
                            switch (this.botDifficulty) {
                                case BotDifficulty.Easy:
                                    shouldBuild = (botPlayer.money - propertyToBuildOn.houseCost) > 3000;
                                    break;
                                case BotDifficulty.Medium:
                                case BotDifficulty.Hard:
                                    shouldBuild = true;
                                    break;
                            }

                            if (shouldBuild) {
                                const r = await buildHouse(this.gameId, this.playerId, propertyToBuildOn.id, this.io);
                                if (r) {
                                    gameState = r.state;
                                    botPlayer = r.state.players[this.playerId];
                                    canStillBuild = true; // Attempt to build another house
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            // console.error(`Error in manageProperties for bot ${this.playerId}:`, e);
        }
    }

    private getMonopolies(player: PlayerState, gameState: GameState): any[] {
        const monopolies: any[] = [];
        const colorGroups = [...new Set(BOARD.filter(p => p.group).map(p => p.group!))];

        for (const group of colorGroups) {
            const groupProperties = BOARD.filter(p => p.group === group);
            const playerPropertiesInGroup = groupProperties.filter(p => player.properties.includes(p.id));

            if (playerPropertiesInGroup.length === groupProperties.length) {
                monopolies.push({ group: group, properties: playerPropertiesInGroup });
            }
        }

        return monopolies;
    }

    private calculateMonopolyRoi(monopoly: any, gameState: GameState): number {
        let totalRentIncrease = 0;
        let totalCost = 0;

        for (const prop of monopoly.properties) {
            const propertyState = gameState.propertyStates[prop.id];
            if (propertyState && propertyState.level < 5) {
                const currentRent = prop.rent[propertyState.level];
                const nextRent = prop.rent[propertyState.level + 1];
                totalRentIncrease += nextRent - currentRent;
                totalCost += prop.houseCost || 0;
            }
        }

        return totalCost > 0 ? totalRentIncrease / totalCost : 0;
    }
}
