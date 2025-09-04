

import { redis} from './src/redis/redis';



// async function addWareHouses(){
//     await redis.geoadd(
//   "warehouses",
//   85.324, 27.7172, "wh:ktm_1",   // Thamel
//   85.336, 27.7000, "wh:ktm_2",   // New Road
//   85.320, 27.6750, "wh:ktm_3",   // Kalanki
//   85.350, 27.7100, "wh:ktm_4",   // New Baneshwor
//   85.362, 27.7175, "wh:ktm_5",   // Tinkune
//   85.295, 27.7140, "wh:ktm_6",   // Swayambhu
//   85.344, 27.7400, "wh:ktm_7",   // Chabahil
//   85.310, 27.7000, "wh:ktm_8",   // Teku
//   85.375, 27.6700, "wh:ktm_9",   // Gwarko
//   85.330, 27.7300, "wh:ktm_10",  // Maharajgunj
//   85.305, 27.7350, "wh:ktm_11",  // Balaju
//   85.355, 27.6850, "wh:ktm_12",  // Satdobato
//   85.340, 27.7500, "wh:ktm_13",  // Boudha
//   85.325, 27.7650, "wh:ktm_14",  // Tokha
//   85.365, 27.7300, "wh:ktm_15"   // Koteshwor
// );
// }
// async function test(){




//   // Example user coordinates (replace with actual values as needed)
//   const userLon = 85.324;
//   const userLat = 27.7172;
//     console.log(new Date())
//   const nearest = await redis.geosearch(
//     "warehouses",
//     "FROMLONLAT",
//     userLon,
//     userLat,
//     "BYRADIUS",
//     10,
//     "km",
//     "ASC",
//     "COUNT",
//     1
//   );
//       console.log(new Date())
//     console.log("nearest", nearest);


// }

// addWareHouses()
// test()



const ITERATIONS = 500; // lower than 1000 because GameState is bigger

// Example GameState (simplified but similar to yours)
const gameState = {
  gameId: "game123",
  turn: "player1",
  players: {
    player1: {
      id: "player1",
      name: "Alice",
      position: 0,
      money: 1500,
      properties: [],
      inJail: false,
      jailTurns: 0,
      getOutOfJailFreeCards: 0,
    },
    player2: {
      id: "player2",
      name: "Bob",
      position: 0,
      money: 1500,
      properties: [],
      inJail: false,
      jailTurns: 0,
      getOutOfJailFreeCards: 0,
    },
  },
  propertyStates: {},
  chanceDeck: [],
  communityDeck: [],
  auction: null,
};

async function benchmarkSet() {
  const key = "game:set";
  await redis.set(key, JSON.stringify(gameState));

  // --- Updates (increment player1 money) ---
  console.time("SET updates");
  for (let i = 0; i < ITERATIONS; i++) {
    const data = await redis.get(key);
    const obj = JSON.parse(data!);
    obj.players.player1.money += 10;
    await redis.set(key, JSON.stringify(obj));
  }
  console.timeEnd("SET updates");

  // --- Reads full object ---
  console.time("SET full GET");
  for (let i = 0; i < ITERATIONS; i++) {
    await redis.get(key);
  }
  console.timeEnd("SET full GET");
}

async function benchmarkJson() {
  const key = "game:json";
  await redis.call("JSON.SET", key, "$", JSON.stringify(gameState));

  // --- Updates (increment player1 money) ---
  console.time("JSON.SET updates");
  for (let i = 0; i < ITERATIONS; i++) {
    await redis.call("JSON.NUMINCRBY", key, "$.players.player1.money", 10);
  }
  console.timeEnd("JSON.SET updates");

  // --- Reads full object ---
  console.time("JSON.GET full");
  for (let i = 0; i < ITERATIONS; i++) {
    await redis.call("JSON.GET", key, "$");
  }
  console.timeEnd("JSON.GET full");

  // --- Reads partial field ---
  console.time("JSON.GET partial (player1.money)");
  for (let i = 0; i < ITERATIONS; i++) {
    await redis.call("JSON.GET", key, "$.players.player1.money");
  }
  console.timeEnd("JSON.GET partial (player1.money)");
}

async function main() {
  console.log(`Running ${ITERATIONS} iterations with GameState...\n`);
  await benchmarkSet();
  await benchmarkJson();
  await redis.quit();
}

main().catch(console.error);

