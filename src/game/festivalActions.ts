import { GameState, PlayerState, FestivalEventType, FESTIVAL_CARDS, CardType } from '../types';
import { applyCardEffect } from './gameActions'; // Assuming applyCardEffect is in gameActions.ts
import { Server } from 'socket.io';


export function handleFestivalTile(gameState: GameState, player: PlayerState, diceRoll: number[],io:Server): GameState {
  const diceSum = diceRoll[0] + diceRoll[1];
  let updatedGameState = { ...gameState };
  let updatedPlayer = { ...player };
  let eventDescription: string;

  // Determine event based on diceSum (simple modulo for now)
  const eventIndex = diceSum % Object.keys(FestivalEventType).length;
  const eventType = Object.values(FestivalEventType)[eventIndex];

  switch (eventType) {
    case FestivalEventType.FESTIVAL_CARD:
      const cardIndex = Math.floor(Math.random() * FESTIVAL_CARDS.length);
      const card = FESTIVAL_CARDS[cardIndex];
      eventDescription = `Drew a Festival Card: ${card.description}`;
      // applyCardEffect(gameState.gameId,updatedGameState, updatedPlayer.id, card,io);
      break;
    case FestivalEventType.SKIP_NEXT_TURN:
      // This requires a mechanism to skip the player's next turn.
      // For now, I'll just log it. Actual implementation might involve a flag on PlayerState.
      eventDescription = `Skip your next turn due to exhaustion.`;
        player.skipTurn=true
      break;
    case FestivalEventType.RENT_BONUS:
      // This requires a mechanism to double the next rent payment.
      // For now, I'll just log it. Actual implementation might involve a flag on PlayerState.
      eventDescription = `Your next rent payment will be doubled.`;
      player.rentBonus=true
      break;
    case FestivalEventType.PAY_FEE:
      const feeAmount = 500; // Example fee
      updatedPlayer.money -= feeAmount;
      eventDescription = `Paid Rs ${feeAmount} for festival entry.`;
      break;
    case FestivalEventType.RECEIVE_MONEY:
      const bonusAmount = 1000; // Example bonus
      updatedPlayer.money += bonusAmount;
      eventDescription = ` Received Rs ${bonusAmount} as Dashain dakshina.`;
      break;
    default:
      eventDescription = `Landed on Festival! Nothing special happened.`;
      break;
  }

  updatedGameState.players[updatedPlayer.id] = updatedPlayer;
  updatedGameState.eventLog.push();

  return updatedGameState;
}