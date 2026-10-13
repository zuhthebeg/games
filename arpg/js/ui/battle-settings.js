import { icon } from './icons.js';
import { fxPreference, setFxPreference } from '../prefs.js';

// In-battle settings (cocy 10-13): same device choices as the inn panel, no save writes.
export function bindBattleSettings(document) {
  const toggle = document.querySelector('[data-battle-settings]');
  const panel = document.querySelector('#battle-settings');
  if (!toggle || !panel) return;
  toggle.innerHTML = icon('settings');
  const render = () => {
    const probe = {};
    document.dispatchEvent(new CustomEvent('arpg:sound', { detail: probe }));
    const fx = fxPreference();
    const row = (label, name, options) => `<span>${label}</span><div class="row">${options.map(([value, text, pressed]) =>
      `<button type="button" id="battle-${name}-${value}" data-battle-${name}="${value}" aria-pressed="${pressed}">${text}</button>`).join('')}</div>`;
    panel.innerHTML = row('사운드', 'sound', [['on', '켜짐', probe.muted === false], ['off', '꺼짐', probe.muted === true]])
      + row('스킬 이펙트', 'fx', [['new', '신규', fx === 'new'], ['classic', '클래식', fx === 'classic']]);
  };
  const setOpen = open => { panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); if (open) render(); };
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  panel.addEventListener('click', event => {
    const sound = event.target.closest('[data-battle-sound]')?.dataset.battleSound;
    const fx = event.target.closest('[data-battle-fx]')?.dataset.battleFx;
    if (sound) document.dispatchEvent(new CustomEvent('arpg:sound', { detail: { set: sound === 'off' } }));
    if (fx) { setFxPreference(fx); document.dispatchEvent(new CustomEvent('arpg:fx-mode', { detail: { mode: fx } })); }
    if (sound || fx) render();
  });
  // Closed again whenever the HUD is shown for a new round.
  new MutationObserver(() => { if (document.querySelector('#hud').hidden) setOpen(false); })
    .observe(document.querySelector('#hud'), { attributes: true, attributeFilter: ['hidden'] });
}
