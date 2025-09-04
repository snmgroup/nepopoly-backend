// // jest.setup.ts

// // Mock ioredis
jest.mock('ioredis', () => {
  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(), // Added for common lock patterns
    on: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    // Add any other ioredis commands your application uses
  };
  return jest.fn(() => mockRedisClient);
});

// // Mock socket.io server
jest.mock('socket.io', () => {
  const mockSocket = {
    emit: jest.fn(),
    on: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    // Add other socket methods your code uses
  };

  const mockIo = {
    on: jest.fn((event, callback) => {
      // Simulate connection event if needed for specific tests
      if (event === 'connection') {
        // You might want to manually call this in tests if you need to simulate connections
        // callback(mockSocket);
      }
    }),
    emit: jest.fn(),
    to: jest.fn(() => mockSocket), // For broadcasting to rooms
    sockets: {
      adapter: {
        rooms: new Map(), // Mock rooms if your code interacts with them
      },
      fetchSockets: jest.fn(() => Promise.resolve([mockSocket])), // For fetching sockets
    },
    // Add other io server methods your code uses
  };

  return {
    Server: jest.fn(() => mockIo), // Mock the Server class
  };
});

// // Mock a generic Redis lock release mechanism
// // Assuming you have a function or class that handles Redis locks.
// // Adjust this mock based on how your lock mechanism is implemented.
// // For example, if you have a function `releaseLock(key)`:
jest.mock('./src/redisLock', () => ({
  acquireLock: jest.fn(() => Promise.resolve(true)), // Assume lock acquisition always succeeds
  releaseLock: jest.fn(() => Promise.resolve(true)), // Assume lock release always succeeds
  // If you have a class like `RedisLockManager`:
  // RedisLockManager: jest.fn(() => ({
  //   acquire: jest.fn(() => Promise.resolve(true)),
  //   release: jest.fn(() => Promise.resolve(true)),
  // })),
}));

// // You can also add global beforeEach/afterEach hooks here if needed
beforeEach(() => {
  jest.clearAllMocks(); // Clears mock calls and reset mock implementations before each test
});
jest.mock("/src/redis.ts");