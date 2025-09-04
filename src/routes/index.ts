import express from 'express';
import { clearAllGames, createGame, getAvailableGames, joinGame, loadGameState, getActiveGame, getSuitableGame } from '../game/gameManager';
import { GameState, getGameConfig } from '../types';
import { addPlayer, createPlayerState } from '../game/gameState';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();
router.use(authMiddleware);

router.post('/api/games', async (req, res) => {
  try {
    const user = req.user;
    const displayName = user.user_metadata["display_name"];

    // 1. Check for an active game for the player
    // const activeGame = await getActiveGame(user.id);
    // if (activeGame) {
    //   return res.status(200).json(activeGame);
    // }

    const player = createPlayerState({ id: user.id, name: displayName || user.email || 'Player', userId: user.id });

    // 2. Find an available game in the lobby
    const availableGames = await getAvailableGames();
    if (availableGames.length > 0) {
      const gameToJoin = availableGames[0];
      const game = await joinGame(gameToJoin.gameId, player);
      return res.json(game);
    } else {
      // 3. Create a new game if no games are available
      const newGame = await createGame({ host: player.id });
      const { state } = await addPlayer(newGame.gameId, player);
      return res.status(201).json(state);
    }
  } catch (e: any) {
    console.log(e)
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/games', async (req, res) => {
  try {
    const games = await getAvailableGames();
    res.json(games);
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/games/join', async (req, res) => {
  try {
    const user = req.user;
    const availableGames = await getAvailableGames();
    const player = createPlayerState({ id: user.id, name: req.body.name || user.email || 'Player', userId: user.id, isBot: false });
    if (availableGames.length > 0) {
      const gameToJoin = availableGames[0];[]
      const game = await joinGame(gameToJoin.gameId, player);
      res.json(game);
    } else {
      const game = await createGame({ players: { [player.id]: player }, order: [player.id] });
      res.status(201).json(game);
    }
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/games/:id/state', async (req, res) => {
  const state = await loadGameState(req.params.id);
  if (!state) return res.status(404).json({ error: 'not found' });
  res.json(state);
});

router.post('/api/games/:id/snapshot', async (req, res) => {
  const state = await loadGameState(req.params.id);
  if (!state) return res.status(404).json({ error: 'not found' });
  // snapshot persisted by gameManager.saveGameState already - force one
  res.json({ ok:true });
});

router.get('/api/game/config', (req, res) => {
  res.json(getGameConfig());
});

export default router;
