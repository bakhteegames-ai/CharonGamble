import { SAVE_STORAGE_KEY } from '../game/services/SaveService';
import type { SaveData } from '../game/types/config';
import type { Platform } from './Platform';

type AdvEvents = {
  onOpen?: () => void;
  onClose?: (wasShown?: boolean) => void;
  onError?: (error?: unknown) => void;
  onRewarded?: () => void;
};

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  key: (index: number) => string | null;
  readonly length: number;
}

interface YandexPlayerLike {
  getData: (keys?: string[]) => Promise<Record<string, unknown>>;
  setData: (data: Record<string, unknown>, flush?: boolean) => Promise<void>;
}

interface YsdkLike {
  adv?: {
    showFullscreenAdv?: (events?: AdvEvents) => void;
    showRewardedVideo?: (events?: AdvEvents) => void;
    getBannerAdvStatus?: () => Promise<{ stickyAdvIsShowing?: boolean; reason?: string }>;
    showBannerAdv?: () => Promise<{ stickyAdvIsShowing?: boolean; reason?: string }>;
    hideBannerAdv?: () => Promise<{ stickyAdvIsShowing?: boolean; reason?: string }>;
  };
  features?: {
    LoadingAPI?: {
      ready?: () => void;
    };
  };
  getStorage?: () => Promise<StorageLike>;
  getPlayer?: () => Promise<YandexPlayerLike>;
  on?: (eventName: string, cb: () => void) => void;
}

declare global {
  interface Window {
    YaGames?: {
      init?: () => Promise<YsdkLike>;
    };
    ysdk?: YsdkLike;
  }
}

export class YandexPlatform implements Platform {
  private ysdk: YsdkLike | null = null;
  private player: YandexPlayerLike | null = null;
  private pauseCbs: Array<() => void> = [];
  private resumeCbs: Array<() => void> = [];
  private loadingReadySent = false;
  private adDepth = 0;

  async init(): Promise<void> {
    if (!window.YaGames?.init) {
      throw new Error('YaGames SDK is not available on window');
    }

    this.ysdk = await window.YaGames.init();
    window.ysdk = this.ysdk;

    const safeStorage = await this.ysdk.getStorage?.();
    if (safeStorage) {
      try {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get: () => safeStorage
        });
      } catch (error) {
        console.warn('safeStorage override failed, using default localStorage', error);
      }
    }

    try {
      this.player = await this.ysdk.getPlayer?.() ?? null;
      const cloudSave = await this.loadCloudSave();
      if (cloudSave) {
        localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(cloudSave));
      }
    } catch {
      this.player = null;
    }

    this.ysdk.on?.('game_api_pause', () => {
      if (this.adDepth > 0) {
        return;
      }
      this.pauseCbs.forEach((cb) => cb());
    });

    this.ysdk.on?.('game_api_resume', () => {
      if (this.adDepth > 0) {
        return;
      }
      this.resumeCbs.forEach((cb) => cb());
    });
  }

  async showInterstitial(): Promise<boolean> {
    if (!this.ysdk?.adv?.showFullscreenAdv) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      let opened = false;
      this.adDepth += 1;
      const finish = () => {
        this.adDepth = Math.max(0, this.adDepth - 1);
      };

      this.ysdk?.adv?.showFullscreenAdv?.({
        onOpen: () => {
          opened = true;
          this.pauseCbs.forEach((cb) => cb());
        },
        onClose: (wasShown) => {
          if (opened) {
            this.resumeCbs.forEach((cb) => cb());
          }
          resolve(Boolean(wasShown));
          finish();
        },
        onError: () => {
          if (opened) {
            this.resumeCbs.forEach((cb) => cb());
          }
          resolve(false);
          finish();
        }
      });
    });
  }

  async showRewarded(): Promise<boolean> {
    if (!this.ysdk?.adv?.showRewardedVideo) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      let rewarded = false;
      let opened = false;
      this.adDepth += 1;
      const finish = () => {
        this.adDepth = Math.max(0, this.adDepth - 1);
      };

      this.ysdk?.adv?.showRewardedVideo?.({
        onOpen: () => {
          opened = true;
          this.pauseCbs.forEach((cb) => cb());
        },
        onRewarded: () => {
          rewarded = true;
        },
        onClose: () => {
          if (opened) {
            this.resumeCbs.forEach((cb) => cb());
          }
          resolve(rewarded);
          finish();
        },
        onError: () => {
          if (opened) {
            this.resumeCbs.forEach((cb) => cb());
          }
          resolve(false);
          finish();
        }
      });
    });
  }


  async showBanner(): Promise<boolean> {
    if (!this.ysdk?.adv) {
      return false;
    }

    try {
      const status = await this.ysdk.adv.getBannerAdvStatus?.();
      if (status?.stickyAdvIsShowing) {
        return true;
      }

      const result = await this.ysdk.adv.showBannerAdv?.();
      if (result?.stickyAdvIsShowing) {
        return true;
      }

      const afterStatus = await this.ysdk.adv.getBannerAdvStatus?.();
      return Boolean(afterStatus?.stickyAdvIsShowing);
    } catch {
      return false;
    }
  }

  async hideBanner(): Promise<boolean> {
    if (!this.ysdk?.adv) {
      return false;
    }

    try {
      const status = await this.ysdk.adv.getBannerAdvStatus?.();
      if (status && !status.stickyAdvIsShowing) {
        return true;
      }

      const result = await this.ysdk.adv.hideBannerAdv?.();
      if (result && !result.stickyAdvIsShowing) {
        return true;
      }

      const afterStatus = await this.ysdk.adv.getBannerAdvStatus?.();
      return Boolean(afterStatus && !afterStatus.stickyAdvIsShowing);
    } catch {
      return false;
    }
  }
  onPause(cb: () => void): void {
    this.pauseCbs.push(cb);
  }

  onResume(cb: () => void): void {
    this.resumeCbs.push(cb);
  }

  gameReady(): void {
    if (this.loadingReadySent) {
      return;
    }
    this.ysdk?.features?.LoadingAPI?.ready?.();
    this.loadingReadySent = true;
  }

  async loadCloudSave(): Promise<SaveData | null> {
    if (!this.player) {
      return null;
    }

    try {
      const data = await this.player.getData(['save_v1']);
      const raw = data.save_v1;
      if (!raw) {
        return null;
      }
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw) as unknown;
          return typeof parsed === 'object' && parsed !== null ? (parsed as SaveData) : null;
        } catch {
          return null;
        }
      }
      if (typeof raw === 'object') {
        return raw as SaveData;
      }
      return null;
    } catch {
      return null;
    }
  }

  async saveCloudSave(save: SaveData): Promise<boolean> {
    if (!this.player) {
      return false;
    }

    try {
      await this.player.setData({ save_v1: save }, true);
      return true;
    } catch {
      return false;
    }
  }
}
