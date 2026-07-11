export class Haptics {
  private enabled = true;

  setEnabled(v: boolean): void {
    this.enabled = v;
  }

  get supported(): boolean {
    return typeof navigator.vibrate === 'function';
  }

  pop(): void {
    if (this.enabled && this.supported) navigator.vibrate(12);
  }

  miss(): void {
    if (this.enabled && this.supported) navigator.vibrate([8, 30, 8]);
  }
}
