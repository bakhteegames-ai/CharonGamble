import type { DailyContract, EconomyConfig, GameConfigData, GateConfig, ObstacleConfig, UiText, UpgradeBranchConfig } from '../types/config';

async function loadJson<T>(relativePath: string): Promise<T> {
  const url = new URL(`../data/${relativePath}`, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${relativePath}: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export class GameConfig {
  private static instance: GameConfig | null = null;

  public static async load(): Promise<GameConfig> {
    if (GameConfig.instance) {
      return GameConfig.instance;
    }

    const [uiTextRu, economy, gates, obstacles, upgrades, dailyContracts] = await Promise.all([
      loadJson<UiText>('ui_text_ru.json'),
      loadJson<EconomyConfig>('economy_config.json'),
      loadJson<GateConfig[]>('gates.json'),
      loadJson<ObstacleConfig[]>('obstacles.json'),
      loadJson<UpgradeBranchConfig[]>('upgrades.json'),
      loadJson<DailyContract[]>('daily_contracts.json')
    ]);

    const data: GameConfigData = {
      uiTextRu,
      economy,
      gates,
      obstacles,
      upgrades,
      dailyContracts
    };

    GameConfig.instance = new GameConfig(data);
    return GameConfig.instance;
  }

  private constructor(private readonly data: GameConfigData) {}

  get uiText(): UiText {
    return this.data.uiTextRu;
  }

  get economy(): EconomyConfig {
    return this.data.economy;
  }

  get gates(): GateConfig[] {
    return this.data.gates;
  }

  get obstacles(): ObstacleConfig[] {
    return this.data.obstacles;
  }

  get upgrades(): UpgradeBranchConfig[] {
    return this.data.upgrades;
  }

  get dailyContracts(): DailyContract[] {
    return this.data.dailyContracts;
  }
}
