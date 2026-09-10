/**
 * Hospital MS — Pro Max charts.
 *
 * Hand-rolled inline SVG rather than a charting library, for three reasons that
 * matter here: no external runtime to block first paint, marks that read the CSS
 * theme variables directly (so light/dark and contrast come for free), and full
 * control over the accessibility contract.
 *
 * Every chart ships with:
 *   - role="img" + an aria-label that states the takeaway, not just the axis names
 *   - a real <table> alternative behind a "View data" disclosure (WCAG 1.1.1)
 *   - tooltips reachable by pointer AND keyboard (each mark is focusable)
 *   - an interactive legend that toggles series
 *   - subtle gridlines, direct labelling for small series, tabular numerals
 *   - marks distinguished by shape/pattern as well as colour
 */
window.Charts = (function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (() => { let n = 0; return (p = 'c') => `${p}${++n}`; })();
  const TOKEN = {
    primary: 'rgb(var(--primary))', accent: 'rgb(var(--accent))', success: 'rgb(var(--success))',
    warning: 'rgb(var(--warning))', danger: 'rgb(var(--danger))', info: 'rgb(var(--info))',
    grid: 'rgb(var(--outline))', axis: 'rgb(var(--fg-subtle))', muted: 'rgb(var(--fg-muted))',
    surface: 'rgb(var(--s0))', neutral: 'rgb(var(--outline-strong))',
  };
  const color = (t) => TOKEN[t] || t;

  /** Disclosure holding the table alternative. Collapsed, but always in the DOM. */
  function dataTable({ caption, head, rows }) {
    const id = uid('dt');
    return `<details class="mt-2 group">
      <summary class="inline-flex items-center gap-1.5 text-xs font-medium text-muted cursor-pointer hover:text-foreground min-h-8 select-none">
        <i data-lucide="table-2" class="w-3.5 h-3.5" aria-hidden="true"></i>
        <span>View data</span>
        <i data-lucide="chevron-down" class="w-3.5 h-3.5 transition group-open:rotate-180" aria-hidden="true"></i>
      </summary>
      <div class="mt-2 overflow-x-auto rounded-lg border border-outline">
        <table class="dt" id="${id}">
          <caption class="sr-only">${esc(caption)}</caption>
          <thead><tr>${head.map((h, i) => `<th scope="col" class="${i ? 'text-right' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<${i ? 'td' : 'th'} ${i ? 'class="text-right num"' : 'scope="row" class="font-medium"'}>${esc(c)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div></details>`;
  }

  function legend(series, chartId) {
    return `<ul class="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2" aria-label="Legend — activate an item to hide that series">
      ${series.map((s, i) => `<li><button type="button" data-legend="${i}" data-chart="${chartId}" aria-pressed="true"
        class="inline-flex items-center gap-1.5 text-xs font-medium min-h-8 px-1 -mx-1 rounded press hover:bg-surface-2 aria-[pressed=false]:opacity-45 aria-[pressed=false]:line-through">
        <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:${color(s.tone)};${s.dash ? 'border:1.5px dashed rgb(var(--s0));' : ''}"></span>
        <span>${esc(s.label)}</span></button></li>`).join('')}
    </ul>`;
  }

  /* ───────────────────────── Sparkline (KPI tiles) ─────────────────────────
     Decorative-adjacent, so it is aria-hidden and the tile always states the
     number and the delta in text. */
  function sparkline(values, { tone = 'primary', h = 34, w = 132 } = {}) {
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 4 - ((v - min) / span) * (h - 10)]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area = `${line} L${w},${h} L0,${h} Z`;
    const last = pts[pts.length - 1];
    const gid = uid('sg');
    return `<svg viewBox="0 0 ${w} ${h}" class="w-full h-[34px]" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color(tone)}" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="${color(tone)}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#${gid})"/>
      <path d="${line}" fill="none" stroke="${color(tone)}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.4" fill="${color(tone)}"/>
    </svg>`;
  }

  /* ───────────────────────── Multi-series line chart ─────────────────────────
     Used for vitals trends. Each point is a focusable <circle> with its own
     aria-label, so the whole series is readable with a screen reader and
     tooltips work from the keyboard. */
  function line({ labels, series, height = 200, yUnit = '', summary, caption, refBands = [] }) {
    const id = uid('ln');
    const W = 640, H = height, padL = 40, padR = 12, padT = 12, padB = 26;
    const all = series.flatMap((s) => s.values);
    const rawMin = Math.min(...all), rawMax = Math.max(...all);
    const pad = (rawMax - rawMin) * 0.18 || 4;
    const min = Math.floor((rawMin - pad) / 10) * 10, max = Math.ceil((rawMax + pad) / 10) * 10;
    const x = (i) => padL + (i / (labels.length - 1)) * (W - padL - padR);
    const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
    const ticks = 4;

    const bands = refBands.map((b) => `<rect x="${padL}" y="${y(b.to).toFixed(1)}" width="${W - padL - padR}" height="${(y(b.from) - y(b.to)).toFixed(1)}"
        fill="${color(b.tone)}" opacity="0.09"/>
      <text x="${W - padR - 4}" y="${(y(b.to) + 11).toFixed(1)}" text-anchor="end" font-size="9" fill="${TOKEN.muted}">${esc(b.label)}</text>`).join('');

    const grid = Array.from({ length: ticks + 1 }, (_, i) => {
      const v = min + ((max - min) / ticks) * i;
      return `<line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - padR}" y2="${y(v).toFixed(1)}" stroke="${TOKEN.grid}" stroke-width="1" opacity="0.5"/>
        <text x="${padL - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="${TOKEN.axis}" font-family="Fira Code, monospace">${Math.round(v)}</text>`;
    }).join('');

    // Auto-skip x labels so ticks never crowd on a narrow screen.
    const step = Math.ceil(labels.length / 8);
    const xAxis = labels.map((l, i) => (i % step === 0 || i === labels.length - 1)
      ? `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="${TOKEN.axis}" font-family="Fira Code, monospace">${esc(l)}</text>` : '').join('');

    const paths = series.map((s, si) => {
      const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const marks = s.values.map((v, i) => `<circle data-series="${si}" data-i="${i}" tabindex="0" role="img"
          aria-label="${esc(s.label)} on ${esc(labels[i])}: ${v}${esc(yUnit)}"
          cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="9" fill="transparent" class="cursor-pointer outline-none"/>
        <circle data-dot="${si}-${i}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${si === 0 ? 3 : 2.6}"
          fill="${si === 0 ? color(s.tone) : 'rgb(var(--s0))'}" stroke="${color(s.tone)}" stroke-width="1.75" pointer-events="none"/>`).join('');
      return `<g data-line="${si}">
        <path d="${d}" fill="none" stroke="${color(s.tone)}" stroke-width="2" ${s.dash ? 'stroke-dasharray="5 3"' : ''} stroke-linejoin="round" stroke-linecap="round"/>
        ${marks}</g>`;
    }).join('');

    return `<figure class="m-0" data-chart-root="${id}">
      <div class="relative">
        <svg viewBox="0 0 ${W} ${H}" class="w-full" style="height:${H}px" role="img"
             aria-label="${esc(summary)}" data-chart="${id}">
          ${bands}${grid}${xAxis}${paths}
          <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="${TOKEN.grid}" stroke-width="1"/>
        </svg>
        <div data-tip hidden class="pointer-events-none absolute z-10 rounded-lg border border-outline bg-surface-0 shadow-overlay px-2.5 py-1.5 text-xs whitespace-nowrap"></div>
      </div>
      ${legend(series, id)}
      ${dataTable({
        caption: caption || summary,
        head: ['Time', ...series.map((s) => `${s.label}${yUnit ? ' (' + yUnit + ')' : ''}`)],
        rows: labels.map((l, i) => [l, ...series.map((s) => s.values[i])]),
      })}
    </figure>`;
  }

  /* ───────────────────────── Grouped / stacked bars ───────────────────────── */
  function bars({ labels, series, height = 200, yUnit = '', summary, caption, stacked = false, valueLabel = (v) => v }) {
    const id = uid('br');
    const W = 640, H = height, padL = 44, padR = 12, padT = 14, padB = 26;
    const maxVal = stacked
      ? Math.max(...labels.map((_, i) => series.reduce((a, s) => a + s.values[i], 0)))
      : Math.max(...series.flatMap((s) => s.values));
    const max = Math.ceil(maxVal / 40) * 40 || 10;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const slot = plotW / labels.length;
    const bw = stacked ? Math.min(slot * 0.5, 26) : Math.min((slot * 0.62) / series.length, 15);
    const y = (v) => padT + (1 - v / max) * plotH;

    const grid = Array.from({ length: 5 }, (_, i) => {
      const v = (max / 4) * i;
      return `<line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - padR}" y2="${y(v).toFixed(1)}" stroke="${TOKEN.grid}" stroke-width="1" opacity="0.5"/>
        <text x="${padL - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="${TOKEN.axis}" font-family="Fira Code, monospace">${Math.round(v)}</text>`;
    }).join('');

    const groups = labels.map((l, i) => {
      let acc = 0;
      const rects = series.map((s, si) => {
        const v = s.values[i];
        const bh = Math.max((v / max) * plotH, v > 0 ? 1.5 : 0);
        const bx = stacked
          ? padL + slot * i + (slot - bw) / 2
          : padL + slot * i + (slot - bw * series.length - 2 * (series.length - 1)) / 2 + si * (bw + 2);
        const by = stacked ? y(acc + v) : y(v);
        acc += v;
        return `<g data-series="${si}" data-i="${i}">
          <rect tabindex="0" role="img" aria-label="${esc(s.label)} in ${esc(l)}: ${valueLabel(v)}${esc(yUnit)}"
            data-bar="${si}-${i}" x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}"
            rx="2.5" fill="${color(s.tone)}" ${s.pattern ? `fill-opacity="0.75" stroke="${color(s.tone)}" stroke-width="1"` : ''}
            class="cursor-pointer transition-[fill-opacity] hover:fill-opacity-80 outline-none"/>
        </g>`;
      }).join('');
      return `${rects}<text x="${(padL + slot * i + slot / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="${TOKEN.axis}" font-family="Fira Code, monospace">${esc(l)}</text>`;
    }).join('');

    return `<figure class="m-0" data-chart-root="${id}">
      <div class="relative">
        <svg viewBox="0 0 ${W} ${H}" class="w-full" style="height:${H}px" role="img" aria-label="${esc(summary)}" data-chart="${id}">
          ${grid}${groups}
          <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="${TOKEN.grid}" stroke-width="1"/>
        </svg>
        <div data-tip hidden class="pointer-events-none absolute z-10 rounded-lg border border-outline bg-surface-0 shadow-overlay px-2.5 py-1.5 text-xs whitespace-nowrap"></div>
      </div>
      ${legend(series, id)}
      ${dataTable({
        caption: caption || summary,
        head: ['Bucket', ...series.map((s) => `${s.label}${yUnit ? ' (' + yUnit + ')' : ''}`)],
        rows: labels.map((l, i) => [l, ...series.map((s) => s.values[i])]),
      })}
    </figure>`;
  }

  /* ───────────────────── Horizontal bars (ranked comparison) ─────────────────────
     Preferred over a pie whenever there are more than about five categories, and
     over vertical bars when the category names are words rather than dates. */
  function hbars({ rows, summary, caption, unit = '', valueLabel = (v) => v }) {
    const max = Math.max(...rows.map((r) => r.value)) || 1;
    return `<figure class="m-0">
      <ul class="space-y-2.5" role="img" aria-label="${esc(summary)}">
        ${rows.map((r) => `<li class="grid grid-cols-[minmax(84px,auto)_1fr_auto] items-center gap-2.5">
          <span class="text-xs font-medium truncate">${esc(r.label)}</span>
          <span class="h-4 rounded-md bg-surface-2 overflow-hidden">
            <span class="block h-full rounded-md" style="width:${Math.max((r.value / max) * 100, 2)}%;background:${color(r.tone || 'primary')}"></span>
          </span>
          <span class="num text-xs text-muted tabular-nums">${valueLabel(r.value)}${esc(unit)}</span>
        </li>`).join('')}
      </ul>
      ${dataTable({ caption: caption || summary, head: ['Category', `Value${unit ? ' (' + unit + ')' : ''}`], rows: rows.map((r) => [r.label, valueLabel(r.value)]) })}
    </figure>`;
  }

  /* ───────────────────────────── Donut ─────────────────────────────
     Capped at five slices by design; the centre carries the total so the reader
     never has to add the legend up. */
  function donut({ slices, total, centerLabel, summary, caption, unit = '' }) {
    const id = uid('dn');
    const sum = total ?? slices.reduce((a, s) => a + s.value, 0);
    const R = 54, r = 34, C = 60;
    let angle = -Math.PI / 2;
    const arcs = slices.map((s, i) => {
      const frac = sum ? s.value / sum : 0;
      const a0 = angle, a1 = angle + frac * Math.PI * 2;
      angle = a1;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, a) => `${(C + rad * Math.cos(a)).toFixed(2)},${(C + rad * Math.sin(a)).toFixed(2)}`;
      if (frac === 0) return '';
      const d = `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${large} 0 ${p(r, a0)} Z`;
      return `<path data-slice="${i}" tabindex="0" role="img" aria-label="${esc(s.label)}: ${s.value}${esc(unit)}, ${Math.round(frac * 100)} percent"
        d="${d}" fill="${color(s.tone)}" stroke="rgb(var(--s0))" stroke-width="1.5" class="cursor-pointer outline-none transition-transform origin-center hover:opacity-85"/>`;
    }).join('');
    return `<figure class="m-0 flex flex-wrap items-center gap-4" data-chart-root="${id}">
      <div class="relative shrink-0">
        <svg viewBox="0 0 120 120" class="w-[124px] h-[124px]" role="img" aria-label="${esc(summary)}" data-chart="${id}">
          ${arcs}
          <text x="60" y="57" text-anchor="middle" font-size="20" font-weight="700" fill="rgb(var(--fg))" font-family="Fira Code, monospace">${esc(centerLabel ?? sum)}</text>
          <text x="60" y="72" text-anchor="middle" font-size="8.5" fill="${TOKEN.muted}">${esc(unit || 'total')}</text>
        </svg>
        <div data-tip hidden class="pointer-events-none absolute z-10 rounded-lg border border-outline bg-surface-0 shadow-overlay px-2.5 py-1.5 text-xs whitespace-nowrap"></div>
      </div>
      <div class="flex-1 min-w-[150px]">
        <ul class="space-y-1.5">
          ${slices.map((s) => `<li class="flex items-center gap-2 text-xs">
            <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:${color(s.tone)}"></span>
            <span class="flex-1 truncate">${esc(s.label)}</span>
            <span class="num text-muted">${s.value}${esc(unit)}</span>
            <span class="num text-subtle w-9 text-right">${sum ? Math.round((s.value / sum) * 100) : 0}%</span>
          </li>`).join('')}
        </ul>
        ${dataTable({ caption: caption || summary, head: ['Slice', 'Value', 'Share'], rows: slices.map((s) => [s.label, s.value, (sum ? Math.round((s.value / sum) * 100) : 0) + '%']) })}
      </div>
    </figure>`;
  }

  /* ───────────────────── Day heat strip (schedule load) ───────────────────── */
  function heatStrip({ cells, summary, legendLabels = ['quiet', 'busy'] }) {
    const max = Math.max(...cells.map((c) => c.value)) || 1;
    return `<figure class="m-0">
      <div class="flex gap-1 overflow-x-auto pb-1" role="img" aria-label="${esc(summary)}">
        ${cells.map((c) => {
          const t = c.value / max;
          return `<div tabindex="0" title="${esc(c.label)}: ${c.value} appointments"
            aria-label="${esc(c.label)}: ${c.value} appointments"
            class="shrink-0 w-8 rounded-md grid place-items-end pb-1 cursor-default outline-none focus-visible:ring-2"
            style="height:44px;background:color-mix(in srgb, ${TOKEN.primary} ${Math.round(12 + t * 78)}%, rgb(var(--s2)))">
            <span class="text-2xs font-semibold num" style="color:${t > 0.55 ? 'rgb(var(--primary-fg))' : 'rgb(var(--fg-muted))'}">${c.short}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="flex items-center gap-2 mt-2 text-2xs text-subtle">
        <span>${esc(legendLabels[0])}</span>
        <span class="flex-1 h-1.5 rounded-full" style="background:linear-gradient(90deg, color-mix(in srgb, ${TOKEN.primary} 12%, rgb(var(--s2))), ${TOKEN.primary})"></span>
        <span>${esc(legendLabels[1])}</span>
      </div>
      ${dataTable({ caption: summary, head: ['Slot', 'Appointments'], rows: cells.map((c) => [c.label, c.value]) })}
    </figure>`;
  }

  /* ───────────────────────── Interaction wiring ─────────────────────────
     Tooltips follow the pointer and also appear on focus, so keyboard users get
     the same exact values. Legend buttons toggle series without reflowing layout. */
  function wire(root = document) {
    root.querySelectorAll('[data-chart-root]').forEach((fig) => {
      if (fig.dataset.wired) return;
      fig.dataset.wired = '1';
      const tip = fig.querySelector('[data-tip]');
      const svg = fig.querySelector('svg[data-chart]');
      if (!svg || !tip) return;

      const show = (target, text) => {
        tip.textContent = text;
        tip.hidden = false;
        const box = svg.getBoundingClientRect();
        const t = target.getBoundingClientRect();
        const left = t.left - box.left + t.width / 2;
        tip.style.left = `${Math.max(4, Math.min(left - tip.offsetWidth / 2, box.width - tip.offsetWidth - 4))}px`;
        tip.style.top = `${Math.max(0, t.top - box.top - tip.offsetHeight - 8)}px`;
      };
      const hide = () => { tip.hidden = true; };

      svg.querySelectorAll('[aria-label]').forEach((mark) => {
        if (mark === svg) return;
        const label = mark.getAttribute('aria-label');
        mark.addEventListener('mouseenter', () => show(mark, label));
        mark.addEventListener('focus', () => show(mark, label));
        mark.addEventListener('mouseleave', hide);
        mark.addEventListener('blur', hide);
      });
      svg.addEventListener('mouseleave', hide);

      fig.querySelectorAll('[data-legend]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const on = btn.getAttribute('aria-pressed') !== 'true';
          btn.setAttribute('aria-pressed', String(on));
          const si = btn.dataset.legend;
          svg.querySelectorAll(`[data-line="${si}"], [data-series="${si}"]`).forEach((g) => {
            g.style.display = on ? '' : 'none';
          });
        });
      });
    });
    if (window.lucide) lucide.createIcons({ nameAttr: 'data-lucide' });
  }

  return { sparkline, line, bars, hbars, donut, heatStrip, wire, dataTable, color };
})();
