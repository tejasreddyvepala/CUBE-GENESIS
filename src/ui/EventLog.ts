// ============================================================
// CUBE GENESIS — Event Log
// Scrolling event messages displayed bottom-left.
// ============================================================

import { EventColorKey } from '../utils/color.ts';

const MAX_EVENTS = 6;

export class EventLog {
  private container: HTMLElement | null;
  private events: Array<{ message: string; type: EventColorKey }> = [];

  constructor() {
    this.container = document.getElementById('hud-eventlog');
  }

  // ──────────────────────────────────────────────
  // ADD EVENT
  // ──────────────────────────────────────────────

  addEvent(message: string, type: EventColorKey = 'event'): void {
    this.events.unshift({ message, type });
    if (this.events.length > MAX_EVENTS) {
      this.events.length = MAX_EVENTS;
    }
    this._render();
  }

  // ──────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────

  private _render(): void {
    if (!this.container) return;

    this.container.innerHTML = '';
    this.events.forEach((evt, idx) => {
      const div = document.createElement('div');
      div.className = `event-entry ${evt.type}`;
      if (idx >= 3) div.classList.add('fading');
      div.textContent = `> ${evt.message}`;
      this.container!.appendChild(div);
    });
  }

  clear(): void {
    this.events = [];
    if (this.container) this.container.innerHTML = '';
  }
}
