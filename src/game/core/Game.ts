import type { Platform } from '../../platform/Platform';
import { AudioManager } from '../services/AudioManager';
import { SaveService } from '../services/SaveService';
import type {
  GateConfig,
  GateEffect,
  ObstacleConfig,
  SaveData,
  UiText,
  UpgradeEffect,
  UpgradeLevelConfig
} from '../types/config';
import { GameConfig } from './GameConfig';

interface Vec2 { x: number; y: number; }
interface ObstacleEntity extends Vec2 { r: number; color: string; damage: number; }
interface CoinEntity extends Vec2 { r: number; value: number; }
interface ProjectileEntity extends Vec2 { r: number; speed: number; }
interface GatePair {
  y: number;
  left: GateConfig;
  right: GateConfig;
  width: number;
  chosen: boolean;
}
interface ActiveEffect {
  gateId: string;
  effect: GateEffect;
  permanent: boolean;
  remainingSec: number;
}

const WIDTH = 900;
const HEIGHT = 520;
const GATE_GAP = 120;
const GATE_HEIGHT = 26;
const REVIVE_INVULN_MS = 1200;
const BASE_MAGNET_RADIUS = 50;
const BASE_BRIBE_COOLDOWN_SEC = 0.45;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function intersects(a: Vec2 & { r: number }, b: Vec2 & { r: number }): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const radius = a.r + b.r;
  return dx * dx + dy * dy <= radius * radius;
}

function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export class Game {
  static async boot(root: HTMLElement, platform: Platform): Promise<void> {
    const config = await GameConfig.load();
    const game = new Game(root, config, platform);
    game.start();
  }

  private readonly config: GameConfig;
  private readonly platform: Platform;
  private readonly uiText: UiText;
  private readonly shell: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly coinPill: HTMLDivElement;
  private readonly scorePill: HTMLDivElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly bribeButton: HTMLButtonElement;
  private readonly toast: HTMLDivElement;
  private readonly modal: HTMLDivElement;
  private readonly modalText: HTMLParagraphElement;
  private readonly reviveButton: HTMLButtonElement;
  private readonly rewardX2Button: HTMLButtonElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly menu: HTMLDivElement;
  private readonly menuWallet: HTMLDivElement;
  private readonly menuBest: HTMLDivElement;
  private readonly startRunButton: HTMLButtonElement;
  private readonly shopRows: Record<string, {
    level: HTMLSpanElement;
    cost: HTMLSpanElement;
    title: HTMLDivElement;
    desc: HTMLDivElement;
    button: HTMLButtonElement;
  }> = {};
  private readonly resetProgressButton: HTMLButtonElement;

  private saveData: SaveData;
  private readonly audio: AudioManager;

  private player = { x: WIDTH / 2, y: HEIGHT - 70, w: 50, h: 36, speed: 340 };
  private keys = new Set<string>();

  private obstacles: ObstacleEntity[] = [];
  private coins: CoinEntity[] = [];
  private projectiles: ProjectileEntity[] = [];
  private gates: GatePair[] = [];
  private effects: ActiveEffect[] = [];

  private elapsedSec = 0;
  private distance = 0;
  private coinsBalance = 0;
  private paused = true;
  private manualPaused = false;
  private pausedByUser = false;
  private gameOver = false;
  private runActive = false;
  private deathCount = 0;
  private reviveInvulnMs = 0;
  private lastInterstitialAtMs = 0;
  private gameOverBaseScore = 0;
  private gameOverScoreMultiplier = 1;

  private soulsCollected = 0;
  private sessionEarningsBase = 0;

  private shieldMax = 0;
  private shieldCount = 0;
  private shieldRegenSec = 0;
  private shieldRegenTimer = 0;
  private obstacleDamageMult = 1;

  private magnetMult = 1;
  private soulValueMult = 1;
  private doubleSoulChance = 0;

  private bribeCooldownMult = 1;
  private freeBribeEverySec = 0;
  private bribeSplashRadius = 0;
  private bribeCooldownLeftSec = 0;
  private freeBribeTimerSec = 0;
  private freeBribeReady = false;

  private obstacleSpawnTimer = 0;
  private coinSpawnTimer = 0;
  private gateSpawnTimer = 0;
  private toastTimer = 0;

  private pointerDrag = false;
  private dragPointerId: number | null = null;
  private lastTime = 0;
  private dpr = 1;
  private platformPauseDepth = 0;
  private wasPausedBeforePlatformPause = false;
  private wasMutedBeforePlatformPause = false;

  constructor(root: HTMLElement, config: GameConfig, platform: Platform) {
    this.config = config;
    this.platform = platform;
    this.uiText = config.uiText;
    this.saveData = SaveService.load(config.upgrades);
    this.audio = new AudioManager();

    this.shell = document.createElement('div');
    this.shell.className = 'game-shell';
    this.canvas = document.createElement('canvas');
    this.setupCanvasResolution();
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;

    const hud = document.createElement('div');
    hud.className = 'hud';

    const topRow = document.createElement('div');
    topRow.className = 'top-row';
    this.coinPill = document.createElement('div');
    this.coinPill.className = 'pill';

    this.scorePill = document.createElement('div');
    this.scorePill.className = 'pill';

    this.pauseButton = document.createElement('button');
    this.pauseButton.className = 'pill';

    topRow.append(this.coinPill, this.scorePill, this.pauseButton);

    const bottomRow = document.createElement('div');
    bottomRow.className = 'bottom-row';
    this.bribeButton = document.createElement('button');
    this.bribeButton.className = 'pill bribe-button';
    this.bribeButton.textContent = 'ОТКУП';
    bottomRow.append(this.bribeButton);

    this.toast = document.createElement('div');
    this.toast.className = 'toast';

    hud.append(topRow, this.toast, bottomRow);

    this.modal = document.createElement('div');
    this.modal.className = 'modal';
    this.modal.hidden = true;
    const card = document.createElement('div');
    card.className = 'modal-card';
    this.modalText = document.createElement('p');
    this.reviveButton = document.createElement('button');
    this.reviveButton.textContent = this.uiText.revive;
    this.rewardX2Button = document.createElement('button');
    this.rewardX2Button.textContent = 'СМОТРЕТЬ РЕКЛАМУ (x2 ВЫРУЧКУ)';
    this.restartButton = document.createElement('button');
    this.restartButton.textContent = this.uiText.btn_retry ?? 'В РЕСЕПШН';
    const row = document.createElement('div');
    row.className = 'modal-row';
    row.append(this.reviveButton, this.rewardX2Button, this.restartButton);
    card.append(this.modalText, row);
    this.modal.append(card);

    this.menu = document.createElement('div');
    this.menu.className = 'menu-overlay';
    const menuCard = document.createElement('div');
    menuCard.className = 'menu-card';
    const menuTitle = document.createElement('h2');
    menuTitle.textContent = this.uiText.screen_menu ?? this.uiText.title;
    this.menuWallet = document.createElement('div');
    this.menuWallet.className = 'menu-stats';
    this.menuBest = document.createElement('div');
    this.menuBest.className = 'menu-stats';
    this.startRunButton = document.createElement('button');
    this.startRunButton.className = 'menu-start';
    this.startRunButton.textContent = this.uiText.btn_start ?? 'НАЧАТЬ СМЕНУ';

    const controls = document.createElement('p');
    controls.className = 'menu-controls';
    controls.textContent = 'Управление: A/D или ←/→, перетаскивание по экрану. Пробел или ОТКУП — выстрел.';

    const shopTitle = document.createElement('h3');
    shopTitle.textContent = this.uiText.screen_shop ?? 'Бухгалтерия';
    const shop = document.createElement('div');
    shop.className = 'shop-grid';

    for (const branch of this.config.upgrades) {
      const item = document.createElement('div');
      item.className = 'shop-item';
      const head = document.createElement('div');
      head.className = 'shop-head';
      const name = document.createElement('strong');
      name.textContent = branch.title;
      const level = document.createElement('span');
      head.append(name, level);
      const title = document.createElement('div');
      title.className = 'shop-title';
      const desc = document.createElement('div');
      desc.className = 'shop-desc';
      const actions = document.createElement('div');
      actions.className = 'shop-actions';
      const cost = document.createElement('span');
      const button = document.createElement('button');
      button.textContent = this.uiText.btn_buy ?? 'КУПИТЬ';
      actions.append(cost, button);
      item.append(head, title, desc, actions);
      shop.append(item);
      this.shopRows[branch.id] = { level, cost, title, desc, button };
      button.addEventListener('click', () => {
        void this.buyUpgrade(branch.id);
      });
    }

    this.resetProgressButton = document.createElement('button');
    this.resetProgressButton.className = 'menu-reset';
    this.resetProgressButton.textContent = this.uiText.btn_reset_progress ?? 'Сбросить прогресс';

    menuCard.append(menuTitle, this.menuWallet, this.menuBest, this.startRunButton, controls, shopTitle, shop, this.resetProgressButton);
    this.menu.append(menuCard);

    this.shell.append(this.canvas, hud, this.modal, this.menu);
    root.append(this.shell);

    this.updatePauseButtonLabel();
    this.renderMenu();

    this.bindEvents();
    this.audio.startMusic();
    this.showToast(this.config.dailyContracts[0]?.title ?? this.uiText.title);
    this.updateHud();
    this.syncBannerVisibility();
    this.platform.gameReady();
  }

  private setupCanvasResolution(): void {
    const rawDpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    this.dpr = clamp(rawDpr, 1, 2);
    this.canvas.width = Math.floor(WIDTH * this.dpr);
    this.canvas.height = Math.floor(HEIGHT * this.dpr);
    this.canvas.style.width = '100%';
    this.canvas.style.height = 'auto';
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      this.keys.add(key);
      if (event.key === ' ') {
        event.preventDefault();
        if (!event.repeat) {
          this.fireBribe();
        }
      }
    });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.key.toLowerCase());
    });

    this.canvas.addEventListener('pointerdown', (event) => {
      this.pointerDrag = true;
      this.dragPointerId = event.pointerId;
      this.canvas.setPointerCapture(event.pointerId);
      this.onPointerMove(event);
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.pointerDrag || this.dragPointerId !== event.pointerId) {
        return;
      }
      this.onPointerMove(event);
    });

    this.canvas.addEventListener('pointerup', (event) => {
      this.stopDrag(event.pointerId);
    });

    this.canvas.addEventListener('pointercancel', (event) => {
      this.stopDrag(event.pointerId);
    });

    this.canvas.addEventListener('pointerleave', (event) => {
      this.stopDrag(event.pointerId);
    });

    window.addEventListener('blur', () => {
      this.stopDrag();
      this.keys.clear();
    });

    this.pauseButton.addEventListener('click', () => {
      if (this.gameOver || !this.runActive) return;

      if (this.paused) {
        this.paused = false;
        this.manualPaused = false;
        this.pausedByUser = false;
      } else {
        this.paused = true;
        this.manualPaused = true;
        this.pausedByUser = true;
      }

      this.updatePauseButtonLabel();
      this.syncBannerVisibility();
      this.showToast(this.paused ? this.uiText.paused : this.uiText.resumed);
    });

    this.bribeButton.addEventListener('click', () => {
      this.fireBribe();
    });

    this.startRunButton.addEventListener('click', async () => {
      if (this.gameOver && this.shouldShowInterstitialOnRestart()) {
        this.lastInterstitialAtMs = Date.now();
        await this.platform.showInterstitial();
      }

      this.startNewRun();
    });

    this.resetProgressButton.addEventListener('click', () => {
      void this.handleProgressReset();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.paused = true;
        this.manualPaused = false;
        this.pausedByUser = false;
        this.keys.clear();
        this.updatePauseButtonLabel();
        this.syncBannerVisibility();
        this.showToast('Пауза (вкладка скрыта)');
      } else if (this.runActive) {
        this.paused = true;
        this.manualPaused = true;
        this.pausedByUser = false;
        this.updatePauseButtonLabel();
        this.syncBannerVisibility();
        this.showToast('Вернулись. Нажми ПРОДОЛЖИТЬ');
      }
    });

    this.platform.onPause(() => {
      if (this.platformPauseDepth === 0) {
        this.wasPausedBeforePlatformPause = this.paused;
        this.wasMutedBeforePlatformPause = this.audio.isMuted();
      }
      this.platformPauseDepth += 1;
      this.paused = true;
      this.pausedByUser = false;
      this.audio.setMuted(true);
      this.updatePauseButtonLabel();
      this.syncBannerVisibility();
    });

    this.platform.onResume(() => {
      if (this.platformPauseDepth <= 0) {
        return;
      }

      this.platformPauseDepth -= 1;
      if (this.platformPauseDepth > 0) {
        return;
      }

      const shouldStayPaused = this.gameOver || this.manualPaused || this.wasPausedBeforePlatformPause;
      this.paused = shouldStayPaused;
      this.audio.setMuted(this.wasMutedBeforePlatformPause);
      this.updatePauseButtonLabel();
      this.syncBannerVisibility();
    });

    this.reviveButton.addEventListener('click', async () => {
      if (!this.gameOver) {
        return;
      }
      const rewarded = await this.platform.showRewarded();
      if (!rewarded) {
        return;
      }

      this.coinsBalance = 50;
      this.gameOver = false;
      this.paused = false;
      this.manualPaused = false;
      this.modal.hidden = true;

      this.projectiles = [];
      this.obstacles = [];
      this.reviveInvulnMs = REVIVE_INVULN_MS;

      this.updatePauseButtonLabel();
      this.audio.setMuted(false);
      this.syncBannerVisibility();
      this.showToast(this.toastFrom('rewarded_revive', 'Второй шанс одобрен (1.2с иммунитет)'));
    });

    this.rewardX2Button.addEventListener('click', async () => {
      if (!this.gameOver || this.gameOverScoreMultiplier === 2) {
        return;
      }
      const rewarded = await this.platform.showRewarded();
      if (!rewarded) {
        return;
      }

      this.gameOverScoreMultiplier = 2;
      this.rewardX2Button.disabled = true;
      this.rewardX2Button.textContent = 'x2 ВЫРУЧКА АКТИВИРОВАНА';

      const boostedScore = this.gameOverBaseScore * this.gameOverScoreMultiplier;
      if (boostedScore > this.saveData.bestScore) {
        this.saveData.bestScore = boostedScore;
      }

      const bonus = this.sessionEarningsBase;
      if (bonus > 0) {
        this.saveData.walletCoins += bonus;
      }

      this.updateGameOverText();
      this.renderMenu();
      await SaveService.storeWithCloud(this.saveData);
      this.showToast('x2 выручка зафиксирована');
    });

    this.restartButton.addEventListener('click', () => {
      this.modal.hidden = true;
      this.menu.hidden = false;
      this.runActive = false;
      this.paused = true;
      this.manualPaused = false;
      this.pausedByUser = false;
      this.renderMenu();
      this.syncBannerVisibility();
    });
  }

  private async handleProgressReset(): Promise<void> {
    if (!window.confirm('Стереть весь прогресс и бухгалтерию?')) {
      return;
    }

    this.saveData = await SaveService.reset(this.config.upgrades);
    this.renderMenu();
    this.updateHud();
    this.showToast('Прогресс сброшен');
  }

  private renderMenu(): void {
    this.menuWallet.textContent = `${this.uiText.lbl_wallet ?? 'Баланс (Оболы)'}: ${Math.floor(this.saveData.walletCoins)}`;
    this.menuBest.textContent = `${this.uiText.lbl_best ?? 'Лучший рейс'}: ${this.saveData.bestScore}`;

    for (const branch of this.config.upgrades) {
      const level = this.saveData.upgrades[branch.id] ?? 0;
      const max = branch.levels.length;
      const row = this.shopRows[branch.id];
      const next = level < max ? branch.levels[level] : null;

      row.level.textContent = `${this.uiText.lbl_level ?? 'Ур.'} ${level}/${max}`;
      row.title.textContent = next?.title ?? 'Максимум';
      row.desc.textContent = next?.shortDesc ?? 'Ветка полностью улучшена';
      row.cost.textContent = next ? `${this.uiText.lbl_price ?? 'Цена'}: ${next.cost}` : 'Куплено всё';
      row.button.disabled = !next || this.saveData.walletCoins < next.cost;
    }
  }

  private async buyUpgrade(branchId: string): Promise<void> {
    const branch = this.config.upgrades.find((item) => item.id === branchId);
    if (!branch) {
      return;
    }

    const level = this.saveData.upgrades[branch.id] ?? 0;
    const next = branch.levels[level];
    if (!next) {
      return;
    }

    if (this.saveData.walletCoins < next.cost) {
      this.showToast('Недостаточно оболов в кошельке');
      return;
    }

    this.saveData.walletCoins -= next.cost;
    this.saveData.upgrades[branch.id] = level + 1;
    this.renderMenu();
    await SaveService.storeWithCloud(this.saveData);
    this.showToast(`Покупка: ${next.title}`);
  }

  private startNewRun(): void {
    this.reset();
    this.menu.hidden = true;
    this.runActive = true;
    this.paused = false;
    this.manualPaused = false;
    this.pausedByUser = false;
    this.audio.setMuted(false);
    this.applyMetaUpgradesForRun();
    this.updatePauseButtonLabel();
    this.syncBannerVisibility();
    this.showToast(this.toastFrom('start_run', this.config.dailyContracts[0]?.title ?? this.uiText.title));
  }

  private applyMetaUpgradesForRun(): void {
    const defense = this.currentLevelEffect('defense');
    this.shieldMax = Math.max(0, Math.floor(defense.shieldStart ?? 0));
    this.shieldCount = this.shieldMax;
    this.shieldRegenSec = Math.max(0, defense.shieldRegenSec ?? 0);
    this.shieldRegenTimer = this.shieldRegenSec;
    this.obstacleDamageMult = Math.max(0.1, defense.obstacleDamageMult ?? 1);

    const farm = this.currentLevelEffect('farm');
    this.magnetMult = Math.max(1, farm.magnetMult ?? 1);
    this.soulValueMult = Math.max(0.1, farm.soulValueMult ?? 1);
    this.doubleSoulChance = clamp(farm.doubleSoulChance ?? 0, 0, 1);

    const skills = this.currentLevelEffect('skills');
    this.bribeCooldownMult = Math.max(0.2, skills.bribeCooldownMult ?? 1);
    this.freeBribeEverySec = Math.max(0, skills.freeBribeEverySec ?? 0);
    this.bribeSplashRadius = Math.max(0, skills.bribeSplashRadius ?? 0);
    this.bribeCooldownLeftSec = 0;
    this.freeBribeReady = false;
    this.freeBribeTimerSec = this.freeBribeEverySec;
  }

  private currentLevelEffect(branchId: string): UpgradeEffect {
    const branch = this.config.upgrades.find((item) => item.id === branchId);
    if (!branch) {
      return {};
    }

    const level = this.saveData.upgrades[branch.id] ?? 0;
    if (level <= 0) {
      return {};
    }

    const selectedLevel = branch.levels[Math.min(level, branch.levels.length) - 1] as UpgradeLevelConfig;
    return selectedLevel.effect;
  }

  private updateGameOverText(): void {
    const finalScore = this.gameOverBaseScore * this.gameOverScoreMultiplier;
    const totalEarnings = this.sessionEarningsBase * this.gameOverScoreMultiplier;
    this.modalText.textContent = `${this.uiText.gameOver}. Score: ${finalScore}. Best: ${this.saveData.bestScore}. Выручка: +${totalEarnings}`;
  }

  private shouldShowInterstitialOnRestart(): boolean {
    if (this.deathCount <= 0 || this.deathCount % 2 !== 0) {
      return false;
    }
    const minIntervalSec = this.config.economy.minInterstitialIntervalSec ?? 70;
    const elapsedMs = Date.now() - this.lastInterstitialAtMs;
    return elapsedMs >= minIntervalSec * 1000;
  }

  private stopDrag(pointerId?: number): void {
    if (pointerId !== undefined && this.dragPointerId !== pointerId) {
      return;
    }

    if (this.dragPointerId !== null) {
      try {
        this.canvas.releasePointerCapture(this.dragPointerId);
      } catch {
        // no-op
      }
    }

    this.pointerDrag = false;
    this.dragPointerId = null;
  }

  private onPointerMove(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const normalizedX = (event.clientX - rect.left) / rect.width;
    this.player.x = clamp(normalizedX * WIDTH, this.player.w / 2, WIDTH - this.player.w / 2);
  }

  private updatePauseButtonLabel(): void {
    this.pauseButton.textContent = this.paused ? 'ПРОДОЛЖИТЬ' : 'ПАУЗА';
  }

  start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame((ts) => this.loop(ts));
  }

  private loop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    if (!this.paused && !this.gameOver && this.runActive) {
      this.update(dt);
    }

    this.render();
    requestAnimationFrame((ts) => this.loop(ts));
  }

  private update(dt: number): void {
    this.elapsedSec += dt;
    this.distance += this.forwardSpeed() * dt;
    this.reviveInvulnMs = Math.max(0, this.reviveInvulnMs - dt * 1000);
    this.bribeCooldownLeftSec = Math.max(0, this.bribeCooldownLeftSec - dt);

    if (this.freeBribeEverySec > 0 && !this.freeBribeReady) {
      this.freeBribeTimerSec -= dt;
      if (this.freeBribeTimerSec <= 0) {
        this.freeBribeReady = true;
      }
    }

    if (this.shieldRegenSec > 0 && this.shieldCount < this.shieldMax) {
      this.shieldRegenTimer -= dt;
      if (this.shieldRegenTimer <= 0) {
        this.shieldCount += 1;
        this.shieldRegenTimer = this.shieldRegenSec;
      }
    }

    const moveDir = (this.keys.has('arrowleft') || this.keys.has('a') ? -1 : 0) + (this.keys.has('arrowright') || this.keys.has('d') ? 1 : 0);
    this.player.x = clamp(this.player.x + moveDir * this.player.speed * dt, this.player.w / 2, WIDTH - this.player.w / 2);

    const drain = this.currentDrainRate() * this.effectMultiplier('drainMultiplier') * dt;
    this.coinsBalance -= drain;

    this.spawnAndMove(dt);
    this.handleCollisions();
    this.updateEffects(dt);

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.toast.classList.remove('active');
      }
    }

    if (this.coinsBalance <= 0) {
      this.triggerGameOver();
    }

    this.updateHud();
  }

  private spawnAndMove(dt: number): void {
    const scrollSpeed = this.forwardSpeed();

    this.obstacleSpawnTimer -= dt;
    if (this.obstacleSpawnTimer <= 0) {
      this.obstacleSpawnTimer = rand(0.8, 1.4);
      const template = this.config.obstacles[Math.floor(Math.random() * this.config.obstacles.length)] as ObstacleConfig;
      this.obstacles.push({
        x: rand(template.radius, WIDTH - template.radius),
        y: -40,
        r: template.radius,
        damage: template.damage,
        color: template.color
      });
    }

    this.coinSpawnTimer -= dt;
    if (this.coinSpawnTimer <= 0) {
      this.coinSpawnTimer = rand(0.45, 0.9);
      this.coins.push({
        x: rand(24, WIDTH - 24),
        y: -20,
        r: 10,
        value: this.config.economy.pickupValue
      });
    }

    this.gateSpawnTimer -= dt;
    if (this.gateSpawnTimer <= 0) {
      this.gateSpawnTimer = this.config.economy.gateIntervalSec;
      const [left, right] = this.pickTwoGates();
      this.gates.push({ y: -60, left, right, width: 170, chosen: false });
    }

    this.obstacles.forEach((obstacle) => (obstacle.y += scrollSpeed * dt));
    this.coins.forEach((coin) => (coin.y += scrollSpeed * dt));
    this.gates.forEach((gate) => (gate.y += scrollSpeed * dt));
    this.projectiles.forEach((projectile) => (projectile.y -= projectile.speed * dt));

    this.obstacles = this.obstacles.filter((entity) => entity.y < HEIGHT + 40);
    this.coins = this.coins.filter((entity) => entity.y < HEIGHT + 30);
    this.gates = this.gates.filter((entity) => entity.y < HEIGHT + 80);
    this.projectiles = this.projectiles.filter((entity) => entity.y > -20);
  }

  private pickTwoGates(): [GateConfig, GateConfig] {
    const shuffled = [...this.config.gates].sort(() => Math.random() - 0.5);
    return [shuffled[0] as GateConfig, shuffled[1] as GateConfig];
  }

  private gateRects(gate: GatePair): { leftX: number; rightX: number; width: number } {
    const center = WIDTH / 2;
    const leftX = center - GATE_GAP - gate.width;
    const rightX = center + GATE_GAP;
    return { leftX, rightX, width: gate.width };
  }

  private handleCollisions(): void {
    const boatBody = { x: this.player.x, y: this.player.y, r: this.player.w * 0.45 };
    const magnetRadius = BASE_MAGNET_RADIUS * this.magnetMult;
    const magnetRadiusSq = magnetRadius * magnetRadius;

    this.coins = this.coins.filter((coin) => {
      const inMagnet = distanceSq(boatBody, coin) <= magnetRadiusSq;
      if (!inMagnet && !intersects(boatBody, coin)) {
        return true;
      }

      let value = coin.value * this.soulValueMult * this.effectMultiplier('pickupMultiplier');
      this.soulsCollected += 1;

      if (Math.random() < this.doubleSoulChance) {
        value += coin.value * this.soulValueMult * this.effectMultiplier('pickupMultiplier');
        this.soulsCollected += 1;
      }

      this.coinsBalance += value;
      this.showToast(`${this.toastFrom('pick_soul', this.uiText.coinPickup)} +${Math.round(value)}`);
      return false;
    });

    this.obstacles = this.obstacles.filter((obstacle) => {
      if (!intersects(boatBody, obstacle)) {
        return true;
      }

      if (this.reviveInvulnMs <= 0) {
        if (this.shieldCount > 0) {
          this.shieldCount -= 1;
          this.shieldRegenTimer = this.shieldRegenSec;
          this.showToast('Щит поглотил урон');
        } else {
          const penalty = this.config.economy.collisionPenalty
            * obstacle.damage
            * this.effectMultiplier('collisionPenaltyMultiplier')
            * this.obstacleDamageMult;
          this.coinsBalance -= penalty;
          this.showToast(this.toastFrom('hit_obstacle', this.uiText.hitObstacle));
        }
      }

      return false;
    });

    for (const gate of this.gates) {
      if (gate.chosen) continue;
      if (Math.abs(gate.y - this.player.y) > GATE_HEIGHT) continue;

      const { leftX, rightX, width } = this.gateRects(gate);
      const leftCenter = leftX + width * 0.5;
      const rightCenter = rightX + width * 0.5;
      const inLeftRect = this.player.x >= leftX && this.player.x <= leftX + width;
      const inRightRect = this.player.x >= rightX && this.player.x <= rightX + width;

      if (inLeftRect) {
        gate.chosen = true;
        this.applyGate(gate.left);
      } else if (inRightRect) {
        gate.chosen = true;
        this.applyGate(gate.right);
      } else {
        const distanceLeft = Math.abs(this.player.x - leftCenter);
        const distanceRight = Math.abs(this.player.x - rightCenter);
        gate.chosen = true;
        this.applyGate(distanceLeft <= distanceRight ? gate.left : gate.right);
      }
    }

    this.projectiles = this.projectiles.filter((projectile) => {
      const targetIndex = this.obstacles.findIndex((obstacle) => intersects(projectile, obstacle));
      if (targetIndex === -1) {
        return true;
      }

      const hit = this.obstacles[targetIndex] as ObstacleEntity;
      this.obstacles.splice(targetIndex, 1);

      if (this.bribeSplashRadius > 0) {
        const splashSq = this.bribeSplashRadius * this.bribeSplashRadius;
        this.obstacles = this.obstacles.filter((obstacle) => distanceSq(obstacle, hit) > splashSq);
      }

      return false;
    });
  }

  private applyGate(gate: GateConfig): void {
    if (gate.permanent && gate.id === 'DEBT') {
      const hasPermanentDebt = this.effects.some((effect) => effect.permanent && effect.gateId === 'DEBT');
      if (hasPermanentDebt) {
        this.showToast('Долг уже оформлен');
        return;
      }
    }

    const duration = gate.permanent ? 0 : (gate.durationSec || this.config.economy.gateDurationSec);
    this.effects.push({
      gateId: gate.id,
      effect: gate.effects,
      permanent: Boolean(gate.permanent),
      remainingSec: duration
    });

    const msg = this.uiText.gateChosen.replace('{gate}', gate.name);
    const gateToastKey = gate.id === 'DEBT'
      ? 'gate_debt'
      : (gate.id === 'MERCY' || gate.id === 'PLENTY' ? 'gate_safe' : 'gate_gamble');
    this.showToast(this.toastFrom(gateToastKey, msg));
  }

  private updateEffects(dt: number): void {
    this.effects = this.effects.filter((effect) => {
      if (effect.permanent) {
        return true;
      }
      effect.remainingSec -= dt;
      return effect.remainingSec > 0;
    });
  }

  private fireBribe(): void {
    if (this.paused || this.gameOver || !this.runActive) return;
    if (this.bribeCooldownLeftSec > 0) return;

    const randomFreeShot = Math.random() < this.config.economy.freeBribeChance;
    const timerFreeShot = this.freeBribeReady;
    const freeShot = randomFreeShot || timerFreeShot;

    if (!freeShot && this.coinsBalance < this.config.economy.bribeShotCost) {
      this.showToast(this.uiText.insufficientCoins);
      return;
    }

    if (timerFreeShot) {
      this.freeBribeReady = false;
      this.freeBribeTimerSec = this.freeBribeEverySec;
    }

    if (!freeShot) {
      const cost = this.config.economy.bribeShotCost;
      this.coinsBalance -= cost;
      const fallback = `Подкуп стражи: -${cost} обол`;
      this.showToast(this.toastFrom('bribe_shot', cost === 1 ? this.uiText.paidBribe : fallback));
    } else {
      this.showToast(this.uiText.freeBribe);
    }

    this.bribeCooldownLeftSec = BASE_BRIBE_COOLDOWN_SEC * this.bribeCooldownMult;

    this.projectiles.push({
      x: this.player.x,
      y: this.player.y - 20,
      r: 8,
      speed: 450
    });
  }

  private triggerGameOver(): void {
    const earnings = Math.max(0, Math.floor(this.distance / 10) + this.soulsCollected + Math.floor(Math.max(0, this.coinsBalance) / 10));
    this.sessionEarningsBase = earnings;
    this.saveData.walletCoins += earnings;

    this.gameOver = true;
    this.paused = true;
    this.pausedByUser = false;
    this.runActive = false;
    this.updatePauseButtonLabel();
    this.coinsBalance = 0;
    this.deathCount += 1;

    this.gameOverBaseScore = Math.floor(this.distance);
    this.gameOverScoreMultiplier = 1;
    this.rewardX2Button.disabled = false;
    this.rewardX2Button.textContent = 'СМОТРЕТЬ РЕКЛАМУ (x2 ВЫРУЧКУ)';

    if (this.gameOverBaseScore > this.saveData.bestScore) {
      this.saveData.bestScore = this.gameOverBaseScore;
    }

    this.updateGameOverText();
    this.showToast(this.toastFrom('game_over', this.uiText.gameOver));
    this.modal.hidden = false;
    this.menu.hidden = false;
    this.audio.setMuted(true);
    this.syncBannerVisibility();
    this.renderMenu();
    void SaveService.storeWithCloud(this.saveData);
  }

  private updateHud(): void {
    const shieldText = this.shieldMax > 0 ? ` | Щит: ${this.shieldCount}/${this.shieldMax}` : '';
    this.coinPill.textContent = `${this.uiText.coinLabel}: ${Math.max(0, Math.floor(this.coinsBalance))}${shieldText}`;
    this.scorePill.textContent = `Score: ${Math.floor(this.distance)} / Best: ${this.saveData.bestScore}`;

    // Bribe button UX: show cost/free/cooldown + disable when unavailable.
    const cost = this.config.economy.bribeShotCost;
    const cooldown = this.bribeCooldownLeftSec;
    const canAfford = this.coinsBalance >= cost;
    const canFire = this.runActive && !this.paused && !this.gameOver && cooldown <= 0 && (this.freeBribeReady || canAfford);
    this.bribeButton.disabled = !canFire;

    if (!this.runActive) {
      this.bribeButton.textContent = 'ОТКУП';
      return;
    }

    if (cooldown > 0) {
      this.bribeButton.textContent = `ОТКУП (КД ${cooldown.toFixed(1)}с)`;
      return;
    }

    if (this.freeBribeReady) {
      this.bribeButton.textContent = 'ОТКУП (БЕСПЛ)';
      return;
    }

    if (this.freeBribeEverySec > 0) {
      const eta = Math.max(0, Math.ceil(this.freeBribeTimerSec));
      this.bribeButton.textContent = `ОТКУП (−${cost} / БЕСПЛ через ${eta}с)`;
      return;
    }

    this.bribeButton.textContent = `ОТКУП (−${cost} обол)`;
  }

  private currentDrainRate(): number {
    const tiers = [...this.config.economy.coinDrainTiers].sort((a, b) => a.fromSec - b.fromSec);
    let current = tiers[0]?.rate ?? 0;
    for (const tier of tiers) {
      if (this.elapsedSec >= tier.fromSec) {
        current = tier.rate;
      }
    }
    return current;
  }

  private effectMultiplier(key: keyof GateEffect): number {
    return this.effects.reduce((acc, effect) => {
      const value = effect.effect[key];
      if (typeof value !== 'number') {
        return acc;
      }
      return acc * value;
    }, 1);
  }

  private forwardSpeed(): number {
    return 150 * this.effectMultiplier('speedMultiplier');
  }

  private firstGateDelaySec(): number {
    return this.config.economy.firstGateDelaySec ?? 18;
  }

  private syncBannerVisibility(): void {
    if (this.gameOver || this.pausedByUser || !this.runActive) {
      void this.platform.showBanner();
      return;
    }

    void this.platform.hideBanner();
  }

  private toastFrom(key: string, fallback: string): string {
    const map = this.uiText.ui_text?.toasts;
    const arr = (map && (map[key] ?? map.default)) as string[] | undefined;
    if (Array.isArray(arr) && arr.length) return arr[(Math.random() * arr.length) | 0] as string;
    return fallback;
  }

  private showToast(message: string): void {
    this.toast.textContent = message;
    this.toast.classList.add('active');
    this.toastTimer = 1.7;
  }

  private reset(): void {
    this.elapsedSec = 0;
    this.distance = 0;
    this.coinsBalance = this.config.economy.startCoins;
    this.paused = true;
    this.manualPaused = false;
    this.pausedByUser = false;
    this.gameOver = false;
    this.reviveInvulnMs = 0;
    this.gameOverBaseScore = 0;
    this.gameOverScoreMultiplier = 1;
    this.soulsCollected = 0;
    this.sessionEarningsBase = 0;
    this.shieldMax = 0;
    this.shieldCount = 0;
    this.shieldRegenSec = 0;
    this.shieldRegenTimer = 0;
    this.obstacleDamageMult = 1;
    this.magnetMult = 1;
    this.soulValueMult = 1;
    this.doubleSoulChance = 0;
    this.bribeCooldownMult = 1;
    this.freeBribeEverySec = 0;
    this.bribeSplashRadius = 0;
    this.bribeCooldownLeftSec = 0;
    this.freeBribeTimerSec = 0;
    this.freeBribeReady = false;
    this.stopDrag();
    this.obstacles = [];
    this.coins = [];
    this.projectiles = [];
    this.gates = [];
    this.effects = [];
    this.gateSpawnTimer = this.firstGateDelaySec();
    this.modal.hidden = true;
    this.audio.setMuted(false);
    this.updatePauseButtonLabel();
    this.updateHud();
  }

  private render(): void {
    // Render in logical coordinates; scale canvas for high-DPI screens.
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, WIDTH, HEIGHT);

    this.ctx.strokeStyle = 'rgba(107,114,128,0.35)';
    this.ctx.lineWidth = 2;
    for (let i = 1; i < 4; i += 1) {
      const x = (WIDTH / 4) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, HEIGHT);
      this.ctx.stroke();
    }

    this.drawBoat();

    for (const coin of this.coins) {
      this.ctx.fillStyle = '#f59e0b';
      this.ctx.beginPath();
      this.ctx.arc(coin.x, coin.y, coin.r, 0, Math.PI * 2);
      this.ctx.fill();
    }

    for (const obstacle of this.obstacles) {
      this.ctx.fillStyle = obstacle.color;
      this.ctx.beginPath();
      this.ctx.arc(obstacle.x, obstacle.y, obstacle.r, 0, Math.PI * 2);
      this.ctx.fill();
    }

    for (const projectile of this.projectiles) {
      this.ctx.fillStyle = '#f8fafc';
      this.ctx.beginPath();
      this.ctx.arc(projectile.x, projectile.y, projectile.r, 0, Math.PI * 2);
      this.ctx.fill();
    }

    for (const gate of this.gates) {
      this.drawGate(gate);
    }
  }

  private drawBoat(): void {
    const { x, y, w, h } = this.player;
    this.ctx.fillStyle = '#38bdf8';
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - h * 0.5);
    this.ctx.lineTo(x - w * 0.5, y + h * 0.5);
    this.ctx.lineTo(x + w * 0.5, y + h * 0.5);
    this.ctx.closePath();
    this.ctx.fill();
  }

  private drawGate(gate: GatePair): void {
    const { leftX, rightX, width } = this.gateRects(gate);

    this.ctx.fillStyle = 'rgba(16,185,129,0.55)';
    this.ctx.fillRect(leftX, gate.y, width, GATE_HEIGHT);
    this.ctx.fillStyle = 'rgba(168,85,247,0.55)';
    this.ctx.fillRect(rightX, gate.y, width, GATE_HEIGHT);

    this.ctx.fillStyle = '#e2e8f0';
    this.ctx.font = '12px sans-serif';
    const leftLabel = gate.left.name.replace(/^Врата\s+/u, '').trim();
    const rightLabel = gate.right.name.replace(/^Врата\s+/u, '').trim();
    this.ctx.fillText(leftLabel, leftX + 8, gate.y + 17);
    this.ctx.fillText(rightLabel, rightX + 8, gate.y + 17);
  }
}
