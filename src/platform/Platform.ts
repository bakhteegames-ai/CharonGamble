import type { SaveData } from '../game/types/config';
import { YandexPlatform } from './YandexPlatform';

export interface Platform {
  init(): Promise<void>;
  showInterstitial(): Promise<boolean>;
  showRewarded(): Promise<boolean>;
  showBanner(): Promise<boolean>;
  hideBanner(): Promise<boolean>;
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;
  gameReady(): void;
  loadCloudSave(): Promise<SaveData | null>;
  saveCloudSave(save: SaveData): Promise<boolean>;
}


export class NoopPlatform implements Platform {
  private pauseCbs: Array<() => void> = [];
  private resumeCbs: Array<() => void> = [];

  async init(): Promise<void> {
    return Promise.resolve();
  }

  async showInterstitial(): Promise<boolean> {
    return false;
  }

  async showRewarded(): Promise<boolean> {
    return false;
  }

  async showBanner(): Promise<boolean> {
    return false;
  }

  async hideBanner(): Promise<boolean> {
    return false;
  }

  onPause(cb: () => void): void {
    this.pauseCbs.push(cb);
  }

  onResume(cb: () => void): void {
    this.resumeCbs.push(cb);
  }

  gameReady(): void {
    // noop
  }

  async loadCloudSave(): Promise<SaveData | null> {
    return null;
  }

  async saveCloudSave(): Promise<boolean> {
    return false;
  }
}

export async function createPlatform(): Promise<Platform> {
  const isYandexSdkAvailable = typeof window !== 'undefined' && Boolean(window.YaGames?.init);
  if (!isYandexSdkAvailable) {
    const noop = new NoopPlatform();
    await noop.init();
    return noop;
  }

  try {
    const yandex = new YandexPlatform();
    await yandex.init();
    return yandex;
  } catch {
    const noop = new NoopPlatform();
    await noop.init();
    return noop;
  }
}
