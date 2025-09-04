export type TileType = 'start' | 'property' | 'tax' | 'route' | 'chance' | 'community' | 'festival' | 'jail' | 'go_to_jail' | 'utility';
export type SubTileType = 'airport' | 'highway' | 'electricity';
export interface BoardTile {
  id: number;
  name: string;
  type: TileType;
  subType?: SubTileType;
  group?: string; // For properties (color group)
  cost?: number; // Purchase price for properties, routes, utilities
  baseRent?: number; // Base rent for properties
  rent?: number[]; // Rent for properties with houses/hotel
  houseCost?: number; // Cost to build a house
  mortgageValue?: number; // Mortgage value of the property
  notes?: string; // Additional notes for special tiles
}

export enum BotDifficulty {
  Easy = 'easy',
  Medium = 'medium',
  Hard = 'hard',
}

export interface GameSetting{
  initialPlayerMoney:number;
bailAmount:number;
passGoAmount:number;
onGoAmount:number,
unmortgageInterestRate:number,
mortgage:boolean;
even_buy_sale:boolean,
auction:boolean,
botDifficulty:BotDifficulty,
maxPlayers:number,
doubleRentOnMonopoly:boolean,
turnTimeLimit:number;

}

export const GAME_SETTINGS = {
  initialPlayerMoney: 15000,
  bailAmount: 500,
  passGoAmount:2000,
  unmortgageInterestRate: 0.05, 
  mortgae: false,
  even_buy_sale: true,
  mortgage:false,
  auction: false,
  botDifficulty:BotDifficulty.Hard,
  onGoAmount:1000,
  maxPlayers:4,
doubleRentOnMonopoly:true,
turnTimeLimit: 30000,
} as GameSetting;


export const BOARD: BoardTile[] = [
  { "id": 1, "name": "Start", "type": "start", "notes": "Collect 2000 as you pass Start" }, 
  { "id": 2, "name": "Janakpur", "type": "property", "group": "EAST", "cost": 1500, "baseRent": 100, "rent": [400, 1200, 2000, 2500, 4000], "houseCost": 550, "mortgageValue": 750 }, 
  { "id": 3, "name": "Dharan", "type": "property", "group": "EAST", "cost": 1500, "baseRent": 100, "rent": [400, 1200, 2000, 2500, 4000], "houseCost": 550, "mortgageValue": 750 }, 
  { "id": 4, "name": "Community Fund", "type": "community" }, 
  { "id": 5, "name": "Biratnagar", "type": "property", "group": "EAST", "cost": 1600, "baseRent": 110, "rent": [440, 1320, 2200, 2750, 4400], "houseCost": 600, "mortgageValue": 800 }, 
  { "id": 6, "name": "Araniko Highway", "type": "route","subType":"highway", "cost": 2000, "baseRent": 250, "rent": [250, 500, 1000, 2000], "mortgageValue": 1000 }, 
  { "id": 7, "name": "Taumadhi Square", "type": "property", "group": "BHK", "cost": 2500, "baseRent": 180, "rent": [720, 2160, 3600, 4500, 7200], "houseCost": 800, "mortgageValue": 1250 }, 
  { "id": 8, "name": "Dattatreya Square", "type": "property", "group": "BHK", "cost": 2600, "baseRent": 190, "rent": [760, 2280, 3800, 4750, 7600], "houseCost": 850, "mortgageValue": 1300 },
  { "id": 9, "name": "Fortune Card", "type": "chance" },
  { "id": 10, "name": "Durbar Square", "type": "property", "group": "BHK", "cost": 2700, "baseRent": 200, "rent": [800, 2400, 4000, 5000, 8000], "houseCost": 900, "mortgageValue": 1350 },
  { "id": 11, "name": "Mama Ghar / Just Visiting", "type": "jail" }, 
  { "id": 12, "name": "Museum", "type": "property", "group": "LAL", "cost": 3000, "baseRent": 220, "rent": [880, 2640, 4400, 5500, 8800], "houseCost": 1000, "mortgageValue": 1500 },
  { "id": 13, "name": "Patan", "type": "property", "group": "LAL", "cost": 3100, "baseRent": 230, "rent": [920, 2760, 4600, 5750, 9200], "houseCost": 1050, "mortgageValue": 1550 }, 
  { "id": 14, "name": "N.E.A", "type": "utility","subType":"electricity", "cost": 1500, "mortgageValue": 550,"baseRent": 320 },
  { "id": 15, "name": "Jhamsikhel", "type": "property", "group": "LAL", "cost": 3200, "baseRent": 240, "rent": [960, 2880, 4800, 6000, 9600], "houseCost": 1100, "mortgageValue": 1600 },
  { "id": 16, "name": "TIA Airport", "type": "route","subType":"airport", "cost": 2000, "baseRent": 250, "rent": [250, 500, 1000, 2000], "mortgageValue": 1000 }, 
  { "id": 17, "name": "Swayambhu", "type": "property", "group": "KTM", "cost": 4000, "baseRent": 300, "rent": [1200, 3600, 6000, 7500, 12000], "houseCost": 1400, "mortgageValue": 2000 },
  { "id": 18, "name": "Fortune Card", "type": "chance" },
  { "id": 19, "name": "Basantapur", "type": "property", "group": "KTM", "cost": 4200, "baseRent": 320, "rent": [1280, 3840, 6400, 8000, 12800], "houseCost": 1500, "mortgageValue": 2100 },
  { "id": 20, "name": "Lazimpat", "type": "property", "group": "KTM", "cost": 4500, "baseRent": 350, "rent": [1400, 4200, 7000, 8750, 14000], "houseCost": 1600, "mortgageValue": 2250 },
  { "id": 21, "name": "Festival", "type": "festival",},
  { "id": 22, "name": "Bharatpur", "type": "property", "group": "CTN", "cost": 2600, "baseRent": 200, "rent": [800, 2400, 4000, 5000, 8000], "houseCost": 900, "mortgageValue": 1300 }, 
  { "id": 23, "name": "Community", "type": "community" }, 
  { "id": 24, "name": "Sauraha", "type": "property", "group": "CTN", "cost": 2800, "baseRent": 220, "rent": [880, 2640, 4400, 5500, 8800], "houseCost": 1000, "mortgageValue": 1400 }, 
  { "id": 25, "name": "Tourism Tax", "type": "tax", "cost": 10 }, 
  { "id": 26, "name": "PKR Airport", "type": "route","subType":"airport", "cost": 2000, "baseRent": 250, "rent": [250, 500, 1000, 2000], "mortgageValue": 1000 }, 
  { "id": 27, "name": "Sarangkot", "type": "property", "group": "PKR", "cost": 3500, "baseRent": 280, "rent": [1120, 3360, 5600, 7000, 11200], "houseCost": 1200, "mortgageValue": 1750 }, 
  { "id": 28, "name": "Water Corp.", "type": "utility", "cost": 1500, "baseRent": 320, "rent": [1280, 3840, 6400, 8000, 12800], "houseCost": 1500, "mortgageValue": 2100 }, 
  { "id": 29, "name": "Begnas", "type": "property", "group": "PKR", "cost": 3600, "baseRent": 290, "rent": [1160, 3480, 5800, 7250, 11600], "houseCost": 1250, "mortgageValue": 1800 }, 
  { "id": 30, "name": "Lakeside", "type": "property", "group": "PKR", "cost": 3800, "baseRent": 300, "rent": [1200, 3600, 6000, 7500, 12000], "houseCost": 1300, "mortgageValue": 1900 }, 
  { "id": 31, "name": "Go to Mama Ghar", "type": "go_to_jail" }, 
  { "id": 32, "name": "Butwal", "type": "property", "group": "WEST", "cost": 2000, "baseRent": 125, "rent": [500, 1500, 2500, 3125, 5000], "houseCost": 650, "mortgageValue": 1000 }, 
  { "id": 33, "name": "Nepalgunj", "type": "property", "group": "WEST", "cost": 2100, "baseRent": 130, "rent": [520, 1560, 2600, 3250, 5200], "houseCost": 700, "mortgageValue": 1050 }, 
  { "id": 34, "name": "Fortune Card", "type": "chance",},
  { "id": 35, "name": "Rara", "type": "property", "group": "WEST", "cost": 2500, "baseRent": 180, "rent": [720, 2160, 3600, 4500, 7200], "houseCost": 900, "mortgageValue": 1250 }, 
  { "id": 36, "name": "Mahendra", "type": "route","subType":"highway", "cost": 2000, "baseRent": 250, "rent": [250, 500, 1000, 2000], "mortgageValue": 1000 }, 
  { "id": 37, "name": "Community", "type": "community", "group": "Lumbini",},
  { "id": 38, "name": "Langtang", "type": "property", "group": "TREK", "cost": 4000, "baseRent": 300, "rent": [1200, 3600, 6000, 7500, 12000], "houseCost": 1400, "mortgageValue": 2000 }, 
  { "id": 39, "name": "Income Tax (IRD)", "type": "tax","cost":20 },
  { "id": 40, "name": "Everest Base Camp", "type": "property", "group": "TREK", "cost": 4500, "baseRent": 350, "rent": [1400, 4200, 7000, 8750, 14000], "houseCost": 1600, "mortgageValue": 2250 }  // // Top edge (Eastern Nepal → Central approach)
];



export function getGameConfig() {
  return {
    board: BOARD,
    chanceCards: CHANCE_CARDS,
    communityChestCards: COMMUNITY_CHEST_CARDS,
    settings: GAME_SETTINGS,
  };
}




export interface PlayerAsset {
  properties: number;
  houses: number;
  utilities: number;
  routes: number;
  totalValue: number;
}

export interface PlayerState {
  id: string;
  userId?: string;
  name: string;
  socketId?: string | null;
  position: number;
  money: number;
  properties: number[];
  inJail: boolean;
  jailTurns: number;
  isConnected: boolean;
  lastActive?: string;
  order: number;
  status: 'active' | 'left' | 'kicked' | 'bankrupt' |'disconnected';
  lastRollWasDouble: boolean; // Added for tracking consecutive doubles
  consecutiveDoubles: number; // Added for tracking consecutive doubles
  getOutOfJailFreeCards: number; // Added for tracking Get Out of Jail Free cards
  isBot: boolean; // Added to identify bot players
  color?: string | null; // Added for player color
  debtToPlayerId?: string; // Added to track who the player owes money to
  debtAmount?: number; // Added to track the amount of debt
  assets: PlayerAsset;
  rentBonus?:boolean;
  skipTurn?:boolean;
}


export interface PlayerStatsSnapshot {
  turnNumber: number; // Or a timestamp, depending on how turns are tracked
  money: number;
  netWorth: number; // Money + value of properties/houses
}

export interface GameState {
  gameId: string;
  players: Record<string, PlayerState>;
  order: string[];
  turn: string;
  phase: 'before_roll' | 'rolling' | 'after_roll'|'again_after_roll'|  'await_buy_or_auction' | 'auction' | 'draw_card' | 'bankruptcy_imminent' | 'game_over';
  propertyStates: Record<number, { owner?: string, level: number, mortgaged?: boolean }>;
  deck: { chance: number[]; community: number[] };
  eventLog: any[];
  turnExpiresAt?: string | null;
  lastSnapshotId?: number | null;
  host?:string;
  auction?: { // Added for auction state
    tileId: number;
    currentBid: number;
    currentBidderId: string | null;
    playersInAuction: string[];
  } | null;
  status: 'lobby' | 'active' | 'end';
  turnNumber: number; // To track current turn number
  isSimulation?: boolean; // To indicate if the game is a simulation
}

export interface GameStateUpdate {
  phase?: 'before_roll' | 'rolling' |'roll_done' | 'after_roll'|'again_after_roll'| 'await_buy_or_auction' | 'auction' | 'draw_card' | 'bankruptcy_imminent' | 'game_over';
  players?: Record<string, PlayerState>;
  turn?: string;
  propertyStates?: Record<number, { owner?: string, level: number, mortgaged?: boolean }>;
  order?: string[];
  host?:string;
  auction?: { 
    tileId: number;
    currentBid: number;
    currentBidderId: string | null;
    playersInAuction: string[];
  } | null;
}

export enum CardType {
  Money = 'money',
  Move = 'move',
  GetOutOfJailFree = 'get_out_of_jail_free',
  GoToJail = 'go_to_jail',
  Repairs = 'repairs',
}

export interface BaseCard {
  id: number;
  description: string;
  type: CardType;
}

export interface MoneyCard extends BaseCard {
  type: CardType.Money;
  amount: number;
  allPlayer?:boolean
  // Positive for gain, negative for loss
}



export interface MoveCard extends BaseCard {
  type: CardType.Move;
  destination?: number; // Tile ID to move to
  spaces?: number; // Number of spaces to move
  collectGo?: boolean; // Whether to collect $200 for passing Go
}

export interface GetOutOfJailFreeCard extends BaseCard {
  type: CardType.GetOutOfJailFree;
}

export interface GoToJailCard extends BaseCard {
  type: CardType.GoToJail;
}

export interface RepairsCard extends BaseCard {
  type: CardType.Repairs;
  houseCost: number;
  hotelCost: number;
}

export type ChanceCard = MoneyCard|   MoveCard | GetOutOfJailFreeCard | GoToJailCard | RepairsCard;
export type CommunityChestCard = MoneyCard |MoveCard | GetOutOfJailFreeCard | GoToJailCard | RepairsCard;





export const CHANCE_CARDS: ChanceCard[] = [
  { id: 1, description: 'Advance to Start (Collect Rs 3000)', type: CardType.Move, destination: 1, collectGo: true },
  { id: 2, description: 'Advance to TIA. If you pass Start, collect Rs 2000.', type: CardType.Move, destination: 16, collectGo: true },
  { id: 3, description: 'Advance to Pokhara Airport. If you pass Go, collect 2000.', type: CardType.Move, destination: 26, collectGo: true },
  { id: 4, description: 'Bank pays you dividend of Rs 500.', type: CardType.Money, amount: 500 },
  { id: 5, description: 'Get Out of Mamaghar. This card may be kept until needed or traded.', type: CardType.GetOutOfJailFree },
  { id: 6, description: 'Go Back 3 Spaces.', type: CardType.Move, spaces: -3 },
  { id: 7, description: 'Go to Mama Ghar.', type: CardType.GoToJail },
  { id: 8, description: 'Make general repairs on all your property. For each house pay Rs 250. For each hotel pay RS 500.', type: CardType.Repairs, houseCost: 250, hotelCost: 500 },
  { id: 9, description: 'Pay custom duty of Rs 1500.', type: CardType.Money, amount: -1500 },
  { id: 10, description: 'Take a trip to Highway. If you pass Go, collect Rs 2000.', type: CardType.Move, destination: 6, collectGo: true },
  { id: 11, description: 'You have been elected Chairman of the Board. Pay each player Rs 500.', type: CardType.Money, amount: -500,allPlayer:true }, // Assuming 3 other players for now
  { id: 12, description: 'Your building loan matures. Collect Rs 1500.', type: CardType.Money, amount: 1500 },
  { id: 13, description: 'You have won a lottery. Collect Rs 1000.', type: CardType.Money, amount: 1000 },
    { id: 14, description: 'Take a trip to Highway. If you pass Go, collect Rs 2000.', type: CardType.Move, destination: 35, collectGo: true },
      { id: 15, description: 'Go Back 1 Space.', type: CardType.Move, spaces: -1 },
        { id: 16, description: 'Go Forward 3 Space.', type: CardType.Move, spaces: 3 },
          { id: 17, description: 'Visit N.E.A. If you pass Go, collect Rs 2000.', type: CardType.Move, destination: 14, collectGo: true },
          { id: 18, description: 'Visit Water Corp. If you pass Go, collect Rs 2000.', type: CardType.Move, destination: 28, collectGo: true },

];

export const COMMUNITY_CHEST_CARDS: CommunityChestCard[] = [
  { id: 1, description: 'Advance to Start (Collect Rs 3000)', type: CardType.Move, destination: 1, collectGo: true },
  { id: 2, description: 'Bank error in your favor. Collect Rs 2000.', type: CardType.Money, amount: 2000 },
  { id: 3, description: 'Doctor\'s fee. Pay Rs 500.', type: CardType.Money, amount: -500 },
  { id: 4, description: 'Get Out of Mamaghar. This card may be kept until needed or traded.', type: CardType.GetOutOfJailFree },
  { id: 5, description: 'Go to Mama Ghar', type: CardType.GoToJail },
  { id: 6, description: 'It is your birthday. Collect Rs 500 from each player.', type: CardType.Money, amount: 500 , allPlayer:true}, // Assuming 3 other players for now
  { id: 7, description: 'Life insurance matures. Collect Rs 1000.', type: CardType.Money, amount: 1000 },
  { id: 8, description: 'Pay hospital Rs 1000.', type: CardType.Money, amount: -1000 },
  { id: 9, description: 'Pay school tax of 1500.', type: CardType.Money, amount: -1500 },
  { id: 10, description: 'Receive Rs 500 consultancy fee.', type: CardType.Money, amount: 500 },
  { id: 11, description: 'You are assessed for street repairs. Rs 400 per house. Rs 1150 per hotel.', type: CardType.Repairs, houseCost: 400, hotelCost: 1150 },
  { id: 12, description: 'You have won second prize in a eating contest. Collect Rs 500.', type: CardType.Money, amount: 500 },
  { id: 13, description: 'Inherit Rs 1000.', type: CardType.Money, amount: 1000 },
  { id: 14, description: 'From sale of stock you get Rs 500.', type: CardType.Money, amount: 500 },
  { id: 15, description: 'Holiday fund matures. Receive Rs 1000.', type: CardType.Money, amount: 1000 },
];

export enum FestivalEventType {
  FESTIVAL_CARD = 'festival_card',
  SKIP_NEXT_TURN = 'skip_next_turn',
  RENT_BONUS = 'rent_bonus',
  PAY_FEE = 'pay_fee',
  RECEIVE_MONEY = 'receive_money',
}

export interface FestivalCard extends BaseCard {
  type: CardType; // Can be any CardType, but specific to festival context
  // Add any specific properties for festival cards here if needed
  amount?:number,
  skipTurn?:boolean,
  destination?:number,
  collectGo?:boolean
}

export const FESTIVAL_CARDS: FestivalCard[] = [
  { id: 1, description: 'You won the festival lottery! Collect Rs 1000.', type: CardType.Money, amount: 1000 },
  { id: 2, description: 'Pay for festival food and drinks. Pay Rs 200.', type: CardType.Money, amount: -200 },
  { id: 3, description: 'Your next rent payment is doubled!', type: CardType.Money, amount: 0 }, // Special handling for rent bonus
  { id: 4, description: 'Skip your next turn due to festival exhaustion.', type: CardType.Move, skipTurn:true }, // Special handling for skip turn
  { id: 5, description: 'Advance to Start and collect Rs 2000.', type: CardType.Move, destination: 1, collectGo: true },
];

export interface TradeOffer {

  money?: number;
  properties?: number[]; // Array of tile IDs
  getOutOfJailFreeCards?: number; // Number of cards
}



export interface Trade {
  id: string;
  gameId: string;
  proposerId: string;
  responderId: string | null;
  offer: TradeOffer;
  request: TradeOffer;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: string;
  expiresAt?: string | null;
}


