import './style.css';
import { Game } from './game/core/Game';
import { SaveService } from './game/services/SaveService';
import { createPlatform } from './platform/Platform';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing #app root node');
}

void (async () => {
  const platform = await createPlatform();
  SaveService.setCloudAdapter(platform);
  await Game.boot(root, platform);
})().catch((error: unknown) => {
  root.innerHTML = `<pre>Failed to start game: ${String(error)}</pre>`;
});
