# Charon's Gamble MVP (Vite + TypeScript + Canvas)

## File tree

```text
.
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
└── src
    ├── main.ts
    ├── style.css
    └── game
        ├── core
        │   ├── Game.ts
        │   └── GameConfig.ts
        ├── data
        │   ├── daily_contracts.json
        │   ├── economy_config.json
        │   ├── gates.json
        │   ├── obstacles.json
        │   ├── ui_text_ru.json
        │   └── upgrades.json
        ├── services
        │   └── SaveService.ts
        └── types
            └── config.ts
```

## npm scripts

- `npm run dev` - start local Vite development server (`npx --yes vite`).
- `npm run build` - type-check and produce production build (`npx --yes tsc -b && npx --yes vite build`).
- `npm run preview` - preview built app locally (`npx --yes vite preview`).
- `npm run check` - run TypeScript type checking only (`npx --yes tsc --noEmit`).

## How to run

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start dev server:
   ```bash
   npm run dev
   ```
3. Open the printed localhost URL in browser.

### If you see: "vite не является внутренней или внешней командой" (Windows)

Install dependencies and run dev server again:

```bash
npm install
npm run dev
```

## Gameplay MVP implemented

- Boat auto-advances while world scrolls downward.
- Left/right movement via keyboard (`A/D`, arrows) and drag on canvas.
- Coin economy:
  - Drain by configured time tiers.
  - Coin pickups add obols.
  - Obstacle collisions subtract obols.
- Tap/click (or `Space`) triggers bribe shot:
  - Usually costs 1 obol.
  - Can be free by `freeBribeChance` (+ upgrade bonus).
  - Destroys first obstacle hit.
- Gate system:
  - Spawns gate pair every configured interval (~20s).
  - Player chooses gate by steering left/right as crossing.
  - Applies temporary effects, or permanent effect for `DEBT`.
- UI:
  - Obol counter.
  - Score and best score.
  - Toast messages loaded from Russian UI text JSON.
  - Pause button.
  - Game over modal with revive placeholder and restart.
- Save/load in `localStorage`:
  - Best score.
  - Upgrade levels.

## Data-driven startup loading

The following JSON files are placed in `/src/game/data` and loaded at startup into a `GameConfig` singleton:

- `ui_text_ru.json`
- `economy_config.json`
- `gates.json`
- `obstacles.json`
- `upgrades.json`
- `daily_contracts.json`

## Test checklist

- [ ] `npm install` succeeds.
- [ ] `npm run check` passes.
- [ ] `npm run build` passes.
- [ ] `npm run dev` starts and loads canvas scene.
- [ ] Keyboard movement works (`A/D`, arrows).
- [ ] Drag movement works.
- [ ] Tap/click and `Space` fire bribe shot.
- [ ] Bribe shot removes first obstacle hit.
- [ ] Gate pair appears around every 20 seconds.
- [ ] Left/right gate choice applies effect and toast.
- [ ] Coin drain scales with time tiers.
- [ ] Coin pickup increases obols.
- [ ] Obstacle collision decreases obols.
- [ ] Game over modal appears at 0 obols.
- [ ] Restart resets run state.
- [ ] Revive button shows placeholder toast.
- [ ] Best score persists across reload.
- [ ] Upgrade levels are loaded/saved in localStorage payload.

## Yandex platform adapter

A platform layer is available at `src/platform/Platform.ts` with:

- `Platform` interface
- `YandexPlatform` for YaGames SDK
- `NoopPlatform` fallback for local/dev

### SDK notes

- In production, include Yandex SDK script before app boot (example is commented in `index.html`):
  - `<script src="/sdk.js"></script>`
- `createPlatform()` auto-detects `window.YaGames.init`; if missing or initialization fails, it falls back safely to `NoopPlatform`.

### Ads + pause wiring

- Interstitial ad triggers on every 2nd death, after game-over modal is shown.
- Revive button runs rewarded flow:
  - rewarded success -> revive with `coinsBalance = 50` and continue run
  - close/error/no reward -> no revive
- Platform pause/resume events are subscribed via `ysdk.on('game_api_pause'|'game_api_resume')` wrappers.

### Platform test checklist

- [ ] Without YaGames SDK, game starts with NoopPlatform (no crashes).
- [ ] On 2nd, 4th, 6th... death, interstitial call is attempted.
- [ ] Rewarded ad success revives player with 50 obols.
- [ ] Rewarded close/error does not revive.
- [ ] `game_api_pause` pauses gameplay.
- [ ] `game_api_resume` does not break manual pause state.
