// ui.ts — owns the HTML/CSS chrome overlaid on the scene: the peel hint (fades
// after the first successful peel) and the restack/reset button.

export interface Chrome {
  hideHint: () => void;
  onReset: (cb: () => void) => void;
  onReveal: (cb: () => void) => void;
  /** Fires with the new muted state whenever the sound toggle is clicked. */
  onMuteToggle: (cb: (muted: boolean) => void) => void;
}

export function createChrome(): Chrome {
  const style = document.createElement('style');
  style.textContent = `
    .peel-hint {
      position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%);
      z-index: 10; padding: 10px 18px; border-radius: 999px;
      background: rgba(255,255,255,0.92); color: #33363b;
      font: 600 14px/1 'Gilroy', 'Poppins', -apple-system, "Segoe UI", sans-serif;
      letter-spacing: 0.2px; pointer-events: none; user-select: none;
      box-shadow: 0 6px 20px rgba(30,38,48,0.28);
      transition: opacity 0.6s ease, transform 0.6s ease;
    }
    .peel-hint.hidden { opacity: 0; transform: translateX(-50%) translateY(10px); }
    .peel-hint .arrow { opacity: 0.85; margin-right: 6px; }

    .btn-row {
      position: fixed; top: 22px; right: 22px; z-index: 11;
      display: flex; gap: 8px; align-items: center;
    }
    .chrome-btn {
      padding: 9px 18px; border: none; border-radius: 999px; cursor: pointer;
      font: 700 13px 'Gilroy', 'Poppins', -apple-system, "Segoe UI", sans-serif;
      letter-spacing: 0.2px; box-shadow: 0 2px 8px rgba(40,50,62,0.1);
      transition: background 0.2s ease, transform 0.1s ease;
    }
    .chrome-btn:active { transform: translateY(1px); }
    .reset-btn { background: #e7e8ea; color: #33363b; }
    .reset-btn:hover { background: #dcdde0; }
    .mute-btn {
      background: #e7e8ea; color: #33363b;
      padding: 9px 12px; min-width: 40px;
    }
    .mute-btn:hover { background: #dcdde0; }
    .mute-btn.is-muted { color: #9a9da2; }
    .reveal-btn { background: #ff5733; color: #ffffff; }
    .reveal-btn:hover { background: #f2481f; }
    .reveal-btn:disabled { opacity: 0.5; cursor: default; }
  `;
  document.head.appendChild(style);

  const hint = document.createElement('div');
  hint.className = 'peel-hint';
  hint.innerHTML = `<span class="arrow">↗</span>Drag the top-right corner to peel`;
  document.body.appendChild(hint);

  const row = document.createElement('div');
  row.className = 'btn-row';

  const reveal = document.createElement('button');
  reveal.className = 'chrome-btn reveal-btn';
  reveal.type = 'button';
  reveal.textContent = '✦ Reveal sculpture';
  row.appendChild(reveal);

  const reset = document.createElement('button');
  reset.className = 'chrome-btn reset-btn';
  reset.type = 'button';
  reset.textContent = '↺ Restack';
  row.appendChild(reset);

  const mute = document.createElement('button');
  mute.className = 'chrome-btn mute-btn';
  mute.type = 'button';
  mute.textContent = '🔊';
  mute.setAttribute('aria-label', 'Mute sound');
  mute.title = 'Mute sound';
  row.appendChild(mute);

  document.body.appendChild(row);

  let muted = false;

  return {
    hideHint: () => hint.classList.add('hidden'),
    onReset: (cb) => reset.addEventListener('click', cb),
    onReveal: (cb) => reveal.addEventListener('click', cb),
    onMuteToggle: (cb) =>
      mute.addEventListener('click', () => {
        muted = !muted;
        mute.textContent = muted ? '🔇' : '🔊';
        mute.classList.toggle('is-muted', muted);
        const label = muted ? 'Unmute sound' : 'Mute sound';
        mute.setAttribute('aria-label', label);
        mute.title = label;
        cb(muted);
      }),
  };
}
