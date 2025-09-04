import { GameState, PlayerState, BOARD, BoardTile } from '../types';

export class DoctorBot {
  private turn = 0;

  public checkGameState(gameState: GameState) {
    //  const newEvents = gameState.eventLog.slice(this.lastEventLogLength);
    // console.log(newEvents);
    //  this.lastEventLogLength = gameState.eventLog.length;

    

    // this.checkPlayerState(gameState);
    // this.checkPropertyState(gameState);
    // this.checkGameRules(gameState);
    // this.checkMonopolyIntegrity(gameState);
    // this.checkHouseAndHotelLimits(gameState);
    // this.checkJailState(gameState);
    
    process.stdout.clearLine(1);
      process.stdout.cursorTo(1);

      const pl=gameState!.players[gameState!.turn]
      if(pl){

        let bl =""
       const mn= gameState.order.map((e)=> `${gameState.players[e]?.money??""}:${gameState.players[e]?.debtAmount??""}`)
       bl = mn.join(",")
      process.stdout.write(`${this.turn++}=> turn:${pl.name}-${gameState!.turn} left:${gameState!.order.length} ${bl}`) 
      }
      else
        process.stdout.write("oops")
     
      // 👍 ${newEvents.map((e)=>`${e.type} ${gameState.turn} ${gameState.players[e.playerId]??
       
  }

  private checkPlayerState(gameState: GameState) {
    for (const playerId in gameState.players) {
      const player = gameState.players[playerId];

      if (player.money < 0 && player.status !== 'bankrupt') {
        throw new Error(`Player ${player.name} has negative money but is not bankrupt.`);
      }

      if (player.position < 1 || player.position > 40) {
        throw new Error(`Player ${player.name} is out of bounds.`);
      }

      for (const propertyId of player.properties) {
        const property = BOARD.find(p => p.id === propertyId);
        if (!property) {
          throw new Error(`Player ${player.name} has a non-existent property.`);
        }
        if (gameState.propertyStates[propertyId]?.owner !== playerId) {
            throw new Error(`Player ${player.name} has property ${property.name} in their list, but the property state says it is owned by someone else.`);
        }
      }
    }
  }

  private checkPropertyState(gameState: GameState) {
    for (const propertyId in gameState.propertyStates) {
      const propertyState = gameState.propertyStates[propertyId];
      const property = BOARD.find(p => p.id === parseInt(propertyId)) as BoardTile;

      if (propertyState.owner) {
        const owner = gameState.players[propertyState.owner];
        if (!owner) {
          throw new Error(`Property ${property.name} has a non-existent owner.`);
        }
        if (!owner.properties.includes(parseInt(propertyId))) {
          throw new Error(`Property ${property.name} is owned by ${owner.name} but not in their property list.`);
        }
      }

      if (propertyState.level > 0 && propertyState.mortgaged) {
        throw new Error(`Property ${property.name} has houses but is mortgaged.`);
      }
    }
  }

  private checkGameRules(gameState: GameState) {
    // More checks can be added here.
  }

  private checkMonopolyIntegrity(gameState: GameState) {
    const monopolies = this.getMonopolies(gameState);
    for (const monopoly of monopolies) {
      const groupProperties = BOARD.filter(p => p.group === monopoly.group);
      for (const property of groupProperties) {
        if (gameState.propertyStates[property.id]?.owner !== monopoly.owner) {
          throw new Error(`Monopoly integrity check failed for group ${monopoly.group}.`);
        }
      }
    }
  }

  private getMonopolies(gameState: GameState): { group: string, owner: string }[] {
    const monopolies: { group: string, owner: string }[] = [];
    const colorGroups = [...new Set(BOARD.filter(p => p.group).map(p => p.group!))];

    for (const group of colorGroups) {
      const groupProperties = BOARD.filter(p => p.group === group);
      const firstPropertyOwner = gameState.propertyStates[groupProperties[0].id]?.owner;
      if (firstPropertyOwner) {
        const isMonopoly = groupProperties.every(p => gameState.propertyStates[p.id]?.owner === firstPropertyOwner);
        if (isMonopoly) {
          monopolies.push({ group, owner: firstPropertyOwner });
        }
      }
    }

    return monopolies;
  }

  private checkHouseAndHotelLimits(gameState: GameState) {
    for (const propertyId in gameState.propertyStates) {
      const propertyState = gameState.propertyStates[propertyId];
      if (propertyState.level > 5) {
        const property = BOARD.find(p => p.id === parseInt(propertyId)) as BoardTile;
        throw new Error(`Property ${property.name} has more than 5 houses/hotels.`);
      }
    }
  }

    private checkJailState(gameState: GameState) {
        for (const playerId in gameState.players) {
            const player = gameState.players[playerId];
            if (player.inJail) {
                if (player.jailTurns < 0 || player.jailTurns > 3) {
                    throw new Error(`Player ${player.name} has an invalid number of jail turns.`);
                }
            }
        }
    }
}