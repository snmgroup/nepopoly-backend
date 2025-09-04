import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { verifyJwtGetUser } from '../auth';
import { acceptTrade, addBot, addPlayer, buildHouse, buyProperty, cancelTrade, createGame, declineTrade, dispatchGameEventToBotResponder, endTurn, getAvailableColor, getTrade, handleAndEmitRoll, leaveGame, loadGameState, mortgageProperty, passBid, payBail, placeBid, proposeTrade, sellHouse, sellPropertyToBank, setPlayerConnected, startAuction, startGame, unmortgageProperty, useGetOutOfJailFreeCard } from '../game/gameManager';
import { GAME_SETTINGS, GameStateUpdate, PlayerAsset } from '../types';
import { SocketEvent } from './../enums/SocketEventNames';

export const initSocket = (io: Server) => {
  io.use(async (socket: any, next: any) => {
    try {
      const token = socket.handshake.auth?.token;
      const user = await verifyJwtGetUser(token);
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user 


    
    socket.on(SocketEvent.JoinRoom, async ({ gameId, playerId, name,isBot }) => {
      try {
       
        let gameState = await loadGameState(gameId);
            const pid = playerId || user?.id || uuidv4();
        if (!gameState) {
          gameState = await createGame({host:pid});
        }
        // Allow rejoining an active game if the player is already part of it
        if (gameState.status !== 'lobby' && !gameState.players[pid]) {
          return socket.emit(SocketEvent.Error, { message: 'Cannot join a game that is already in progress.' });
        }

        // If player is rejoining an active game, update their connection status
        if (gameState.status !== 'lobby' && gameState.players[pid] &&gameState.phase !=="game_over") {
            await setPlayerConnected(gameId, pid, socket.id, true);
        }
    

   

        if(!gameState.players[pid])
        {
   const player = { id: pid,isBot:true, userId: user?.id, name: name ||user?.fullName || `Player`, position:1, money:GAME_SETTINGS.initialPlayerMoney, properties:[], inJail:false, jailTurns:0, isConnected:true, order: Object.keys(gameState.players).length, socketId: socket.id, status: 'active',color:getAvailableColor(gameState),assets:{
          properties:0,houses:0,utilities:0,routes:0,totalValue:0
        } as PlayerAsset };
      const {state,event} =await addPlayer(gameState.gameId, player as any);
      gameState=state
        }
     
    
        socket.join(gameState.gameId);

        const log = gameState.eventLog.reverse()
        gameState.eventLog = log

        io.to(gameId).emit(SocketEvent.GameState, gameState);

        // io.to(state.gameId).emit(SocketEvent.Event,event );
      } catch (e:any) {
        console.log(e)
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on(SocketEvent.ReconnectPlayer, async ({ gameId, playerId }) => {
      try {
        const state = await loadGameState(gameId);
        if (!state) {
          return socket.emit(SocketEvent.Error, { message: 'Game not found.' });
        }
        const player = state.players[playerId];
        if (!player) {
          return socket.emit(SocketEvent.Error, { message: 'Player not found.' });
        }
        await setPlayerConnected(gameId, playerId, socket.id, true);
        socket.join(gameId);
        socket.emit(SocketEvent.GameState, state);
        io.to(gameId).emit(SocketEvent.Event, { type: 'PLAYER_RECONNECTED', player: player.name });
      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on(SocketEvent.StartGame, async ({ gameId }) => {
      try {
       await startGame(gameId,io,undefined,false);
    
        
     
       
    
      } catch (e:any) {
        
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on('heartbeat', async ({ gameId, playerId }) => {
      try {
       const player= await setPlayerConnected(gameId, playerId, socket.id, true);
       if(player){
     
       }
      } catch (e) {}
    });

    socket.on(SocketEvent.RollDice, async ({ gameId, playerId }) => {
     
      try {
        await handleAndEmitRoll(gameId, playerId, io);
      } catch (e:any) {
       
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on(SocketEvent.ProposeTrade, async ({ gameId, proposerId, responderId, offer, request, expiresIn }) => {
      try {
        const result = await proposeTrade({gameId, proposerId,responderId, offer, request});
        if(result) { 
          
            await dispatchGameEventToBotResponder(io, gameId, result, responderId);

            
        }
      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on(SocketEvent.AcceptTrade, async ({ gameId, tradeId, accepterId }) => {
      try {
       await acceptTrade(gameId, tradeId, accepterId,io,socket);
 
     
          //   const pState = {players,propertyStates} as Partial<GameStateUpdate>
          // io.to(gameId).emit(SocketEvent.GameStateUpdate,pState)
        

      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

        socket.on(SocketEvent.CancelTrade, async ({ gameId, tradeId, playerId }) => {
      try {
        const result =await cancelTrade(gameId, tradeId, playerId,false,io);
       
       
  
      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on(SocketEvent.DeclineTrade, async ({ gameId, tradeId, playerId }) => {
      try {
       const result= await declineTrade(gameId, tradeId, playerId);
       if(result.event) {
        io.to(gameId).emit(SocketEvent.GameEvents, result.event);
        const trade = await getTrade(gameId, tradeId);
        if(trade){
          await dispatchGameEventToBotResponder(io, gameId,{...result.event,trade},trade.responderId! );
        }
       }
      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on(SocketEvent.BuyProperty, async ({ gameId, playerId, tileId }) => {
      try {
       await buyProperty(gameId, playerId, tileId,io);
        
      
      //  const {phase,propertyStates} = state
      //  const gameEvent = {phase,propertyStates} as Partial<GameStateUpdate>;
      //   io.to(gameId).emit(SocketEvent.GameStateUpdate, gameEvent);
     
      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on(SocketEvent.EndTurn, async ({ gameId, playerId }) => {
      await endTurn(gameId, playerId,io, socket);
    });

    socket.on(SocketEvent.BuildHouse, async ({ gameId, playerId, tileId }) => {
      try {
        const{ state} = await buildHouse(gameId, playerId, tileId,io);
       
      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on(SocketEvent.SellHouse, async ({ gameId, playerId, tileId }) => {
      try {
      await sellHouse(gameId, playerId, tileId,io);
      
      
       
        // io.to(gameId).emit(SocketEvent.GameStateUpdate, {propertyStates} as Partial<GameStateUpdate>);
      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });
    socket.on(SocketEvent.SellProperty, async ({ gameId, playerId, tileId }) => {
      try {
        await sellPropertyToBank(gameId, playerId, tileId,io);
        
        // io.to(gameId).emit(SocketEvent.GameState, state);
      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on('mortgage_property', async ({ gameId, playerId, tileId }) => {
      try {
        const state = await mortgageProperty(gameId, playerId, tileId,io);
        io.to(gameId).emit(SocketEvent.GameState, state);
      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on('unmortgage_property', async ({ gameId, playerId, tileId }) => {
      try {
        const state = await unmortgageProperty(gameId, playerId, tileId,io);
        io.to(gameId).emit(SocketEvent.GameState, state);
      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on(SocketEvent.PayBail, async ({ gameId, playerId }) => {
      try {
     await payBail(gameId, playerId,io);
      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on(SocketEvent.UseGooJfCard, async ({ gameId, playerId }) => {
      try {
       await useGetOutOfJailFreeCard(gameId, playerId,io);
        // TODO
        // io.to(gameId).emit(SocketEvent.GameState, state);
      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    // socket.on('roll_for_jail', async ({ gameId, playerId }) => {
    //   try {
    //     const result = await rollForJail(gameId, playerId);
    //     io.to(gameId).emit(SocketEvent.Event, { type: 'ROLL_FOR_JAIL_RESULT', data: result, playerId });
    //   } catch (e:any) {
    //     socket.emit(SocketEvent.Error, { message: e.message });
    //   }[[]]
    // });



    socket.on(SocketEvent.LeaveGame, async ({ gameId, playerId }) => {
      try {
        await leaveGame(gameId, playerId,io);
        io.to(gameId).emit(SocketEvent.Event, { type: 'PLAYER_LEFT', playerId });
      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on('start_auction', async ({ gameId, tileId }) => {
      try {
        const state = await startAuction(gameId, tileId);
        io.to(gameId).emit(SocketEvent.GameState, state);
        io.to(gameId).emit(SocketEvent.Event, { type: 'AUCTION_STARTED', tileId });
      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on('place_bid', async ({ gameId, playerId, bidAmount }) => {
      try {
        const state = await placeBid(gameId, playerId, bidAmount);
        io.to(gameId).emit(SocketEvent.GameState, state);
        io.to(gameId).emit(SocketEvent.Event, { type: 'AUCTION_BID_PLACED', playerId, bidAmount });
      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on('pass_bid', async ({ gameId, playerId }) => {
      try {
        const state = await passBid(gameId, playerId);
        io.to(gameId).emit(SocketEvent.GameState, state);
        io.to(gameId).emit(SocketEvent.Event, { type: 'AUCTION_PASSED', playerId });
      } catch (e:any) {
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on(SocketEvent.AddBot, async ({ gameId }) => {
      try {
        const {state,event} = await addBot(gameId, io);
        const{players,order,phase,status} = state
        const uState = {players,order,phase,status} as Partial<GameStateUpdate>
        io.to(gameId).emit(SocketEvent.GameStateUpdate, uState);
        io.to(gameId).emit(SocketEvent.GameEvents,event)
      
      } catch (e:any) {
        console.log(e)
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on(SocketEvent.SendMessage, async ({ gameId, message,id }) => {
      try {
       
        const user = (socket as any).user;
        const playerId = user.id;
        const gameState = await loadGameState(gameId);
        if (!gameState) {
          return socket.emit(SocketEvent.Error, { message: 'Game not found.' });
        }
        const player = gameState.players[playerId];
        if (!player) {
          return socket.emit(SocketEvent.Error, { message: 'Player not found in this game.' });
        }
        const chatMessage = {
            id,
          playerId,
          name: player.name,
          message,
          ts: new Date().toISOString(),
        };
        io.to(gameId).emit(SocketEvent.NewMessage, chatMessage);
           
      } catch (e: any) {
        console.log(e)
        socket.emit(SocketEvent.Error, { message: e.message });
      }
    });

    socket.on(SocketEvent.Disconnect, async () => {
      console.log('socket disconnect', socket.id);
      // mark player disconnected (best effort - in production map socket->player)
    });
  });
};
