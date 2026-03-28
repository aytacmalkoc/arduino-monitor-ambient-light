import { state } from '../state.js';
import { loadPresetsFromStorage } from '../core/presets.js';
import { applyLedFromAutomationPatch } from '../led-connection.js';

const DEFAULT_AUTOMATION = {
  enabled: false,
  powerSchedule: {
    enabled: false,
    onTime: '07:00',
    offTime: '23:00',
    days: [0, 1, 2, 3, 4, 5, 6],
  },
  timeProfiles: [],
  appRules: [],
  idle: {
    enabled: false,
    thresholdSec: 300,
    presetId: null,
  },
  extras: {
    batteryPresetEnabled: false,
    batteryPresetId: null,
    lockedPresetEnabled: false,
    lockedPresetId: null,
  },
};

let saveTimer = null;
let model = mergeDefaults(null);

function mergeDefaults(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  return {
    ...DEFAULT_AUTOMATION,
    ...a,
    powerSchedule: {
      ...DEFAULT_AUTOMATION.powerSchedule,
      ...(a.powerSchedule || {}),
    },
    idle: { ...DEFAULT_AUTOMATION.idle, ...(a.idle || {}) },
    extras: { ...DEFAULT_AUTOMATION.extras, ...(a.extras || {}) },
    timeProfiles: Array.isArray(a.timeProfiles) ? a.timeProfiles : [],
    appRules: Array.isArray(a.appRules) ? a.appRules : [],
  };
}

function debouncedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!window.appSettings) return;
    window.appSettings.save({ automation: model }).catch(() => {});
  }, 400);
}

function presetOptionsHtml(selectedId) {
  const presets = loadPresetsFromStorage();
  let html =
    '<option value="">— Ön ayar seçin —</option>';
  for (const p of presets) {
    if (!p || !p.id) continue;
    const sel = p.id === selectedId ? ' selected' : '';
    const label = (p.name || p.id).replace(/</g, '');
    html += `<option value="${escapeAttr(p.id)}"${sel}>${label}</option>`;
  }
  return html;
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function fillPresetsSummary() {
  const el = document.getElementById('automationPresetsList');
  if (!el) return;
  const presets = loadPresetsFromStorage();
  if (!presets.length) {
    el.innerHTML =
      '<p class="text-sm text-on-surface-variant">Henüz ön ayar yok. <a href="#/presets" class="text-primary font-medium underline underline-offset-2">Ön ayarlar</a> sayfasından profil oluşturun.</p>';
    return;
  }
  el.innerHTML = presets
    .map((p) => {
      const name = (p.name || p.id || 'Profil').replace(/</g, '');
      const k = p.kelvin != null ? `${p.kelvin}K` : '—';
      const b = p.brightness != null ? `%${p.brightness}` : '—';
      return `<div class="flex items-center justify-between p-3 bg-surface-container-low rounded-lg border border-outline-variant/10"><span class="text-sm font-semibold">${name}</span><span class="text-xs text-on-surface-variant">${k} · ${b}</span></div>`;
    })
    .join('');
}

function renderTimeProfiles() {
  const host = document.getElementById('timeProfilesList');
  if (!host) return;
  if (model.timeProfiles.length === 0) {
    host.innerHTML =
      '<p class="text-sm text-on-surface-variant">Henüz aralık yok. «Aralık ekle» ile günün saatlerine profil bağlayın.</p>';
    return;
  }
  host.innerHTML = model.timeProfiles
    .map((tp, i) => {
      return `
      <div class="flex flex-wrap items-end gap-3 p-4 bg-surface-container-low rounded-lg border border-outline-variant/10" data-tp-index="${i}">
        <div class="flex flex-col gap-1 min-w-[100px]">
          <label class="text-xs font-medium text-on-surface-variant" for="tpStart_${i}">Başlangıç</label>
          <input type="time" id="tpStart_${i}" class="tp-start bg-surface-container-highest rounded-lg px-3 py-2 text-sm" value="${escapeAttr(tp.start || '09:00')}" />
        </div>
        <div class="flex flex-col gap-1 min-w-[100px]">
          <label class="text-xs font-medium text-on-surface-variant" for="tpEnd_${i}">Bitiş</label>
          <input type="time" id="tpEnd_${i}" class="tp-end bg-surface-container-highest rounded-lg px-3 py-2 text-sm" value="${escapeAttr(tp.end || '17:00')}" />
        </div>
        <div class="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label class="text-xs font-medium text-on-surface-variant">Profil</label>
          <select data-automation-preset-select class="tp-preset w-full bg-surface-container-highest rounded-lg px-3 py-2 text-sm">${presetOptionsHtml(tp.presetId)}</select>
        </div>
        <button type="button" class="btn-remove-tp px-3 py-2 rounded-lg text-sm font-semibold bg-surface-container-high text-on-surface hover:bg-surface-variant min-h-[44px]">Kaldır</button>
      </div>`;
    })
    .join('');
  host.querySelectorAll('[data-tp-index]').forEach((row) => {
    const idx = Number(row.getAttribute('data-tp-index'));
    row.querySelector('.tp-start')?.addEventListener('change', (e) => {
      model.timeProfiles[idx].start = e.target.value;
      debouncedSave();
    });
    row.querySelector('.tp-end')?.addEventListener('change', (e) => {
      model.timeProfiles[idx].end = e.target.value;
      debouncedSave();
    });
    row.querySelector('.tp-preset')?.addEventListener('change', (e) => {
      model.timeProfiles[idx].presetId = e.target.value || null;
      debouncedSave();
    });
    row.querySelector('.btn-remove-tp')?.addEventListener('click', () => {
      model.timeProfiles.splice(idx, 1);
      renderTimeProfiles();
      debouncedSave();
    });
  });
}

function renderAppRules() {
  const host = document.getElementById('appRulesList');
  if (!host) return;
  if (model.appRules.length === 0) {
    host.innerHTML =
      '<p class="text-sm text-on-surface-variant"><strong class="text-on-surface font-medium">Gözat</strong> ile .exe veya başka bir uygulama dosyası seçin; eşleşme alanına dosya adı yazılır. İsterseniz süreç adını elle de girebilirsiniz. Öncelik: yüksek sayı önce uygulanır.</p>';
    return;
  }
  host.innerHTML = model.appRules
    .map((r, i) => {
      const pathHint = r.executablePath
        ? `<p class="ar-path-hint text-[11px] text-on-surface-variant mt-1 truncate max-w-full" title="${escapeAttr(r.executablePath)}">${escapeAttr(r.executablePath)}</p>`
        : '';
      return `
      <div class="flex flex-wrap items-end gap-3 p-4 bg-surface-container-low rounded-lg border border-outline-variant/10" data-ar-index="${i}">
        <div class="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label class="text-xs font-medium text-on-surface-variant" for="arMatch_${i}">Eşleşme</label>
          <div class="flex gap-2 flex-wrap sm:flex-nowrap items-stretch">
            <input type="text" id="arMatch_${i}" class="ar-match flex-1 min-w-[120px] bg-surface-container-highest rounded-lg px-3 py-2 text-sm min-h-[44px]" placeholder="chrome.exe" value="${escapeAttr(r.match || '')}" autocomplete="off" />
            <button type="button" class="btn-pick-app shrink-0 px-4 py-2 rounded-lg font-semibold text-sm bg-surface-container-high text-on-surface hover:bg-surface-variant transition-colors min-h-[44px]">Gözat…</button>
          </div>
          ${pathHint}
        </div>
        <div class="flex flex-col gap-1 w-24">
          <label class="text-xs font-medium text-on-surface-variant" for="arPri_${i}">Öncelik</label>
          <input type="number" id="arPri_${i}" class="ar-pri bg-surface-container-highest rounded-lg px-3 py-2 text-sm" value="${Number(r.priority) || 0}" />
        </div>
        <div class="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label class="text-xs font-medium text-on-surface-variant">Profil</label>
          <select data-automation-preset-select class="ar-preset w-full bg-surface-container-highest rounded-lg px-3 py-2 text-sm">${presetOptionsHtml(r.presetId)}</select>
        </div>
        <label class="flex items-center gap-2 cursor-pointer min-h-[44px]">
          <input type="checkbox" class="ar-en rounded border-outline-variant" ${r.enabled !== false ? 'checked' : ''} />
          <span class="text-sm">Açık</span>
        </label>
        <button type="button" class="btn-remove-ar px-3 py-2 rounded-lg text-sm font-semibold bg-surface-container-high text-on-surface hover:bg-surface-variant min-h-[44px]">Kaldır</button>
      </div>`;
    })
    .join('');
  host.querySelectorAll('[data-ar-index]').forEach((row) => {
    const idx = Number(row.getAttribute('data-ar-index'));
    row.querySelector('.ar-match')?.addEventListener('input', (e) => {
      model.appRules[idx].match = e.target.value;
      model.appRules[idx].executablePath = undefined;
      debouncedSave();
    });
    row.querySelector('.ar-pri')?.addEventListener('change', (e) => {
      model.appRules[idx].priority = Number(e.target.value) || 0;
      debouncedSave();
    });
    row.querySelector('.ar-preset')?.addEventListener('change', (e) => {
      model.appRules[idx].presetId = e.target.value || null;
      debouncedSave();
    });
    row.querySelector('.ar-en')?.addEventListener('change', (e) => {
      model.appRules[idx].enabled = e.target.checked;
      debouncedSave();
    });
    row.querySelector('.btn-remove-ar')?.addEventListener('click', () => {
      model.appRules.splice(idx, 1);
      renderAppRules();
      debouncedSave();
    });
    row.querySelector('.btn-pick-app')?.addEventListener('click', async () => {
      if (!window.automationApi || typeof window.automationApi.pickExecutable !== 'function') {
        return;
      }
      try {
        const res = await window.automationApi.pickExecutable();
        if (!res || !res.ok || !res.basename) return;
        const inp = row.querySelector('.ar-match');
        if (inp) {
          inp.value = res.basename;
        }
        model.appRules[idx].match = res.basename;
        model.appRules[idx].executablePath = res.path || undefined;
        renderAppRules();
        debouncedSave();
      } catch {
        /* kullanıcı iptal */
      }
    });
  });
}

function syncUiFromModel() {
  const chk = document.getElementById('chkAutomationEnabled');
  if (chk) chk.checked = model.enabled;

  const ps = model.powerSchedule;
  const pe = document.getElementById('chkPowerScheduleEnabled');
  if (pe) pe.checked = !!ps.enabled;
  const pot = document.getElementById('powerOnTime');
  const pof = document.getElementById('powerOffTime');
  if (pot) pot.value = ps.onTime || '07:00';
  if (pof) pof.value = ps.offTime || '23:00';

  document.querySelectorAll('[data-power-day]').forEach((el) => {
    const d = Number(el.getAttribute('data-power-day'));
    el.checked = (ps.days || []).includes(d);
  });

  const idle = model.idle;
  const ie = document.getElementById('chkIdleEnabled');
  if (ie) ie.checked = !!idle.enabled;
  const it = document.getElementById('idleThresholdSec');
  if (it) it.value = String(idle.thresholdSec ?? 300);
  const ip = document.getElementById('idlePresetSelect');
  if (ip) {
    ip.innerHTML = presetOptionsHtml(idle.presetId);
    if (idle.presetId) ip.value = idle.presetId;
  }

  const ex = model.extras || {};
  const be = document.getElementById('chkBatteryPreset');
  if (be) be.checked = !!ex.batteryPresetEnabled;
  const bp = document.getElementById('batteryPresetSelect');
  if (bp) {
    bp.innerHTML = presetOptionsHtml(ex.batteryPresetId);
    if (ex.batteryPresetId) bp.value = ex.batteryPresetId;
  }
  const le = document.getElementById('chkLockedPreset');
  if (le) le.checked = !!ex.lockedPresetEnabled;
  const lp = document.getElementById('lockedPresetSelect');
  if (lp) {
    lp.innerHTML = presetOptionsHtml(ex.lockedPresetId);
    if (ex.lockedPresetId) lp.value = ex.lockedPresetId;
  }

  renderTimeProfiles();
  renderAppRules();
  fillPresetsSummary();
}

function sourceLabel(src) {
  const map = {
    powerSchedule: 'Güç zamanlaması (kapalı saat)',
    appRule: 'Uygulama kuralı',
    timeProfile: 'Saatlik profil',
    idle: 'Hareketsizlik',
    battery: 'Pil',
    locked: 'Oturum kilitli',
  };
  return map[src] || src || '—';
}

function describeAutomationStatus(payload) {
  if (!payload) return '';
  if (payload.manualBypass) {
    return 'Manuel kaydırma: 5 dk boyunca otomasyon devre dışı; Gece Işığı eşlemesi kullanılabilir.';
  }
  if (!payload.active) {
    return 'Otomasyon aktif kural uygulamıyor; Gece Işığı eşlemesi (açıksa) devreye girebilir.';
  }
  if (payload.pendingSerial) {
    return `Kural: ${sourceLabel(payload.source)} — seri bağlantısı yok, LED uygulanamadı.`;
  }
  if (payload.writeError) {
    return `Kural: ${sourceLabel(payload.source)} — seri yazımı başarısız.`;
  }
  return `Uygulanıyor: ${sourceLabel(payload.source)} — Windows Gece Işığı eşlemesi bu sırada bekletilir.`;
}

export function initAutomationPanel() {
  const statusEl = document.getElementById('automationStatusText');
  const chk = document.getElementById('chkAutomationEnabled');

  if (window.automationApi && typeof window.automationApi.onState === 'function') {
    window.automationApi.onState((payload) => {
      const on = !!payload.active && !payload.manualBypass;
      state.automationActive = on;
      if (
        payload.active &&
        payload.led &&
        !payload.manualBypass &&
        !payload.pendingSerial &&
        !payload.writeError
      ) {
        applyLedFromAutomationPatch(payload.led);
      }
      if (statusEl) statusEl.textContent = describeAutomationStatus(payload);
    });
  }

  if (window.appSettings) {
    window.appSettings
      .load()
      .then((disk) => {
        model = mergeDefaults(disk.automation);
        syncUiFromModel();
      })
      .catch(() => {
        model = mergeDefaults(null);
        syncUiFromModel();
      });
  } else {
    syncUiFromModel();
  }

  chk?.addEventListener('change', () => {
    model.enabled = chk.checked;
    debouncedSave();
  });

  document.getElementById('chkPowerScheduleEnabled')?.addEventListener('change', (e) => {
    model.powerSchedule.enabled = e.target.checked;
    debouncedSave();
  });
  document.getElementById('powerOnTime')?.addEventListener('change', (e) => {
    model.powerSchedule.onTime = e.target.value;
    debouncedSave();
  });
  document.getElementById('powerOffTime')?.addEventListener('change', (e) => {
    model.powerSchedule.offTime = e.target.value;
    debouncedSave();
  });
  document.querySelectorAll('[data-power-day]').forEach((el) => {
    el.addEventListener('change', () => {
      const days = [];
      document.querySelectorAll('[data-power-day]').forEach((box) => {
        if (box.checked) days.push(Number(box.getAttribute('data-power-day')));
      });
      model.powerSchedule.days = days.sort((a, b) => a - b);
      debouncedSave();
    });
  });

  document.getElementById('chkIdleEnabled')?.addEventListener('change', (e) => {
    model.idle.enabled = e.target.checked;
    debouncedSave();
  });
  document.getElementById('idleThresholdSec')?.addEventListener('change', (e) => {
    model.idle.thresholdSec = Math.max(30, Number(e.target.value) || 300);
    debouncedSave();
  });
  document.getElementById('idlePresetSelect')?.addEventListener('change', (e) => {
    model.idle.presetId = e.target.value || null;
    debouncedSave();
  });

  document.getElementById('chkBatteryPreset')?.addEventListener('change', (e) => {
    model.extras.batteryPresetEnabled = e.target.checked;
    debouncedSave();
  });
  document.getElementById('batteryPresetSelect')?.addEventListener('change', (e) => {
    model.extras.batteryPresetId = e.target.value || null;
    debouncedSave();
  });
  document.getElementById('chkLockedPreset')?.addEventListener('change', (e) => {
    model.extras.lockedPresetEnabled = e.target.checked;
    debouncedSave();
  });
  document.getElementById('lockedPresetSelect')?.addEventListener('change', (e) => {
    model.extras.lockedPresetId = e.target.value || null;
    debouncedSave();
  });

  document.getElementById('btnAddTimeProfile')?.addEventListener('click', () => {
    model.timeProfiles.push({
      id: `tp_${Date.now()}`,
      start: '09:00',
      end: '17:00',
      presetId: null,
    });
    renderTimeProfiles();
    debouncedSave();
  });

  document.getElementById('btnAddAppRule')?.addEventListener('click', () => {
    model.appRules.push({
      id: `ar_${Date.now()}`,
      match: '',
      presetId: null,
      priority: 10,
      enabled: true,
    });
    renderAppRules();
    debouncedSave();
  });

  document.getElementById('btnRefreshAutomationPresets')?.addEventListener('click', () => {
    syncUiFromModel();
  });

  window.addEventListener('led-presets-changed', () => {
    syncUiFromModel();
  });
}
