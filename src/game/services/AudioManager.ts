export type SfxName = string;

export class AudioManager {
  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  playSfx(_name: SfxName): void {
    if (this.muted) {
      return;
    }

    // Stub: later this is where named sound effects will be resolved and played.
  }

  startMusic(): void {
    if (this.muted) {
      return;
    }

    // Stub: later this is where background music will be initialized/looped.
  }
}
