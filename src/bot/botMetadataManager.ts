import { Server } from 'socket.io';
import { BotPlayer } from './botManager';
import { BotDifficulty } from '../types';
import { redis, setRedisJson, getRedisJson } from '../redis/redis';



export const bots = new Map<string, BotPlayer>();
// Interface for bot metadata to be stored in Redis
export interface BotMetadata {
    playerId: string;
    gameId: string;
    botDifficulty: BotDifficulty;
}

// Helper functions for bot metadata in Redis
export async function setBotMetadata(gameId: string, playerId: string, metadata: BotMetadata): Promise<void> {
    await setRedisJson(`game:${gameId}:bot_metadata`, playerId, metadata);
}

export async function getBotMetadata(gameId: string, playerId: string): Promise<BotMetadata | null> {
    return await getRedisJson<BotMetadata>(`game:${gameId}:bot_metadata`, playerId);
}

export async function deleteBotMetadata(gameId: string, playerId: string): Promise<void> {
    await redis.hdel(`game:${gameId}:bot_metadata`, playerId);
}

export async function getAllBotMetadataInGame(gameId: string): Promise<BotMetadata[]> {
    const allMetadata = await redis.hgetall(`game:${gameId}:bot_metadata`);
    if (!allMetadata) {
        return [];
    }
    return Object.values(allMetadata).map(metadataJson => JSON.parse(metadataJson) as BotMetadata);
}

// Function to create a BotPlayer instance from metadata
export function createBotPlayerInstance(metadata: BotMetadata, io: Server): BotPlayer {
    return new BotPlayer(metadata.playerId, metadata.gameId, io, metadata.botDifficulty);
}

export async function loadAllBotsFromRedis(io: Server): Promise<void> {
    // console.log("Loading all bots from Redis...");
    const botMetadataKeys = await redis.keys('game:*:bot_metadata');
    for (const key of botMetadataKeys) {
        const gameId = key.split(':')[1]; // Extract gameId from key
        const allBotMetadata = await getAllBotMetadataInGame(gameId);
        for (const metadata of allBotMetadata) {
            const bot = createBotPlayerInstance(metadata, io);
            bots.set(metadata.playerId, bot);
            // console.log(`Loaded bot: ${metadata.playerId} for game: ${metadata.gameId}`);
        }
    }
    // console.log(`Finished loading ${bots.size} bots from Redis.`);
}