/**
 * @fileoverview Settings panel for managing custom compliance rules.
 */

import { store, setConfig } from '../state.js';
import { saveServerConfig } from '../settings-api.js';
import type { CustomRule } from '../types.js';

/**
 * Initializes the settings panel: gear toggle, close button, custom rules editor.
 */
export function initSettingsPanel(): void {
  const gearBtn = document.getElementById('settings-gear-btn');
  const panel = document.getElementById('settings-panel');
  const closeBtn = document.getElementById('settings-close-btn');

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

  const addRuleBtn = document.getElementById('add-rule-btn');
  addRuleBtn?.addEventListener('click', () => {
    const rules = [...(store.config.customRules ?? [])];
    rules.push({ minWorkMinutes: 360, requiredBreakMinutes: 30 });
    updateConfigRules(rules);
    renderRulesList();
  });
}

function renderRulesList(): void {
  const container = document.getElementById('custom-rules-list');
  if (!container) return;

  const rules = store.config.customRules ?? [];

  if (rules.length === 0) {
    container.innerHTML = '<p class="custom-rules-empty">No custom rules defined. Click "+ Add Rule" to create one.</p>';
    return;
  }

  let html = '';
  for (let index = 0; index < rules.length; index++) {
    const rule = rules[index];
    html += `<div class="custom-rule-row" data-rule-index="${index}">`;
    html += `<div class="rule-field"><label>Work &gt; (min)</label>`;
    html += `<input type="number" class="rule-min-work" value="${rule.minWorkMinutes}" min="0" max="1440" step="1"></div>`;
    html += `<div class="rule-field"><label>Break req (min)</label>`;
    html += `<input type="number" class="rule-req-break" value="${rule.requiredBreakMinutes}" min="0" max="480" step="1"></div>`;
    html += `<button class="btn-remove-rule" data-remove-index="${index}" title="Remove rule">&times;</button>`;
    html += `</div>`;
  }

  container.innerHTML = html;

  container.querySelectorAll('.btn-remove-rule').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt((e.currentTarget as HTMLElement).dataset.removeIndex ?? '0', 10);
      const updated = [...(store.config.customRules ?? [])];
      updated.splice(idx, 1);
      updateConfigRules(updated);
      renderRulesList();
    });
  });

  container.querySelectorAll('.custom-rule-row').forEach((row) => {
    const idx = parseInt((row as HTMLElement).dataset.ruleIndex ?? '0', 10);
    const minWorkInput = row.querySelector('.rule-min-work') as HTMLInputElement;
    const reqBreakInput = row.querySelector('.rule-req-break') as HTMLInputElement;

    const onInputChange = (): void => {
      const updated = [...(store.config.customRules ?? [])];
      const minWork = parseInt(minWorkInput.value, 10);
      const reqBreak = parseInt(reqBreakInput.value, 10);
      if (isNaN(minWork) || isNaN(reqBreak) || minWork < 0 || reqBreak < 0) return;
      updated[idx] = { minWorkMinutes: minWork, requiredBreakMinutes: reqBreak };
      updateConfigRules(updated);
    };

    minWorkInput?.addEventListener('change', onInputChange);
    reqBreakInput?.addEventListener('change', onInputChange);
  });
}

function updateConfigRules(rules: CustomRule[]): void {
  const newConfig = { ...store.config, customRules: rules };
  setConfig(newConfig);
  saveServerConfig(store.token, store.claims, store.config).catch((err) => {
    console.warn('[settings] Failed to save custom rules:', err);
  });
}

/**
 * Syncs the settings panel UI to the current store state.
 */
export function updateSettingsUI(): void {
  renderRulesList();
}
