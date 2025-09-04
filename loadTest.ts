import { createGame, startGame, addBot, saveGameState, loadGameState } from './src/game/gameManager';
import { GameState, } from './src/types';
import { Server } from 'socket.io';
import { redis } from './src/__mocks__/redis.load-test';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { bots } from './src/bot/botMetadataManager';

// --- Test Configuration ---
const NUM_CONCURRENT_GAMES = 1;
const NUM_BOTS_PER_GAME = 4;
const MAX_TURNS_PER_GAME = 400;

const STATS_FILE = path.join(__dirname, 'loadTestStats.json');

const io = new Server();

interface GameResult {
    gameNumber: number;
    duration: number;
    turnNumber: number;
    winner: string | null;
    endReason: 'finished' | 'max_turns' | 'no_winner' | 'error';
    error?: string;
}

interface LoadTestStats {
    totalTimeTaken: number;
    successfulGames: number;
    failedGames: number;
    maxTurnGames: number;
    noWinnerGames: number;
    averageGameDuration: number;
    averageTurnCount: number;
    timestamp: string;
}

async function runSingleGame(gameNumber: number): Promise<GameResult> {
    const gameId = `load-test-game-${gameNumber}-${uuidv4()}`;
    let state: GameState;
    const startTime = Date.now();

    try {
        state = await createGame({ gameId });

        for (let i = 0; i < NUM_BOTS_PER_GAME; i++) {
            const { state: st } = await addBot(gameId, io);
            state = st;
        }
        await saveGameState(gameId, state);

        state = await startGame(gameId,io, state, false, true);
        console.log(`\rGame ${gameNumber} Started`);
        await new Promise<void>((resolve) => {
            const interval = setInterval(async () => {
                const currentState = await loadGameState(gameId);
                if (currentState?.phase === "game_over" || currentState?.order.length! <= 1) {
                    clearInterval(interval);
                    resolve();
                }
            }, 2000);
        });

        state = await loadGameState(gameId) as GameState;
        const duration = (Date.now() - startTime) / 1000;

        if (state.phase === 'game_over' || state.order.length <= 1) {
            const winnerName = state.players[state.order[0]]?.name || 'Unknown';
            return { gameNumber, duration, turnNumber: state.turnNumber, winner: winnerName, endReason: 'finished' };
        } else {
            const reason = state.turnNumber >= MAX_TURNS_PER_GAME ? 'max_turns' : 'no_winner';
            return { gameNumber, duration, turnNumber: state.turnNumber, winner: null, endReason: reason };
        }

    } catch (error: any) {
        const duration = (Date.now() - startTime) / 1000;
        console.log(error)
        return { gameNumber, duration, turnNumber: 0, winner: null, endReason: 'error', error: error.message };
    } finally {
        // Cleanup
        await redis.del(`game:${gameId}`);
        await redis.del(`events:${gameId}`);
        await redis.del(`stats:${gameId}`);
        await redis.del(`trade:${gameId}`);
    }
}

async function runLoadTest() {
    console.log(`--- Starting Concurrency Load Test ---`);
    console.log(`- Concurrent Games: ${NUM_CONCURRENT_GAMES}`);
    console.log(`- Bots per Game: ${NUM_BOTS_PER_GAME}`);
    console.log(`--------------------------------------`);
    const overallStartTime = Date.now();

    const gamePromises: Promise<GameResult>[] = [];
    let completedGames = 0;

    for (let i = 1; i <= NUM_CONCURRENT_GAMES; i++) {
        gamePromises.push(runSingleGame(i).then(result => {
            completedGames++;
            const remaining = NUM_CONCURRENT_GAMES - completedGames;
            process.stdout.write(`\rGames Completed: ${completedGames}/${NUM_CONCURRENT_GAMES} | Remaining: ${remaining}`);
            return result;
        }));
    }

    const results = await Promise.all(gamePromises);
    bots.clear();
    const overallDuration = (Date.now() - overallStartTime) / 1000;

    console.log(`\n--- Load Test Finished ---`);
    console.log(`Total time taken: ${overallDuration.toFixed(2)}s`);

    const successfulGames = results.filter(r => r.endReason === 'finished');
    const failedGames = results.filter(r => r.endReason === 'error');
    const maxTurnGames = results.filter(r => r.endReason === 'max_turns');
    const noWinnerGames = results.filter(r => r.endReason === 'no_winner');

    const averageGameDuration = successfulGames.reduce((acc, r) => acc + r.duration, 0) / successfulGames.length || 0;
    const averageTurnCount = successfulGames.reduce((acc, r) => acc + r.turnNumber, 0) / successfulGames.length || 0;

    const currentStats: LoadTestStats = {
        totalTimeTaken: overallDuration,
        successfulGames: successfulGames.length,
        failedGames: failedGames.length,
        maxTurnGames: maxTurnGames.length,
        noWinnerGames: noWinnerGames.length,
        averageGameDuration: averageGameDuration,
        averageTurnCount: averageTurnCount,
        timestamp: new Date().toISOString(),
    };

    // Read existing stats and append/update
    let allStats: { [key: string]: LoadTestStats } = {};
    if (fs.existsSync(STATS_FILE)) {
        try {
            const fileContent = fs.readFileSync(STATS_FILE, 'utf8');
            allStats = JSON.parse(fileContent);
        } catch (error) {
            console.error(`Error reading or parsing stats file ${STATS_FILE}: `, error);
        }
    }

    allStats[NUM_CONCURRENT_GAMES.toString()] = currentStats;

    try {
        fs.writeFileSync(STATS_FILE, JSON.stringify(allStats, null, 2), 'utf8');
        console.log(`Load test stats saved to ${STATS_FILE}`);
    } catch (error) {
        console.error(`Error writing stats file ${STATS_FILE}: `, error);
    }

    console.log(`\n--- Results ---`);
    console.log(`- ${currentStats.successfulGames}/${NUM_CONCURRENT_GAMES} games completed successfully.`);
    console.log(`- ${currentStats.failedGames} games failed with errors.`);
    console.log(`- ${currentStats.maxTurnGames} games reached max turns.`);
    console.log(`- ${currentStats.noWinnerGames} games finished without a winner.`);

    console.log(`\n--- Stats for Successful Games ---`);
    console.log(`- Average game duration: ${currentStats.averageGameDuration.toFixed(2)}s`);
    console.log(`- Average turn count: ${currentStats.averageTurnCount.toFixed(2)}`);

    if (failedGames.length > 0) {
        console.log(`\n--- Error Details ---`);
        failedGames.slice(0, 5).forEach(r => {
            console.log(`- Game ${r.gameNumber}: ${r.error}`);
        });
        if(failedGames.length > 5) {
            console.log(`- ... and ${failedGames.length - 5} more errors`);
        }
    }
    console.log(`--------------------------`);
}

runLoadTest();
