import { Queue, Worker } from 'bullmq';
import { redis } from '../redis/redis';
import { cancelTrade, loadTrade } from '../game/gameActions'; // Added handleEndTurn
import { Jobs } from '../enums/jobNames';
import { io } from '../index'; // Import io from index.ts
import { loadGameState } from '../game/gameState'; // Import loadGameState
import { endTurn } from '../game/gameManager';
import { addStatsSnapshot } from '../game/statsManager';
import { GAME_SETTINGS } from '../types';
import { SocketEvent } from '../enums/SocketEventNames';

const queueName = 'game-jobs';

export const gameQueue = new Queue(queueName, { connection: redis });

const worker = new Worker(queueName, async job => {
  switch(job.name){
    case Jobs.TradeExpired:
      const { gameId: tradeGameId, tradeId, playerId: tradePlayerId } = job.data;
      try {
          const trade = await loadTrade(tradeGameId,tradeId)
          if(trade && trade.status==="pending")
        await cancelTrade(tradeGameId, tradeId, tradePlayerId,true,io);
        // console.log(`Trade ${tradeId} in game ${gameId} has expired.`);
      } catch (error) {
        // console.error(`Error expiring trade ${tradeId} in game ${gameId}:`, error);
      }
      break;

    case Jobs.TurnTimerExpired:
      const { gameId: turnGameId, playerId: turnPlayerId } = job.data;
      try {
        const state = await loadGameState(turnGameId);
        if (state && state.turn === turnPlayerId) {
          const playaer = state.players[turnPlayerId]!

          if(playaer.isBot)
          await endTurn(turnGameId, turnPlayerId, io);
        else
        {
          //player is stalling
          //do some io stuff to remind player.
          if(playaer.socketId)
          io.to(playaer.socketId).emit(SocketEvent.GameEvents,{type:"REMIND_TURN"})
          // console.log("player is stalling")
          await addTurnExpiryJob(turnGameId,turnPlayerId)
        }
        } 
      } catch (error) {
        console.error(`Error handling turn timer expiration for player ${turnPlayerId} in game ${turnGameId}:`, error);
      }
      break;

      case Jobs.CalculateStats:
        try{
          const {gameId} = job.data
           await addStatsSnapshot(gameId);
        }
        catch(e){

        }
      break;
    default:
      console.warn(`Unknown job type: ${job.name}`);
  }
}, { connection: redis });

worker.on('completed', job => {
  // console.log(`${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
  console.log(`${job?.id} has failed with ${err.message}`);
});




export async function addTurnExpiryJob(gameId:string,turn?:string){

    if (turn) {
       const nextTurnJobId = `turn-timer-${gameId}-${turn}`;
     await gameQueue.remove(nextTurnJobId)
            const turnTimeLimit = GAME_SETTINGS.turnTimeLimit; // Use the defined turn time limit
           
            await gameQueue.add(Jobs.TurnTimerExpired, {
                gameId: gameId,
                playerId: turn,
            }, {
                delay: turnTimeLimit,
                jobId: nextTurnJobId, // Use a predictable job ID for easy removal
            });
        }
}