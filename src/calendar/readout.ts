// readout.ts — the HTML/CSS date readout overlay (weekday, serif day number,
// month + year). Minimal editorial styling to match the printed sheet.

export interface Readout {
  update: (date: Date, pagesLeft: number) => void;
  el: HTMLElement;
}

const WD = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MO = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function createReadout(): Readout {
  const el = document.createElement('div');
  el.className = 'readout';
  el.innerHTML = `
    <div class="ro-weekday"></div>
    <div class="ro-day"></div>
    <div class="ro-month"></div>
  `;
  const style = document.createElement('style');
  style.textContent = `
    .readout {
      position: fixed; top: 20px; left: 20px; z-index: 10;
      padding: 12px 18px 14px; border-radius: 16px;
      background: rgba(238,239,241,0.9);
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
      color: #141518; pointer-events: none; user-select: none; min-width: 120px;
    }
    .ro-weekday { font-family: 'Gilroy','Poppins',-apple-system,"Helvetica Neue",Arial,sans-serif;
      font-size: 11px; font-weight: 700; letter-spacing: 2px; opacity: 0.75; }
    .ro-day { font-family: 'Eugusto','Playfair Display','Didot',Georgia,serif;
      font-size: 46px; font-weight: 500; line-height: 1.0; margin: 0; }
    .ro-month { font-family: 'Gilroy','Poppins',-apple-system,"Helvetica Neue",Arial,sans-serif;
      font-size: 13px; font-weight: 700; margin-top: 4px; }
  `;
  document.head.appendChild(style);
  document.body.appendChild(el);

  const wd = el.querySelector('.ro-weekday') as HTMLElement;
  const day = el.querySelector('.ro-day') as HTMLElement;
  const month = el.querySelector('.ro-month') as HTMLElement;

  function update(date: Date, _pagesLeft: number): void {
    void _pagesLeft;
    wd.textContent = WD[date.getDay()];
    day.textContent = String(date.getDate());
    month.textContent = `${MO[date.getMonth()]} ${date.getFullYear()}`;
  }

  return { update, el };
}
