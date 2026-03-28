import { LED_KELVIN_MIN, LED_KELVIN_MAX } from '../constants.js';
import { colorPick, cctRange, brightness, activeProfileName } from '../dom.js';
import { kelvinToRgb, rgbToHex, normalizeStoredHex } from '../color-utils.js';
import {
  loadPresetsFromStorage,
  addOrUpdatePreset,
  deletePresetById,
} from '../core/presets.js';
import { setStatus } from '../led-connection.js';

function getEls() {
  return {
    editId: document.getElementById('presetEditId'),
    name: document.getElementById('presetFormName'),
    color: document.getElementById('presetFormColor'),
    kelvin: document.getElementById('presetFormKelvin'),
    kelvinDisplay: document.getElementById('presetFormKelvinDisplay'),
    brightness: document.getElementById('presetFormBrightness'),
    brightDisplay: document.getElementById('presetFormBrightDisplay'),
    list: document.getElementById('presetsManagerList'),
  };
}

function syncColorFromKelvin() {
  const el = getEls();
  if (!el.kelvin || !el.color) return;
  const k = Number(el.kelvin.value);
  if (!Number.isFinite(k)) return;
  const stepped =
    Math.round((Math.min(LED_KELVIN_MAX, Math.max(LED_KELVIN_MIN, k)) - LED_KELVIN_MIN) / 50) *
      50 +
    LED_KELVIN_MIN;
  el.kelvin.value = String(stepped);
  if (el.kelvinDisplay) el.kelvinDisplay.textContent = `${stepped}K`;
  const { r, g, b } = kelvinToRgb(stepped);
  el.color.value = rgbToHex(r, g, b);
}

function fillFormFromPreset(p) {
  const el = getEls();
  if (!p || !el.name) return;
  if (el.editId) el.editId.value = p.id || '';
  el.name.value = p.name || '';
  const col = normalizeStoredHex(p.color) || '#ffffff';
  el.color.value = col;
  const k = Number(p.kelvin) || 5200;
  const stepped =
    Math.round((Math.min(LED_KELVIN_MAX, Math.max(LED_KELVIN_MIN, k)) - LED_KELVIN_MIN) / 50) *
      50 +
    LED_KELVIN_MIN;
  if (el.kelvin) el.kelvin.value = String(stepped);
  if (el.kelvinDisplay) el.kelvinDisplay.textContent = `${stepped}K`;
  const b = Math.min(100, Math.max(0, Number(p.brightness) || 100));
  if (el.brightness) el.brightness.value = String(b);
  if (el.brightDisplay) el.brightDisplay.textContent = `${b}%`;
}

function clearForm() {
  const el = getEls();
  if (el.editId) el.editId.value = '';
  if (el.name) el.name.value = '';
  if (el.kelvin) el.kelvin.value = '5200';
  if (el.kelvinDisplay) el.kelvinDisplay.textContent = '5200K';
  if (el.brightness) el.brightness.value = '100';
  if (el.brightDisplay) el.brightDisplay.textContent = '100%';
  if (el.color) {
    const { r, g, b } = kelvinToRgb(5200);
    el.color.value = rgbToHex(r, g, b);
  }
}

function copyFromControls() {
  const el = getEls();
  if (!colorPick || !cctRange || !brightness) {
    setStatus('Kontrol panelindeki renk/parlaklık bulunamadı.', true);
    return;
  }
  if (el.kelvin) el.kelvin.value = cctRange.value;
  if (el.kelvinDisplay) el.kelvinDisplay.textContent = `${cctRange.value}K`;
  if (el.color) el.color.value = colorPick.value;
  if (el.brightness) el.brightness.value = brightness.value;
  if (el.brightDisplay && brightness) el.brightDisplay.textContent = `${brightness.value}%`;
  setStatus('Kontrol panelindeki değerler forma kopyalandı.');
}

function renderPresetsList() {
  const el = getEls();
  if (!el.list) return;
  const presets = loadPresetsFromStorage();
  if (presets.length === 0) {
    el.list.innerHTML =
      '<p class="text-sm text-on-surface-variant py-4">Henüz ön ayar yok. Soldaki formdan ekleyin veya kontrol panelinden kopyalayın.</p>';
    return;
  }
  el.list.innerHTML = presets
    .map((p) => {
      const name = String(p.name || p.id || 'Profil').replace(/</g, '');
      const k = p.kelvin != null ? `${p.kelvin}K` : '—';
      const b = p.brightness != null ? `%${p.brightness}` : '—';
      const col = normalizeStoredHex(p.color) || '#cccccc';
      return `
      <div class="flex flex-wrap items-center gap-3 p-4 bg-surface-container-low rounded-xl border border-outline-variant/10" data-preset-id="${escapeHtml(p.id)}">
        <span class="w-10 h-10 rounded-lg border border-outline-variant/20 shrink-0" style="background:${col}" aria-hidden="true"></span>
        <div class="flex-1 min-w-[140px]">
          <p class="font-semibold text-on-surface">${name}</p>
          <p class="text-xs text-on-surface-variant">${k} · ${b}</p>
        </div>
        <button type="button" class="btn-preset-edit px-4 py-2 rounded-lg text-sm font-semibold bg-surface-container-high text-on-surface hover:bg-surface-variant min-h-[44px]">Düzenle</button>
        <button type="button" class="btn-preset-delete px-4 py-2 rounded-lg text-sm font-semibold border border-outline-variant/30 text-on-surface hover:bg-surface-variant min-h-[44px]">Sil</button>
      </div>`;
    })
    .join('');

  el.list.querySelectorAll('[data-preset-id]').forEach((row) => {
    const id = row.getAttribute('data-preset-id');
    row.querySelector('.btn-preset-edit')?.addEventListener('click', () => {
      const p = loadPresetsFromStorage().find((x) => x.id === id);
      if (p) fillFormFromPreset(p);
      getEls().name?.focus();
    });
    row.querySelector('.btn-preset-delete')?.addEventListener('click', () => {
      const p = loadPresetsFromStorage().find((x) => x.id === id);
      const label = p?.name || id;
      if (!window.confirm(`«${label}» ön ayarını silmek istediğinize emin misiniz?`)) return;
      deletePresetById(id);
      renderPresetsList();
      const ed = getEls().editId?.value;
      if (ed === id) clearForm();
      setStatus(`Silindi: ${label}`);
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function saveForm() {
  const el = getEls();
  const name = el.name?.value?.trim();
  if (!name) {
    setStatus('Ön ayar adı girin.', true);
    el.name?.focus();
    return;
  }
  try {
    const id = el.editId?.value?.trim() || undefined;
    const entry = addOrUpdatePreset({
      id,
      name,
      color: el.color?.value,
      brightness: el.brightness?.value ?? '100',
      kelvin: el.kelvin?.value ?? '5200',
    });
    renderPresetsList();
    clearForm();
    if (activeProfileName) activeProfileName.textContent = `«${entry.name}»`;
    setStatus(`Kaydedildi: ${entry.name}`);
  } catch (e) {
    setStatus(e.message || String(e), true);
  }
}

export function initPresetsManager() {
  const el = getEls();
  clearForm();

  el.kelvin?.addEventListener('input', () => syncColorFromKelvin());
  el.brightness?.addEventListener('input', () => {
    const b = el.brightness?.value ?? '100';
    if (el.brightDisplay) el.brightDisplay.textContent = `${b}%`;
  });

  document.getElementById('btnPresetCopyFromControls')?.addEventListener('click', () => {
    copyFromControls();
  });
  document.getElementById('btnPresetFormClear')?.addEventListener('click', () => {
    clearForm();
    setStatus('Form temizlendi.');
  });
  document.getElementById('btnPresetFormSave')?.addEventListener('click', () => {
    saveForm();
  });

  renderPresetsList();
  window.addEventListener('led-presets-changed', () => renderPresetsList());
}
