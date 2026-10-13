import { icon } from './icons.js';

// In-battle settings (cocy 10-13): same device choices as the inn panel, no save writes.
export function bindBattleSettings(document, input) {
  const toggle = document.querySelector('[data-battle-settings]');
  const panel = document.querySelector('#battle-settings');
  if (!toggle || !panel) return;
  toggle.innerHTML = icon('settings');
  const render = () => {
    const probe = {};
    document.dispatchEvent(new CustomEvent('arpg:sound', { detail: probe }));
    const row = (label, name, options) => `<span>${label}</span><div class="row">${options.map(([value, text, pressed]) =>
      `<button type="button" id="battle-${name}-${value}" data-battle-${name}="${value}" aria-pressed="${pressed}">${text}</button>`).join('')}</div>`;
    panel.innerHTML = (input ? row('자동 공격', 'auto', [['on', '켜짐', input.autoAttack], ['off', '꺼짐', !input.autoAttack]]) : '')
      + row('사운드', 'sound', [['on', '켜짐', probe.muted === false], ['off', '꺼짐', probe.muted === true]]);
  };
  // Taps on the panel must not leak into combat input (canvas pointer handlers).
  for (const node of [toggle, panel]) node.addEventListener('pointerdown', event => event.stopPropagation());
  const setOpen = open => { panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); if (open) render(); };
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  panel.addEventListener('click', event => {
    const sound = event.target.closest('[data-battle-sound]')?.dataset.battleSound;
    if (sound) document.dispatchEvent(new CustomEvent('arpg:sound', { detail: { set: sound === 'off' } }));
    const auto = event.target.closest('[data-battle-auto]')?.dataset.battleAuto;
    if (auto) input?.setAutoAttack(auto === 'on');
    if (sound || auto) render();
  });
  // T key toggles auto attack while the panel may be open.
  document.addEventListener('arpg:auto-attack', () => { if (!panel.hidden) render(); });
  // Closed again whenever the HUD is shown for a new round.
  new MutationObserver(() => { if (document.querySelector('#hud').hidden) setOpen(false); })
    .observe(document.querySelector('#hud'), { attributes: true, attributeFilter: ['hidden'] });
}
