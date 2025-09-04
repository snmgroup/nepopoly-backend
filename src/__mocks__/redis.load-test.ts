// Jest-free mock for load testing
const inMemoryStore = new Map<string, string>();

export const redis = {
  async get(key: string): Promise<string | null> {
    return inMemoryStore.get(key) || null;
  },
  async set(key: string, value: string): Promise<'OK'> {
    inMemoryStore.set(key, value);
    return 'OK';
  },
  async del(key: string): Promise<number> {
    return inMemoryStore.delete(key) ? 1 : 0;
  },
  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace('*', '.*'));
    const allKeys = Array.from(inMemoryStore.keys());
    return allKeys.filter(key => regex.test(key));
  }
};
