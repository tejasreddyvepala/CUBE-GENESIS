// ============================================================
// CUBE GENESIS — Save Manager
// Auto-save, manual save/load, file export/import.
// ============================================================

import { CONFIG } from '../config.ts';
import { World } from '../world/World.ts';
import { Serializer } from './Serializer.ts';
import {
  SaveFile,
  validateSaveFile,
  migrate,
  CURRENT_SAVE_VERSION,
} from './SaveSchema.ts';

export class SaveManager {
  private world: World;
  private serializer: Serializer;
  private lastAutoSaveTick: number = 0;
  private savingIndicatorTimeout: ReturnType<typeof setTimeout> | null = null;
  private onSaved: (() => void) | null = null;

  constructor(world: World) {
    this.world = world;
    this.serializer = new Serializer();
  }

  setOnSaved(cb: () => void): void {
    this.onSaved = cb;
  }

  // ──────────────────────────────────────────────
  // AUTO-SAVE
  // ──────────────────────────────────────────────

  autoSave(): void {
    try {
      const save = this.serializer.serialize(this.world);
      const json = JSON.stringify(save);

      if (json.length > CONFIG.MAX_LOCALSTORAGE_SIZE) {
        console.warn('[SaveManager] Save file is large:', Math.round(json.length / 1024), 'KB. Consider file export.');
      }

      localStorage.setItem(CONFIG.LOCALSTORAGE_KEY_AUTOSAVE, json);
      this.lastAutoSaveTick = this.world.worldAge;
      this.onSaved?.();
    } catch (e) {
      console.error('[SaveManager] Auto-save failed:', e);
    }
  }

  // ──────────────────────────────────────────────
  // MANUAL SAVE (+ file download)
  // ──────────────────────────────────────────────

  manualSave(): void {
    this.autoSave(); // Also write to localStorage

    try {
      const save = this.serializer.serialize(this.world);
      const json = JSON.stringify(save, null, 2);
      const stats = this.world.getWorldStats();
      const filename = `cube-genesis-gen${stats.generation}-era${stats.currentEra + 1}-${Date.now()}.json`;
      this._downloadFile(json, filename, 'application/json');
    } catch (e) {
      console.error('[SaveManager] Manual save failed:', e);
    }
  }

  // ──────────────────────────────────────────────
  // LOAD FROM COMMITTED REPO SAVE (public/saves/latest.json)
  // ──────────────────────────────────────────────

  async loadDefaultSave(): Promise<SaveFile | null> {
    try {
      const res = await fetch('/saves/latest.json');
      if (!res.ok) return null;
      const parsed = await res.json() as Record<string, unknown>;
      if (!validateSaveFile(parsed)) return null;
      return migrate(parsed);
    } catch {
      return null;
    }
  }

  // ──────────────────────────────────────────────
  // LOAD FROM LOCALSTORAGE
  // ──────────────────────────────────────────────

  loadFromLocalStorage(): SaveFile | null {
    // Prefer the most recent of autosave / emergency save
    const autoStr = localStorage.getItem(CONFIG.LOCALSTORAGE_KEY_AUTOSAVE);
    const emergStr = localStorage.getItem(CONFIG.LOCALSTORAGE_KEY_EMERGENCY);

    let bestSave: SaveFile | null = null;
    let bestTime = 0;

    for (const str of [autoStr, emergStr]) {
      if (!str) continue;
      try {
        const parsed = JSON.parse(str) as Record<string, unknown>;
        if (!validateSaveFile(parsed)) continue;
        const migrated = migrate(parsed);
        if (migrated.savedAt > bestTime) {
          bestTime = migrated.savedAt;
          bestSave = migrated;
        }
      } catch {
        // corrupt save — skip
      }
    }

    return bestSave;
  }

  // ──────────────────────────────────────────────
  // LOAD FROM FILE
  // ──────────────────────────────────────────────

  async loadFromFile(file: File): Promise<SaveFile | null> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const parsed = JSON.parse(text) as Record<string, unknown>;
          if (!validateSaveFile(parsed)) {
            console.error('[SaveManager] Invalid save file format');
            resolve(null);
            return;
          }
          resolve(migrate(parsed));
        } catch (err) {
          console.error('[SaveManager] Failed to parse save file:', err);
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
  }

  // ──────────────────────────────────────────────
  // RESUME MODAL
  // ──────────────────────────────────────────────

  async checkAndShowResumeModal(onResume: (save: SaveFile) => void, onNew: () => void): Promise<void> {
    // Priority: localStorage (in-progress session) → committed repo save → fresh start
    const save = this.loadFromLocalStorage() ?? await this.loadDefaultSave();
    if (!save) {
      onNew();
      return;
    }

    const modal = document.getElementById('resume-modal');
    if (!modal) {
      onNew();
      return;
    }

    // Populate modal stats
    const sim = save.simulation;
    const leafCount = save.cubes.leafNodes.length + save.cubes.ghosts.length;
    const eraName = CONFIG.ERA_NAMES[sim.currentEra] ?? 'Unknown';

    this._setModalText('modal-gen',  String(sim.maxGenerationReached));
    this._setModalText('modal-era',  `${sim.currentEra + 1} — ${eraName}`);
    this._setModalText('modal-pop',  String(leafCount));
    this._setModalText('modal-civ',  String(Math.floor(sim.civScore)));
    this._setModalText('modal-age',  String(sim.worldAge.toLocaleString()));

    const minutesAgo = Math.floor((Date.now() - save.savedAt) / 60000);
    const timeStr = minutesAgo < 1
      ? 'just now'
      : minutesAgo < 60
        ? `${minutesAgo}m ago`
        : `${Math.floor(minutesAgo / 60)}h ago`;
    this._setModalText('modal-saved', timeStr);

    modal.classList.remove('hidden');

    // Wire buttons (once)
    const resumeBtn = document.getElementById('modal-resume');
    const newBtn = document.getElementById('modal-new');

    const cleanup = () => { modal.classList.add('hidden'); };

    resumeBtn?.addEventListener('click', () => {
      cleanup();
      onResume(save);
    }, { once: true });

    newBtn?.addEventListener('click', () => {
      cleanup();
      this.clearSave();
      onNew();
    }, { once: true });
  }

  private _setModalText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ──────────────────────────────────────────────
  // CLEAR SAVE
  // ──────────────────────────────────────────────

  clearSave(): void {
    localStorage.removeItem(CONFIG.LOCALSTORAGE_KEY_AUTOSAVE);
    localStorage.removeItem(CONFIG.LOCALSTORAGE_KEY_EMERGENCY);
  }

  // ──────────────────────────────────────────────
  // AUTO-SAVE TICK CHECK
  // ──────────────────────────────────────────────

  setupAutoSave(getTickCount: () => number): void {
    // Called by game loop each frame
    // Use tick-based interval rather than setTimeout for sim-speed consistency
    void getTickCount; // Referenced in update check below
  }

  checkAutoSave(currentTick: number): void {
    if (currentTick - this.lastAutoSaveTick >= CONFIG.AUTOSAVE_INTERVAL) {
      this.autoSave();
    }
  }

  // ──────────────────────────────────────────────
  // EMERGENCY SAVE ON UNLOAD
  // ──────────────────────────────────────────────

  registerBeforeUnload(): void {
    if (!CONFIG.EMERGENCY_SAVE_ON_UNLOAD) return;

    window.addEventListener('beforeunload', () => {
      try {
        const emergency = this.serializer.serializeEmergency(this.world);
        localStorage.setItem(CONFIG.LOCALSTORAGE_KEY_EMERGENCY, JSON.stringify(emergency));
      } catch {
        // beforeunload must be fast — swallow errors
      }
    });
  }

  // ──────────────────────────────────────────────
  // SAVE/LOAD/EXPORT BUTTON WIRING
  // ──────────────────────────────────────────────

  setupSaveButtons(onLoad: (save: SaveFile) => void): void {
    document.getElementById('btn-save')?.addEventListener('click', () => {
      this.manualSave();
      // Flash save indicator
      const btn = document.getElementById('btn-save');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'SAVED!';
        setTimeout(() => { if (btn) btn.textContent = orig; }, 1200);
      }
    });

    document.getElementById('btn-export')?.addEventListener('click', () => {
      this.manualSave(); // same as manual save for now
    });

    const fileInput = document.getElementById('file-input') as HTMLInputElement | null;

    document.getElementById('btn-load')?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', async () => {
      const file = fileInput?.files?.[0];
      if (!file) return;
      const save = await this.loadFromFile(file);
      if (save) {
        onLoad(save);
      } else {
        console.warn('[SaveManager] Failed to load save file');
      }
      // Reset input
      if (fileInput) fileInput.value = '';
    });
  }

  // ──────────────────────────────────────────────
  // SHARE URL (compress + base64)
  // ──────────────────────────────────────────────

  async exportShareable(): Promise<void> {
    try {
      const save = this.serializer.serialize(this.world);
      const json = JSON.stringify(save);

      if ('CompressionStream' in window) {
        const stream = new CompressionStream('gzip');
        const writer = stream.writable.getWriter();
        const encoder = new TextEncoder();
        writer.write(encoder.encode(json));
        writer.close();

        const chunks: Uint8Array[] = [];
        const reader = stream.readable.getReader();
        let done = false;
        while (!done) {
          const { value, done: d } = await reader.read();
          if (value) chunks.push(value);
          done = d;
        }

        const compressed = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
        let offset = 0;
        for (const chunk of chunks) {
          compressed.set(chunk, offset);
          offset += chunk.length;
        }

        const base64 = btoa(String.fromCharCode(...compressed));
        const url = `${window.location.origin}${window.location.pathname}?save=${encodeURIComponent(base64)}`;
        await navigator.clipboard.writeText(url);
        console.log('[SaveManager] Share URL copied to clipboard');
      }
    } catch (e) {
      console.error('[SaveManager] Share export failed:', e);
    }
  }

  // ──────────────────────────────────────────────
  // INTERNAL HELPERS
  // ──────────────────────────────────────────────

  private _downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
