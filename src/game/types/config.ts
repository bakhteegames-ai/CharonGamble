export interface UiText {
  title: string;
  coinLabel: string;
  paused: string;
  resumed: string;
  hitObstacle: string;
  coinPickup: string;
  gateChosen: string;
  freeBribe: string;
  paidBribe: string;
  insufficientCoins: string;
  gameOver: string;
  revive: string;
  restart: string;
  screen_menu?: string;
  screen_shop?: string;
  btn_start?: string;
  btn_retry?: string;
  lbl_wallet?: string;
  lbl_best?: string;
  btn_buy?: string;
  btn_reset_progress?: string;
  lbl_level?: string;
  lbl_price?: string;
  ui_text?: {
    toasts?: Record<string, string[]>;
  };
}

export interface DrainTier {
  fromSec: number;
  rate: number;
}

export interface EconomyConfig {
  startCoins: number;
  coinDrainTiers: DrainTier[];
  pickupValue: number;
  collisionPenalty: number;
  bribeShotCost: number;
  freeBribeChance: number;
  firstGateDelaySec?: number;
  gateIntervalSec: number;
  gateDurationSec: number;
  minInterstitialIntervalSec?: number;
}

export interface GateEffect {
  collisionPenaltyMultiplier?: number;
  pickupMultiplier?: number;
  speedMultiplier?: number;
  drainMultiplier?: number;
}

export interface GateConfig {
  id: string;
  name: string;
  description: string;
  durationSec: number;
  permanent?: boolean;
  effects: GateEffect;
}

export interface ObstacleConfig {
  id: string;
  radius: number;
  damage: number;
  color: string;
}

export interface UpgradeEffect {
  shieldStart?: number;
  shieldRegenSec?: number;
  obstacleDamageMult?: number;
  magnetMult?: number;
  soulValueMult?: number;
  doubleSoulChance?: number;
  bribeCooldownMult?: number;
  freeBribeEverySec?: number;
  bribeSplashRadius?: number;
}

export interface UpgradeLevelConfig {
  cost: number;
  title: string;
  shortDesc: string;
  effect: UpgradeEffect;
}

export interface UpgradeBranchConfig {
  id: 'defense' | 'farm' | 'skills';
  title: string;
  levels: UpgradeLevelConfig[];
}

export interface DailyContract {
  id: string;
  title: string;
  reward: number;
}

export interface GameConfigData {
  uiTextRu: UiText;
  economy: EconomyConfig;
  gates: GateConfig[];
  obstacles: ObstacleConfig[];
  upgrades: UpgradeBranchConfig[];
  dailyContracts: DailyContract[];
}

export interface SaveData {
  bestScore: number;
  walletCoins: number;
  upgrades: Record<string, number>;
}
