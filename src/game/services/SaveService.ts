import type { SaveData, UpgradeBranchConfig } from '../types/config';

export const SAVE_STORAGE_KEY = 'charons_gamble_save_v1';

interface CloudSaveAdapter {
  saveCloudSave(save: SaveData): Promise<boolean>;
}

export class SaveService {
  private static cloudAdapter: CloudSaveAdapter | null = null;

  static setCloudAdapter(adapter: CloudSaveAdapter): void {
    SaveService.cloudAdapter = adapter;
  }

  static defaults(upgrades: UpgradeBranchConfig[]): SaveData {
    return {
      bestScore: 0,
      walletCoins: 0,
      upgrades: Object.fromEntries(upgrades.map((upgrade) => [upgrade.id, 0]))
    };
  }

  static load(upgrades: UpgradeBranchConfig[]): SaveData {
    const defaults = SaveService.defaults(upgrades);

    try {
      const raw = localStorage.getItem(SAVE_STORAGE_KEY);
      if (!raw) {
        return defaults;
      }

      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return {
        bestScore: parsed.bestScore ?? defaults.bestScore,
        walletCoins: parsed.walletCoins ?? defaults.walletCoins,
        upgrades: {
          ...defaults.upgrades,
          ...(parsed.upgrades ?? {})
        }
      };
    } catch {
      return defaults;
    }
  }

  static store(data: SaveData): void {
    localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(data));
  }

  static async storeWithCloud(data: SaveData): Promise<void> {
    SaveService.store(data);
    if (!SaveService.cloudAdapter) {
      return;
    }
    await SaveService.cloudAdapter.saveCloudSave(data);
  }

  static async reset(upgrades: UpgradeBranchConfig[]): Promise<SaveData> {
    const defaults = SaveService.defaults(upgrades);
    await SaveService.storeWithCloud(defaults);
    return defaults;
  }
}
