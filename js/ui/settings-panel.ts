/**
 * @fileoverview Settings panel for configuring default date preset.
 */

import { store, setConfig } from '../state.js';
import { saveServerConfig } from '../settings-api.js';
import { ALL_PRESETS } from '../date-presets.js';
import type { DatePreset } from '../types.js';

/**
 * Initializes the settings panel: gear toggle, close button, default preset change.
 */
export function initSettingsPanel(): void {
  const gearBtn = document.getElementById('settings-gear-btn');
  const panel = document.getElementById('settings-panel');
  const closeBtn = document.getElementById('settings-close-btn');
  const defaultPresetSelect = document.getElementById('default-preset-select') as HTMLSelectElement | null;

  if (gearBtn && panel) {
    gearBtn.addEventListener('click', () => {
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      gearBtn.setAttribute('aria-expanded', String(!isOpen));
    });
  }

  if (closeBtn && panel && gearBtn) {
    closeBtn.addEventListener('click', () => {
      panel.style.display = 'none';
      gearBtn.setAttribute('aria-expanded', 'false');
    });
  }

  if (defaultPresetSelect) {
    defaultPresetSelect.addEventListener('change', () => {
      const value = defaultPresetSelect.value as DatePreset;
      if (!ALL_PRESETS.includes(value)) return;

      const newConfig = { ...store.config, defaultDatePreset: value };
      setConfig(newConfig);
      saveServerConfig(store.token, store.claims, store.config).catch((err) => {
        console.warn('[settings] Failed to save default preset:', err);
      });
    });
  }
}

/**
 * Syncs the default preset select element to the current store value.
 */
export function updateSettingsUI(): void {
  const defaultPresetSelect = document.getElementById('default-preset-select') as HTMLSelectElement | null;
  if (defaultPresetSelect && store.config.defaultDatePreset) {
    defaultPresetSelect.value = store.config.defaultDatePreset;
  }
}
