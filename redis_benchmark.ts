
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { addBot, createGame } from './src/game/gameState';
import { redis } from './src/redis/redis';
import { BOARD, GameState } from './src/types';

const io = new Server();
async function runBenchmark() {
  console.log('Starting Redis benchmark...');

  // 1. Create a realistic GameState object
  const gameId = uuidv4();
  const player1Id = uuidv4();
  const player2Id = uuidv4();

  const partialGameState: Partial<GameState> = {
    gameId: gameId,
    host: player1Id,
    players: {},
    order: [],
    turn: '',
    phase: 'before_roll',
    propertyStates: {},
    deck: { chance: [], community: [] },
    eventLog: [],
    status: 'lobby',
    turnNumber: 0,
  };

await createGame(partialGameState);

  await addBot(gameId,io,)
  await addBot(gameId,io,)
  await addBot(gameId,io,)
 let { state:game} = await addBot(gameId,io,)


   BOARD.forEach((tile)=>{
    if(tile.type==="property"||tile.type==="utility"||tile.type==="route")
      game.propertyStates[tile.id] = {owner:uuidv4(),level:5}
   })


  const gameStateString = JSON.stringify(game);
  const gameStateObject = JSON.parse(gameStateString);


  const NUM_OPERATIONS = 10000;

  // Benchmark SET
  console.log(`
Benchmarking ${NUM_OPERATIONS} SET operations...`);
  const setStartTime = process.hrtime();
  for (let i = 0; i < NUM_OPERATIONS; i++) {
    await redis.set(`benchmark_game:${i}`, JSON.stringify(gameStateObject));
  }
  const setEndTime = process.hrtime(setStartTime);
  const setDuration = (setEndTime[0] * 1e9 + setEndTime[1]) / 1e6; // in milliseconds
  console.log(`SET operations completed in ${setDuration.toFixed(2)}ms`);
  console.log(`Average SET latency: ${(setDuration / NUM_OPERATIONS).toFixed(4)}ms`);
  console.log(`SET operations per second: ${(NUM_OPERATIONS / (setDuration / 1000)).toFixed(2)}`);


  // Benchmark GET
  console.log(`
Benchmarking ${NUM_OPERATIONS} GET operations...`);
  const getStartTime = process.hrtime();
  for (let i = 0; i < NUM_OPERATIONS; i++) {
    const raw = await redis.get(`benchmark_game:${i}`);
    if(raw)
        JSON.parse(raw);
  }
  const getEndTime = process.hrtime(getStartTime);
  const getDuration = (getEndTime[0] * 1e9 + getEndTime[1]) / 1e6; // in milliseconds
  console.log(`GET operations completed in ${getDuration.toFixed(2)}ms`);
  console.log(`Average GET latency: ${(getDuration / NUM_OPERATIONS).toFixed(4)}ms`);
  console.log(`GET operations per second: ${(NUM_OPERATIONS / (getDuration / 1000)).toFixed(2)}`);

  // Clean up benchmark keys
  console.log('Cleaning up benchmark keys...');
  const keys = await redis.keys('benchmark_game:*');
  if (keys.length > 0) {
    await redis.del(keys);
    console.log(`Deleted ${keys.length} benchmark keys.`);
  }


  redis.quit();
}

runBenchmark().catch(console.error);
