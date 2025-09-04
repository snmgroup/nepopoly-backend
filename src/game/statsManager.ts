import { loadGameState } from '../game/gameState';
import { redis } from '../redis/redis';
import { GameState, PlayerState, PlayerStatsSnapshot } from '../types';

const getStatsKey = (gameId: string) => `stats:${gameId}`;

/**
 * Retrieves the full statistics history for a game.
 * @param gameId The ID of the game.
 * @returns A record of player stats history, or null if none exists.
 */
export async function getGameStats(gameId: string): Promise<Record<string, PlayerStatsSnapshot[]> | null> {
    const statsJSON = await redis.get(getStatsKey(gameId));
    return statsJSON ? JSON.parse(statsJSON) : null;
}

/**
 * Adds a new snapshot of player stats to the game's history.
 * @param gameId The ID of the game.
 * @param gameState The current state of the game.
 */
export async function addStatsSnapshot(gameId: string, gameState?: GameState): Promise<void> {

    const state = gameState || await loadGameState(gameId)
    if(!state)
        return
    const statsKey = getStatsKey(gameId);
    const currentStats = await getGameStats(gameId) || {};

    for (const playerId in state.players) {
        const player = state.players[playerId];
        if (player.status === 'active') {
            if (!currentStats[playerId]) {
                currentStats[playerId] = [];
            }
            const snapshot: PlayerStatsSnapshot = {
                turnNumber: state.turnNumber,
                money: player.money,
                netWorth: player.money + (player.assets?.totalValue || 0),
            };
            currentStats[playerId].push(snapshot);
        }
    }

    // Store for 24 hours
    await redis.set(statsKey, JSON.stringify(currentStats), 'EX', 60*60 );
}

/**
 * Deletes the stats for a given game.
 * @param gameId The ID of the game.
 */
export async function deleteGameStats(gameId: string): Promise<void> {
    await redis.del(getStatsKey(gameId));
}
