import { createAdapter } from '@socket.io/redis-adapter'; // Correct import for socket.io-redis
import cors from "cors";
import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import Redis from 'ioredis'; // Using ioredis as it's already a dependency
import { Server } from 'socket.io';
import { loadAllBotsFromRedis } from './bot/botMetadataManager';
import routes from './routes';
import { initSocket } from './socket/index';
import { clearAllGames } from './game/gameManager';
dotenv.config();

const app = express();
app.use(cors())
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, {
  
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Redis Adapter setup
const redisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

const pubClient = new Redis(redisOptions);
const subClient = new Redis(redisOptions);

io.adapter(createAdapter(pubClient, subClient));

initSocket(io);

app.use(routes);

server.listen(PORT, async () => {
  console.log('Server listening on', PORT);
  // await clearAllGames();
  await loadAllBotsFromRedis(io);
});

export { io };
