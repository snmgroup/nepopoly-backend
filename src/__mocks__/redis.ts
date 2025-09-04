import inMemoryEventsStates from "./in_game_events";
import inMemoryGameStates from "./in_game_memory";
import inMemoryTrades from "./in_memory_trades";

const inMemoryLocks = new Map<string, string>();
const inMemoryStats = new Map<string, any>();

export const redis = {
  get: jest.fn(async (key: string) => {
    if (key.startsWith("stats:")) {
      const stats = inMemoryStats.get(key);
      return stats ? JSON.stringify(stats) : null;
    }
    if (key.startsWith("game:")) {
      const id = key.replace("game:", "");
      const state = inMemoryGameStates.get(id);
      return state ? JSON.stringify(state) : null;
    }
    if (key.startsWith("events:")) {
      const id = key.replace("events:", "");
      const state = inMemoryEventsStates.get(id);
      return state ? JSON.stringify(state) : null;
    }
    if (key.startsWith("trade:")) {
      const trade = inMemoryTrades.get(key);
      return trade ? JSON.stringify(trade) : null;
    }
    if (key.startsWith("lock:")) {
       return inMemoryLocks.get(key) || null;
    }
    return null;
  }),
  set: jest.fn(async (key: string, value: string, ...args: any[]) => {
    if (key.startsWith("stats:")) {
      inMemoryStats.set(key, JSON.parse(value));
    }
    else if (key.startsWith("lock:")) {
      const nx = args.includes("NX");
      if (nx && inMemoryLocks.has(key)) {
        return null; // Lock already exists
      }
      inMemoryLocks.set(key, value);
      return "OK";
    }
    else if (key.startsWith("game:")) {
      const id = key.replace("game:", "");
      inMemoryGameStates.set(id, JSON.parse(value));
    } else if (key.startsWith("trade:")) {
      inMemoryTrades.set(key, JSON.parse(value));
    }
    else if(key.startsWith("events:")){
       const id = key.replace("events:", "");
      inMemoryEventsStates.set(id, JSON.parse(value));
    }
    return "OK";
  }),
  del: jest.fn(async (key: string) => {
     if (key.startsWith("stats:")) {
      inMemoryStats.delete(key);
    }
    else if (key.startsWith("game:")) {
      const id = key.replace("game:", "");
      inMemoryGameStates.delete(id);
    } else if (key.startsWith("trade:")) {
      inMemoryTrades.delete(key);
    }
     else if (key.startsWith("lock:")) {
      inMemoryLocks.delete(key);
    }
    else if(key.startsWith("events:")){
       const id = key.replace("events:", "");
      inMemoryEventsStates.delete(id);
    }
    return 1;
  }),
  keys: jest.fn(async (pattern: string) => {
    const allKeys = [
      ...Array.from(inMemoryGameStates.keys()).map(id => `game:${id}`),
      ...Array.from(inMemoryEventsStates.keys()).map(id => `events:${id}`),
      ...Array.from(inMemoryTrades.keys()),
      ...Array.from(inMemoryLocks.keys()),
      ...Array.from(inMemoryStats.keys()),
    ];
    
    const regex = new RegExp(pattern.replace('* ', '.*'));
    return allKeys.filter(key => regex.test(key));
  }),
};

export const gameKey = (gameId: string) => `game:${gameId}`;
export const gameEventsKey = (gameId: string) => `events:${gameId}`;
export const lockKey = (gameId:string) => `lock:${gameId}`;