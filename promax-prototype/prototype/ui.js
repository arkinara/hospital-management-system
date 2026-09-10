/**
 * Hospital MS — Pro Max UI runtime.
 *
 * The app chrome, the interaction primitives and the dense-table engine live here so
 * that a page file contains only the thing that page is actually about. Everything
 * below is keyboard-reachable, screen-reader labelled and reduced-motion aware.
 *
 * Page contract:
 *   <main id="content" hidden> …page body… </main>
 *   <script>UI.shell({ title: 'Patients', active: 'patients', role: 'Admin' })</script>
 *
 * Requires: theme.js, data.js, lucide.
 */
window.UI = (function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const icon = (name, cls = 'w-4 h-4') => `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
  const uid = (() => { let n = 0; return (p = 'u') => `${p}${++n}`; })();
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ───────────────────────── Semantic status vocabulary ─────────────────────────
     Every status carries an icon as well as a colour, so meaning survives both
     colour-blindness and greyscale printing (WCAG 1.4.1). */
  const STATUS = {
    // clinical / workflow
    booked:         { label: 'Booked',        tone: 'info',    icon: 'calendar' },
    checked_in:     { label: 'Checked in',    tone: 'info',    icon: 'log-in' },
    in_progress:    { label: 'In progress',   tone: 'info',    icon: 'loader' },
    completed:      { label: 'Completed',     tone: 'success', icon: 'check' },
    cancelled:      { label: 'Cancelled',     tone: 'danger',  icon: 'x' },
    no_show:        { label: 'No-show',       tone: 'warning', icon: 'user-x' },
    admitted:       { label: 'Admitted',      tone: 'info',    icon: 'bed-double' },
    outpatient:     { label: 'Outpatient',    tone: 'neutral', icon: 'footprints' },
    discharged:     { label: 'Discharged',    tone: 'neutral', icon: 'door-open' },
    // records
    draft:          { label: 'Draft',         tone: 'warning', icon: 'pencil-line' },
    submitted:      { label: 'Submitted',     tone: 'info',    icon: 'send' },
    signed:         { label: 'Signed',        tone: 'success', icon: 'check-check' },
    // billing
    paid:           { label: 'Paid',          tone: 'success', icon: 'check' },
    partially_paid: { label: 'Part paid',     tone: 'info',    icon: 'circle-dashed' },
    unpaid:         { label: 'Unpaid',        tone: 'danger',  icon: 'alert-circle' },
    overdue:        { label: 'Overdue',       tone: 'danger',  icon: 'clock-alert' },
    // claims
    none:           { label: 'No claim',      tone: 'neutral', icon: 'minus' },
    approved:       { label: 'Approved',      tone: 'success', icon: 'shield-check' },
    denied:         { label: 'Denied',        tone: 'danger',  icon: 'shield-x' },
    // accounts
    active:         { label: 'Active',        tone: 'success', icon: 'check' },
    invited:        { label: 'Invited',       tone: 'info',    icon: 'mail' },
    inactive:       { label: 'Inactive',      tone: 'neutral', icon: 'pause' },
    // slots
    open:           { label: 'Open',          tone: 'success', icon: 'plus' },
    blocked:        { label: 'Blocked',       tone: 'neutral', icon: 'ban' },
    held:           { label: 'Held',          tone: 'warning', icon: 'hourglass' },
  };

  const TONE_CHIP = {
    success: 'bg-success-container text-success-container-foreground',
    warning: 'bg-warning-container text-warning-container-foreground',
    danger: 'bg-danger-container text-danger-container-foreground',
    info: 'bg-info-container text-info-container-foreground',
    neutral: 'bg-surface-3 text-muted',
  };

  /** Triage acuity — ordered, icon-differentiated, never colour alone. */
  const ACUITY = {
    critical: { label: 'Critical', tone: 'danger', icon: 'siren', rank: 0 },
    urgent: { label: 'Urgent', tone: 'warning', icon: 'alert-triangle', rank: 1 },
    standard: { label: 'Standard', tone: 'info', icon: 'circle', rank: 2 },
    routine: { label: 'Routine', tone: 'neutral', icon: 'circle-dot', rank: 3 },
  };

  const chip = (key, opts = {}) => {
    const s = STATUS[key] || { label: key, tone: 'neutral', icon: 'circle' };
    const size = opts.size === 'sm' ? 'text-2xs px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
    return `<span class="inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${size} ${TONE_CHIP[s.tone]}">
      ${icon(s.icon, 'w-3 h-3')}<span>${esc(opts.label || s.label)}</span></span>`;
  };

  const acuityBadge = (key) => {
    const a = ACUITY[key] || ACUITY.routine;
    return `<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE_CHIP[a.tone]}"
      title="Acuity: ${a.label}">${icon(a.icon, 'w-3 h-3')}<span>${a.label}</span></span>`;
  };

  const avatar = (name, cls = 'w-7 h-7 text-2xs') => {
    const initials = String(name).replace(/^Dr\.?\s*/i, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    return `<span class="${cls} shrink-0 rounded-full bg-primary-container text-primary-container-foreground grid place-items-center font-semibold" aria-hidden="true">${initials}</span>`;
  };

  /* ───────────────────────────── Toasts ─────────────────────────────
     Announced politely, never steal focus, auto-dismiss in 4s, and the Undo
     affordance stays reachable by keyboard for as long as the toast lives. */
  let toastHost = null;
  function ensureToastHost() {
    if (toastHost) return toastHost;
    toastHost = el(`<div id="toasts" class="fixed z-toast bottom-4 right-4 left-4 sm:left-auto flex flex-col-reverse gap-2 pb-safe pointer-events-none" role="region" aria-label="Notifications"></div>`);
    document.body.appendChild(toastHost);
    document.body.appendChild(el(`<div id="live" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>`));
    return toastHost;
  }
  function announce(msg) { ensureToastHost(); const l = $('#live'); if (l) l.textContent = msg; }

  function toast(msg, opts = {}) {
    ensureToastHost();
    const tone = opts.tone || 'neutral';
    const ring = { success: 'border-success/40', danger: 'border-danger/40', warning: 'border-warning/40', info: 'border-info/40', neutral: 'border-outline' }[tone];
    const ic = { success: 'check-circle-2', danger: 'alert-octagon', warning: 'alert-triangle', info: 'info', neutral: 'bell' }[tone];
    const node = el(`<div class="pointer-events-auto anim-in flex items-start gap-3 rounded-xl border ${ring} bg-surface-0 shadow-overlay px-3.5 py-3 sm:w-96">
      <span class="text-${tone === 'neutral' ? 'muted' : tone} mt-0.5">${icon(ic, 'w-4.5 h-4.5')}</span>
      <div class="flex-1 min-w-0">
        <p class="text-base font-medium leading-snug">${esc(msg)}</p>
        ${opts.detail ? `<p class="text-xs text-muted mt-0.5">${esc(opts.detail)}</p>` : ''}
      </div>
      ${opts.undo ? `<button type="button" data-undo class="shrink-0 min-h-11 px-2.5 -my-1 rounded-lg text-base font-semibold text-primary hover:bg-surface-2 press">Undo</button>` : ''}
      <button type="button" data-close class="shrink-0 w-8 h-8 -mr-1 -mt-1 rounded-lg grid place-items-center text-muted hover:bg-surface-2 press" aria-label="Dismiss notification">${icon('x', 'w-4 h-4')}</button>
    </div>`);
    toastHost.appendChild(node);
    announce(msg);
    lucide.createIcons({ nameAttr: 'data-lucide' });
    let timer = setTimeout(close, opts.undo ? 7000 : 4000);
    function close() { clearTimeout(timer); node.remove(); }
    $('[data-close]', node).addEventListener('click', close);
    const undoBtn = $('[data-undo]', node);
    if (undoBtn) {
      undoBtn.addEventListener('click', () => { close(); opts.undo(); });
      // Keep the toast alive while the user is reading or tabbing through it.
      node.addEventListener('mouseenter', () => clearTimeout(timer));
      node.addEventListener('focusin', () => clearTimeout(timer));
      node.addEventListener('mouseleave', () => { timer = setTimeout(close, 3000); });
    }
    return { close };
  }

  /* ───────────────────────── Overlays: dialog & sheet ─────────────────────────
     Focus is trapped, Escape closes, the trigger regains focus on close, and a
     dialog marked dirty confirms before it is dismissed. */
  const overlayStack = [];

  function dialog(opts = {}) {
    const { title, body = '', actions = [], size = 'md', tone = 'neutral', dirty = () => false, onClose } = opts;
    const width = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];
    const titleId = uid('dlg-t');
    const opener = document.activeElement;

    const scrim = el(`<div class="fixed inset-0 z-scrim anim-scrim" style="background: rgb(var(--scrim) / var(--scrim-alpha)); backdrop-filter: blur(2px)"></div>`);
    const wrap = el(`<div class="fixed inset-0 z-overlay grid place-items-end sm:place-items-center p-0 sm:p-4 overflow-y-auto">
      <div role="dialog" aria-modal="true" aria-labelledby="${titleId}"
           class="anim-sheet w-full ${width} bg-surface-0 border border-outline rounded-t-2xl sm:rounded-2xl shadow-overlay pb-safe">
        <header class="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-outline">
          ${tone !== 'neutral' ? `<span class="mt-0.5 w-8 h-8 shrink-0 rounded-lg grid place-items-center ${TONE_CHIP[tone]}">${icon({ danger: 'alert-triangle', warning: 'alert-triangle', success: 'check', info: 'info' }[tone] || 'info', 'w-4 h-4')}</span>` : ''}
          <h2 id="${titleId}" class="flex-1 text-lg font-semibold font-display">${esc(title)}</h2>
          <button type="button" data-x class="w-9 h-9 -mr-1.5 -mt-0.5 shrink-0 rounded-lg grid place-items-center text-muted hover:bg-surface-2 press" aria-label="Close dialog">${icon('x', 'w-4.5 h-4.5')}</button>
        </header>
        <div data-body class="px-5 py-4 max-h-[65vh] overflow-y-auto">${body}</div>
        <footer data-foot class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-3.5 border-t border-outline bg-surface-1 rounded-b-2xl"></footer>
      </div>
    </div>`);

    const foot = $('[data-foot]', wrap);
    if (!actions.length) foot.remove();
    actions.forEach((a) => {
      const b = el(`<button type="button" class="${btnClass(a.variant || 'ghost')}">${a.icon ? icon(a.icon, 'w-4 h-4') : ''}<span>${esc(a.label)}</span></button>`);
      b.addEventListener('click', () => { const keep = a.onClick && a.onClick(); if (keep !== false) close(true); });
      foot.appendChild(b);
    });

    document.body.appendChild(scrim);
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    lucide.createIcons({ nameAttr: 'data-lucide' });

    const panel = $('[role="dialog"]', wrap);
    const focusables = () => $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', panel).filter((n) => n.offsetParent !== null);
    (focusables().find((n) => !n.hasAttribute('data-x')) || panel).focus?.();

    function onKey(e) {
      if (overlayStack[overlayStack.length - 1] !== api) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    function close(force) {
      if (!force && dirty()) {
        confirmDialog({
          title: 'Discard unsaved changes?',
          message: 'This form has edits that have not been saved. Closing now loses them.',
          confirmLabel: 'Discard changes', tone: 'danger',
          onConfirm: () => close(true),
        });
        return;
      }
      document.removeEventListener('keydown', onKey, true);
      scrim.remove(); wrap.remove();
      overlayStack.pop();
      if (!overlayStack.length) document.body.style.overflow = '';
      opener && opener.focus && opener.focus();
      onClose && onClose();
    }
    $('[data-x]', wrap).addEventListener('click', () => close());
    scrim.addEventListener('click', () => close());
    document.addEventListener('keydown', onKey, true);

    const api = { close, panel, body: $('[data-body]', wrap) };
    overlayStack.push(api);
    return api;
  }

  function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'danger', onConfirm, consequence }) {
    return dialog({
      title, tone, size: 'sm',
      body: `<p class="text-base text-muted leading-relaxed">${esc(message)}</p>
             ${consequence ? `<ul class="mt-3 space-y-1.5 text-base">${consequence.map((c) => `<li class="flex gap-2"><span class="text-danger mt-0.5">${icon('dot', 'w-4 h-4')}</span><span>${esc(c)}</span></li>`).join('')}</ul>` : ''}`,
      actions: [
        { label: cancelLabel, variant: 'ghost' },
        { label: confirmLabel, variant: tone === 'danger' ? 'danger' : 'primary', icon: tone === 'danger' ? 'trash-2' : 'check', onClick: onConfirm },
      ],
    });
  }

  /* ───────────────────────────── Buttons ───────────────────────────── */
  const btnClass = (variant = 'ghost', size = 'md') => {
    const sizes = { sm: 'h-9 px-2.5 text-base gap-1.5', md: 'min-h-11 px-3.5 text-base gap-2', lg: 'min-h-12 px-4 text-md gap-2' };
    const variants = {
      primary: 'bg-primary text-primary-foreground hover:brightness-110 border border-transparent font-semibold',
      accent: 'bg-accent text-accent-foreground hover:brightness-110 border border-transparent font-semibold',
      danger: 'bg-danger text-surface-0 dark:text-surface-0 hover:brightness-110 border border-transparent font-semibold',
      outline: 'bg-surface-0 text-foreground border border-outline-strong hover:bg-surface-2 font-medium',
      ghost: 'bg-transparent text-foreground border border-transparent hover:bg-surface-2 font-medium',
      subtle: 'bg-surface-2 text-foreground border border-outline hover:bg-surface-3 font-medium',
    };
    return `inline-flex items-center justify-center rounded-lg press cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]}`;
  };
  const button = ({ label, variant, size, icon: ic, iconRight, attrs = '' }) =>
    `<button type="button" class="${btnClass(variant, size)}" ${attrs}>${ic ? icon(ic, 'w-4 h-4') : ''}${label ? `<span>${esc(label)}</span>` : ''}${iconRight ? icon(iconRight, 'w-4 h-4') : ''}</button>`;

  /* ─────────────── Form field: visible label, helper, inline validation ───────────────
     Validation fires on blur (not per keystroke), the message sits under the field it
     belongs to, and role="alert" makes it audible without moving focus. */
  function field(o = {}) {
    const id = o.id || uid('f');
    const helpId = `${id}-help`, errId = `${id}-err`;
    const base = `w-full min-h-11 rounded-lg bg-surface-0 border border-outline-strong px-3 text-base text-foreground placeholder:text-subtle focus-inset transition`;
    let control;
    if (o.type === 'select') {
      control = `<select id="${id}" name="${id}" class="${base} pr-9 appearance-none cursor-pointer" ${o.required ? 'required' : ''} ${o.attrs || ''}
        aria-describedby="${helpId}">${(o.options || []).map((op) => `<option value="${esc(op.value ?? op)}" ${op.selected ? 'selected' : ''}>${esc(op.label ?? op)}</option>`).join('')}</select>
        <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">${icon('chevron-down', 'w-4 h-4')}</span>`;
    } else if (o.type === 'textarea') {
      control = `<textarea id="${id}" name="${id}" rows="${o.rows || 4}" class="${base} py-2.5 leading-relaxed resize-y" placeholder="${esc(o.placeholder || '')}" ${o.required ? 'required' : ''} aria-describedby="${helpId}" ${o.attrs || ''}>${esc(o.value || '')}</textarea>`;
    } else {
      control = `<input id="${id}" name="${id}" type="${o.type || 'text'}" value="${esc(o.value || '')}" placeholder="${esc(o.placeholder || '')}"
        class="${base} ${o.icon ? 'pl-9' : ''} ${o.type === 'password' ? 'pr-11' : ''} ${o.mono ? 'num' : ''}"
        ${o.required ? 'required' : ''} ${o.autocomplete ? `autocomplete="${o.autocomplete}"` : ''} ${o.inputmode ? `inputmode="${o.inputmode}"` : ''}
        aria-describedby="${helpId}" ${o.attrs || ''} />
        ${o.icon ? `<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">${icon(o.icon, 'w-4 h-4')}</span>` : ''}
        ${o.type === 'password' ? `<button type="button" data-pw class="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg grid place-items-center text-muted hover:bg-surface-2" aria-label="Show password" aria-pressed="false">${icon('eye', 'w-4 h-4')}</button>` : ''}`;
    }
    return `<div class="min-w-0" data-field>
      <label for="${id}" class="block text-base font-medium mb-1.5">${esc(o.label)}${o.required ? ' <span class="text-danger" aria-hidden="true">*</span><span class="sr-only"> (required)</span>' : o.optional ? ' <span class="text-subtle font-normal text-xs">(optional)</span>' : ''}</label>
      <div class="relative">${control}</div>
      <p id="${helpId}" class="mt-1.5 text-xs text-muted ${o.help ? '' : 'hidden'}">${esc(o.help || '')}</p>
      <p id="${errId}" data-err role="alert" class="mt-1.5 text-xs font-medium text-danger hidden items-start gap-1"></p>
    </div>`;
  }

  /** Wire blur-time validation + password reveal for every field inside `root`. */
  function wireFields(root = document) {
    $$('[data-pw]', root).forEach((b) => {
      if (b.dataset.wired) return; b.dataset.wired = '1';
      b.addEventListener('click', () => {
        const input = b.parentElement.querySelector('input');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        b.setAttribute('aria-pressed', String(show));
        b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        b.innerHTML = icon(show ? 'eye-off' : 'eye', 'w-4 h-4');
        lucide.createIcons({ nameAttr: 'data-lucide' });
      });
    });
    $$('[data-field] input, [data-field] select, [data-field] textarea', root).forEach((input) => {
      if (input.dataset.wired) return; input.dataset.wired = '1';
      input.addEventListener('blur', () => validateField(input));
      input.addEventListener('input', () => { if (input.getAttribute('aria-invalid') === 'true') validateField(input); });
    });
  }

  /** Messages state the cause AND the fix — "Invalid input" is not an error message. */
  function validateField(input) {
    const holder = input.closest('[data-field]');
    const errEl = $('[data-err]', holder);
    let msg = '';
    const val = input.value.trim();
    if (input.required && !val) msg = `${labelOf(holder)} is required — enter a value to continue.`;
    else if (val && input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) msg = 'Email must look like name@hospital.health — check for a missing @ or domain.';
    else if (val && input.dataset.rule === 'nid' && !/^\d{16}$/.test(val.replace(/\s/g, ''))) msg = `National ID must be exactly 16 digits (you entered ${val.replace(/\D/g, '').length}).`;
    else if (val && input.dataset.rule === 'phone' && !/^[+\d][\d\s-]{7,}$/.test(val)) msg = 'Phone must be digits, optionally starting with +. Example: +62 811 2043 118.';
    else if (val && input.dataset.rule === 'dob' && new Date(val) > new Date(DB.TODAY)) msg = 'Date of birth cannot be in the future.';
    setFieldError(input, msg);
    return !msg;
  }
  const labelOf = (holder) => ($('label', holder)?.textContent || 'This field').replace('*', '').replace('(required)', '').trim();

  function setFieldError(input, msg) {
    const holder = input.closest('[data-field]');
    const errEl = $('[data-err]', holder);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    input.classList.toggle('border-danger', !!msg);
    input.classList.toggle('border-outline-strong', !msg);
    if (msg) {
      errEl.innerHTML = `${icon('alert-circle', 'w-3.5 h-3.5 shrink-0 mt-px')}<span>${esc(msg)}</span>`;
      errEl.classList.remove('hidden'); errEl.classList.add('flex');
      input.setAttribute('aria-describedby', `${input.id}-err ${input.id}-help`);
      lucide.createIcons({ nameAttr: 'data-lucide' });
    } else {
      errEl.classList.add('hidden'); errEl.classList.remove('flex'); errEl.textContent = '';
      input.setAttribute('aria-describedby', `${input.id}-help`);
    }
  }

  /**
   * Validate a form: collect errors, render a summary with anchor links, and move
   * focus to the first invalid field (WCAG 3.3.1 + 3.3.3).
   */
  function validateForm(form) {
    const inputs = $$('[data-field] input, [data-field] select, [data-field] textarea', form);
    const bad = inputs.filter((i) => !validateField(i));
    const summary = $('[data-error-summary]', form);
    if (summary) {
      if (bad.length) {
        summary.innerHTML = `<div class="rounded-xl border border-danger/50 bg-danger-container text-danger-container-foreground p-3.5" role="alert" tabindex="-1">
          <p class="flex items-center gap-2 text-base font-semibold">${icon('alert-octagon', 'w-4 h-4')} ${bad.length} field${bad.length > 1 ? 's need' : ' needs'} attention before saving</p>
          <ul class="mt-2 space-y-1 text-base">${bad.map((i) => `<li><a href="#${i.id}" class="underline underline-offset-2 hover:no-underline">${esc(labelOf(i.closest('[data-field]')))}</a></li>`).join('')}</ul></div>`;
        summary.hidden = false;
        lucide.createIcons({ nameAttr: 'data-lucide' });
        $$('a', summary).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); const t = $(a.getAttribute('href')); t?.focus(); }));
      } else { summary.hidden = true; summary.innerHTML = ''; }
    }
    if (bad.length) bad[0].focus();
    return !bad.length;
  }

  /** Async submit: disable, spinner, then success/error — never a silent click. */
  function submitting(btn, label = 'Saving…') {
    const original = btn.innerHTML;
    btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = `<span class="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true"></span><span>${esc(label)}</span>`;
    return () => { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = original; lucide.createIcons({ nameAttr: 'data-lucide' }); };
  }

  /* ─────────────────────── Empty / error / loading blocks ─────────────────────── */
  const emptyState = ({ icon: ic = 'inbox', title, body, action, secondary }) => `
    <div class="flex flex-col items-center text-center px-6 py-12">
      <span class="w-12 h-12 rounded-2xl bg-surface-2 border border-outline grid place-items-center text-muted mb-3.5">${icon(ic, 'w-6 h-6')}</span>
      <h3 class="text-lg font-semibold font-display">${esc(title)}</h3>
      <p class="mt-1.5 text-base text-muted max-w-sm leading-relaxed">${esc(body)}</p>
      ${action || secondary ? `<div class="mt-4 flex flex-wrap items-center justify-center gap-2">${action || ''}${secondary || ''}</div>` : ''}
    </div>`;

  const errorState = ({ title = 'Could not load this data', body = 'The request to the records service timed out after 30 seconds. Your work is not lost.', retryLabel = 'Retry' }) => `
    <div class="flex flex-col items-center text-center px-6 py-12">
      <span class="w-12 h-12 rounded-2xl bg-danger-container text-danger-container-foreground grid place-items-center mb-3.5">${icon('cloud-off', 'w-6 h-6')}</span>
      <h3 class="text-lg font-semibold font-display">${esc(title)}</h3>
      <p class="mt-1.5 text-base text-muted max-w-md leading-relaxed">${esc(body)}</p>
      <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
        ${button({ label: retryLabel, variant: 'primary', icon: 'rotate-cw', attrs: 'data-retry' })}
        ${button({ label: 'Work offline', variant: 'outline', icon: 'wifi-off' })}
      </div>
      <p class="mt-3 text-xs text-subtle num">Trace 9f3c-2a71 · 09:41:22 WIB</p>
    </div>`;

  const skeletonRows = (n = 6, cols = 5) => `<div class="p-3 space-y-2" aria-hidden="true">
    ${Array.from({ length: n }).map(() => `<div class="flex items-center gap-3" style="height: var(--row-h)">
      <span class="skel w-8 h-8 rounded-full shrink-0"></span>
      ${Array.from({ length: cols }).map((_, i) => `<span class="skel h-3.5 flex-1" style="max-width:${[160, 90, 120, 70, 100][i % 5]}px"></span>`).join('')}
    </div>`).join('')}</div>`;

  /* ───────────────────────────── Dense table engine ─────────────────────────────
     One call gives: sortable sticky header with aria-sort, row selection with a bulk
     bar that offers Undo, a <768px card fallback (no horizontal scroll), and the
     loading / empty / error states wired to the page state switcher. */
  function table(mount, cfg) {
    const host = typeof mount === 'string' ? $(mount) : mount;
    if (!host) return null;
    const id = host.id || uid('tbl');
    let sort = cfg.sort ? { ...cfg.sort } : null;
    let selected = new Set();
    const rowKey = cfg.rowKey || ((r, i) => String(i));

    function sortedRows() {
      if (!sort) return cfg.rows.slice();
      const col = cfg.columns.find((c) => c.key === sort.key);
      const get = col?.sortValue || ((r) => r[sort.key]);
      return cfg.rows.slice().sort((a, b) => {
        const va = get(a), vb = get(b);
        const n = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'en', { numeric: true });
        return sort.dir === 'desc' ? -n : n;
      });
    }

    function render() {
      const rows = sortedRows();
      const selectable = !!cfg.select;
      const allSel = rows.length > 0 && rows.every((r, i) => selected.has(rowKey(r, i)));

      const head = `<tr>
        ${selectable ? `<th scope="col" class="w-10"><span class="sr-only">Select</span>
          <input type="checkbox" data-all class="w-4 h-4 accent-[rgb(var(--primary))] cursor-pointer align-middle" ${allSel ? 'checked' : ''} aria-label="Select all ${rows.length} rows"></th>` : ''}
        ${cfg.columns.map((c) => {
          const sortable = c.sortable !== false && !c.cellOnly;
          const dir = sort && sort.key === c.key ? sort.dir : null;
          const ariaSort = sortable ? `aria-sort="${dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}"` : '';
          const arrow = dir ? icon(dir === 'asc' ? 'arrow-up' : 'arrow-down', 'w-3 h-3') : `<span class="opacity-0 group-hover:opacity-50">${icon('arrow-up-down', 'w-3 h-3')}</span>`;
          return `<th scope="col" ${ariaSort} ${sortable ? `data-sort="${c.key}" tabindex="0" role="columnheader"` : ''} class="group ${c.align === 'right' ? 'text-right' : ''}" ${c.width ? `style="width:${c.width}"` : ''}>
            <span class="inline-flex items-center gap-1 ${c.align === 'right' ? 'flex-row-reverse' : ''}">${esc(c.label)}${sortable ? arrow : ''}</span></th>`;
        }).join('')}
      </tr>`;

      const body = rows.map((r, i) => {
        const k = rowKey(r, i);
        const isSel = selected.has(k);
        return `<tr data-k="${esc(k)}" ${isSel ? 'aria-selected="true"' : ''} class="${cfg.onRow ? 'cursor-pointer' : ''}">
          ${selectable ? `<td><input type="checkbox" data-row="${esc(k)}" class="w-4 h-4 accent-[rgb(var(--primary))] cursor-pointer align-middle" ${isSel ? 'checked' : ''} aria-label="Select ${esc(cfg.rowLabel ? cfg.rowLabel(r) : k)}"></td>` : ''}
          ${cfg.columns.map((c) => `<td class="${c.align === 'right' ? 'text-right' : ''} ${c.mono ? 'num' : ''} ${c.tdClass || ''}">${c.cell ? c.cell(r) : esc(r[c.key])}</td>`).join('')}
        </tr>`;
      }).join('');

      host.innerHTML = `
        <div data-states class="relative">
          <!-- READY -->
          <div data-state="ready">
            ${cfg.select ? `<div data-bulk hidden class="anim-in sticky top-0 z-sticky flex flex-wrap items-center gap-2 px-3 py-2 bg-primary-container text-primary-container-foreground border-b border-outline">
              <span class="text-base font-semibold num" data-bulk-count>0 selected</span>
              <span class="flex-1"></span>
              ${(cfg.bulkActions || []).map((a, i) => `<button type="button" data-bulk-i="${i}" class="${btnClass(a.variant || 'subtle', 'sm')}">${a.icon ? icon(a.icon, 'w-3.5 h-3.5') : ''}<span>${esc(a.label)}</span></button>`).join('')}
              <button type="button" data-bulk-clear class="${btnClass('ghost', 'sm')}">Clear</button>
            </div>` : ''}

            <!-- Desktop / tablet: dense table -->
            <div class="hidden md:block overflow-x-auto overscroll-x-contain" style="max-height:${cfg.maxHeight || 'none'}">
              <table class="dt" ${cfg.caption ? '' : 'aria-label="' + esc(cfg.label || 'Data table') + '"'}>
                ${cfg.caption ? `<caption class="sr-only">${esc(cfg.caption)}</caption>` : ''}
                <thead>${head}</thead>
                <tbody>${body}</tbody>
              </table>
            </div>

            <!-- Mobile: the same records as cards, so nothing scrolls sideways -->
            <ul class="md:hidden divide-y divide-outline" aria-label="${esc(cfg.label || 'Records')}">
              ${rows.map((r, i) => `<li><a href="${cfg.onRow ? cfg.onRow(r) : '#'}" class="block px-4 py-3 min-h-12 hover:bg-surface-2 press">${cfg.mobileCard ? cfg.mobileCard(r) : esc(rowKey(r, i))}</a></li>`).join('')}
            </ul>
            ${cfg.footer ? `<div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-t border-outline bg-surface-1 text-xs text-muted">${cfg.footer}</div>` : ''}
          </div>

          <!-- LOADING -->
          <div data-state="loading" hidden>${skeletonRows(cfg.skeletonRows || 7, cfg.columns.length)}</div>
          <!-- EMPTY -->
          <div data-state="empty" hidden>${emptyState(cfg.empty || { icon: 'search-x', title: 'No records match these filters', body: 'Try widening the date range or clearing a filter to see more results.', action: button({ label: 'Clear all filters', variant: 'primary', icon: 'filter-x' }) })}</div>
          <!-- ERROR -->
          <div data-state="error" hidden>${errorState(cfg.error || {})}</div>
        </div>`;

      lucide.createIcons({ nameAttr: 'data-lucide' });
      wire();
      applyState(currentState, host);
    }

    function wire() {
      $$('th[data-sort]', host).forEach((th) => {
        const go = () => {
          const key = th.dataset.sort;
          sort = sort && sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };
          render();
          announce(`Sorted by ${th.textContent.trim()}, ${sort.dir === 'asc' ? 'ascending' : 'descending'}`);
          $(`th[data-sort="${key}"]`, host)?.focus();
        };
        th.addEventListener('click', go);
        th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      });

      const bulk = $('[data-bulk]', host);
      const syncBulk = () => {
        if (!bulk) return;
        bulk.hidden = selected.size === 0;
        $('[data-bulk-count]', bulk).textContent = `${selected.size} selected`;
      };
      $$('[data-row]', host).forEach((cb) => cb.addEventListener('change', (e) => {
        e.stopPropagation();
        cb.checked ? selected.add(cb.dataset.row) : selected.delete(cb.dataset.row);
        cb.closest('tr').toggleAttribute('aria-selected', cb.checked);
        syncBulk();
      }));
      const all = $('[data-all]', host);
      if (all) all.addEventListener('change', () => {
        selected = all.checked ? new Set(cfg.rows.map((r, i) => rowKey(r, i))) : new Set();
        render();
      });
      $('[data-bulk-clear]', host)?.addEventListener('click', () => { selected = new Set(); render(); });
      $$('[data-bulk-i]', host).forEach((b) => b.addEventListener('click', () => {
        const a = cfg.bulkActions[+b.dataset.bulkI];
        const picked = Array.from(selected);
        a.onClick && a.onClick(picked);
        selected = new Set(); render();
      }));
      syncBulk();

      if (cfg.onRow) $$('tbody tr', host).forEach((tr) => tr.addEventListener('click', (e) => {
        if (e.target.closest('input,button,a')) return;
        const r = cfg.rows.find((row, i) => rowKey(row, i) === tr.dataset.k);
        if (r) location.href = cfg.onRow(r);
      }));
    }

    render();
    return { render, get selected() { return Array.from(selected); }, setRows(rows) { cfg.rows = rows; render(); } };
  }

  /* ─────────────────────────── Page state switcher ───────────────────────────
     Instead of stacking four demo variants down the page, every data region declares
     its four states and the header control switches all of them at once. */
  let currentState = 'ready';
  function applyState(state, root = document) {
    $$('[data-states]', root).forEach((g) => {
      $$(':scope > [data-state]', g).forEach((n) => { n.hidden = n.dataset.state !== state; });
    });
  }
  function setState(state) {
    currentState = state;
    applyState(state);
    $$('[data-state-btn]').forEach((b) => {
      const on = b.dataset.stateBtn === state;
      b.setAttribute('aria-pressed', String(on));
      b.className = stateBtnClass(on);
    });
    announce(`Showing ${state} state`);
  }
  const stateBtnClass = (on) => `px-2.5 h-8 rounded-md text-xs font-semibold capitalize press cursor-pointer ${on ? 'bg-primary text-primary-foreground' : 'text-muted hover:bg-surface-3'}`;

  /* ───────────────────────────── Command palette ─────────────────────────────
     Ctrl/⌘+K. Patients, actions and destinations in one list — the fastest path
     for staff who know what they want and should not have to navigate to it. */
  function commandPalette() {
    const items = [
      ...DB.patients.map((p) => ({ group: 'Patients', label: p.name, meta: `${p.mrn} · ${DB.deptName(p.dept)} · ${DB.age(p.dob)}y`, icon: 'user', href: `04-patient-detail.html?mrn=${p.mrn}` })),
      { group: 'Actions', label: 'Register new patient', meta: 'Patients · create', icon: 'user-plus', href: '05-appointment-booking.html' },
      { group: 'Actions', label: 'Book appointment', meta: 'Appointments · create', icon: 'calendar-plus', href: '05-appointment-booking.html' },
      { group: 'Actions', label: 'New visit note', meta: 'Records · create', icon: 'file-plus-2', href: '07-record-entry.html' },
      { group: 'Actions', label: 'Record payment', meta: 'Billing · create', icon: 'banknote', href: '08-billing.html' },
      { group: 'Go to', label: 'Patient directory', meta: 'Patients', icon: 'users', href: '03-patient-list.html' },
      { group: 'Go to', label: 'Doctor schedule', meta: 'Appointments', icon: 'calendar-days', href: '06-doctor-schedule.html' },
      { group: 'Go to', label: 'Billing & invoices', meta: 'Billing', icon: 'receipt-text', href: '08-billing.html' },
      { group: 'Go to', label: 'Users', meta: 'Admin', icon: 'user-cog', href: '09-admin-users.html' },
      { group: 'Go to', label: 'Departments', meta: 'Admin', icon: 'building-2', href: '10-admin-departments.html' },
      { group: 'Go to', label: 'Widget library', meta: 'Admin', icon: 'layout-grid', href: '11-admin-widget-library.html' },
      { group: 'Go to', label: 'Permissions matrix', meta: 'Admin', icon: 'key-round', href: '12-admin-permissions.html' },
      { group: 'Preferences', label: 'Toggle dark mode', meta: 'Shortcut: d', icon: 'moon-star', run: () => PromaxTheme.toggleTheme() },
      { group: 'Preferences', label: 'Toggle compact density', meta: 'Shortcut: shift+d', icon: 'rows-3', run: () => PromaxTheme.toggleDensity() },
    ];

    const dlg = dialog({
      title: 'Search or jump to',
      size: 'lg',
      body: `<div>
        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted">${icon('search', 'w-4 h-4')}</span>
          <input id="cmdq" type="search" placeholder="Patient name, MRN, or an action…" autocomplete="off"
            class="w-full min-h-12 rounded-lg bg-surface-2 border border-outline-strong pl-9 pr-3 text-md focus-inset"
            role="combobox" aria-expanded="true" aria-controls="cmdlist" aria-autocomplete="list" />
        </div>
        <ul id="cmdlist" role="listbox" aria-label="Results" class="mt-3 max-h-80 overflow-y-auto -mx-1 px-1"></ul>
        <p class="mt-3 pt-3 border-t border-outline text-xs text-subtle flex flex-wrap gap-x-4 gap-y-1">
          <span><kbd class="num">↑ ↓</kbd> move</span><span><kbd class="num">Enter</kbd> open</span><span><kbd class="num">Esc</kbd> close</span>
        </p>
      </div>`,
    });

    const input = $('#cmdq', dlg.panel);
    const list = $('#cmdlist', dlg.panel);
    let active = 0, shown = [];

    function draw(q) {
      const needle = q.trim().toLowerCase();
      shown = (needle ? items.filter((i) => (i.label + ' ' + i.meta).toLowerCase().includes(needle)) : items).slice(0, 40);
      active = 0;
      if (!shown.length) {
        list.innerHTML = `<li class="px-3 py-8 text-center text-base text-muted">No match for “${esc(q)}”. Try an MRN like <span class="num">P-001042</span>.</li>`;
        return;
      }
      let lastGroup = '';
      list.innerHTML = shown.map((i, idx) => {
        const header = i.group !== lastGroup ? `<li role="presentation" class="px-2 pt-3 pb-1 text-2xs font-semibold uppercase tracking-wide text-subtle">${esc(i.group)}</li>` : '';
        lastGroup = i.group;
        return `${header}<li role="option" id="cmd-${idx}" data-i="${idx}" aria-selected="${idx === 0}"
          class="flex items-center gap-3 px-2.5 py-2 min-h-11 rounded-lg cursor-pointer ${idx === 0 ? 'bg-primary-container text-primary-container-foreground' : 'hover:bg-surface-2'}">
          <span class="text-muted">${icon(i.icon, 'w-4 h-4')}</span>
          <span class="flex-1 min-w-0"><span class="block text-base font-medium truncate">${esc(i.label)}</span>
          <span class="block text-xs text-muted truncate num">${esc(i.meta)}</span></span>
          ${icon('arrow-right', 'w-3.5 h-3.5 text-subtle')}</li>`;
      }).join('');
      lucide.createIcons({ nameAttr: 'data-lucide' });
      $$('[data-i]', list).forEach((n) => n.addEventListener('click', () => choose(+n.dataset.i)));
    }

    function move(delta) {
      const opts = $$('[data-i]', list);
      if (!opts.length) return;
      active = (active + delta + opts.length) % opts.length;
      opts.forEach((n, i) => {
        const on = i === active;
        n.setAttribute('aria-selected', String(on));
        n.classList.toggle('bg-primary-container', on);
        n.classList.toggle('text-primary-container-foreground', on);
        n.classList.toggle('hover:bg-surface-2', !on);
      });
      opts[active].scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', `cmd-${active}`);
    }

    function choose(i) {
      const item = shown[i];
      if (!item) return;
      dlg.close(true);
      if (item.run) { item.run(); toast(`${item.label} applied.`, { tone: 'info' }); }
      else location.href = item.href;
    }

    input.addEventListener('input', () => draw(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
    });
    draw('');
    input.focus();
  }

  function shortcutSheet() {
    const rows = [
      ['⌘ / Ctrl + K', 'Open command palette'],
      ['g then p', 'Go to patients'],
      ['g then a', 'Go to appointments'],
      ['g then b', 'Go to billing'],
      ['g then d', 'Go to my dashboard'],
      ['d', 'Toggle dark mode'],
      ['Shift + D', 'Toggle compact / comfortable density'],
      ['1 / 2 / 3 / 4', 'Preview ready / loading / empty / error state'],
      ['?', 'This shortcut list'],
      ['Esc', 'Close any dialog or sheet'],
    ];
    dialog({
      title: 'Keyboard shortcuts',
      size: 'md',
      body: `<dl class="divide-y divide-outline">${rows.map(([k, v]) => `<div class="flex items-center gap-4 py-2.5">
        <dt class="w-40 shrink-0"><kbd class="num text-xs px-1.5 py-1 rounded-md bg-surface-2 border border-outline">${esc(k)}</kbd></dt>
        <dd class="text-base">${esc(v)}</dd></div>`).join('')}</dl>
        <p class="mt-4 text-xs text-muted">Drag-and-drop on the dashboard also works from the keyboard: focus a widget handle and use the arrow keys.</p>`,
      actions: [{ label: 'Close', variant: 'primary' }],
    });
  }

  /* ───────────────────────────── App shell ───────────────────────────── */
  const canSee = (role, module) => !module || (DB.permissions[role]?.[module] || '').includes('v');

  function navHtml(role, active) {
    const item = (n, depth = 0) => {
      const on = n.key === active;
      const href = n.key === 'dashboard' ? DB.dashboardFor[role] : n.href;
      const disabled = !href;
      const cls = on
        ? 'bg-primary-container text-primary-container-foreground font-semibold'
        : disabled ? 'text-subtle cursor-not-allowed' : 'text-foreground hover:bg-surface-3 font-medium';
      return `<li>
        <a ${disabled ? 'aria-disabled="true" role="link"' : `href="${href}"`} ${on ? 'aria-current="page"' : ''}
           class="relative flex items-center gap-2.5 rounded-lg px-2.5 min-h-11 text-base press ${cls} ${depth ? 'pl-8' : ''}"
           ${disabled ? 'title="Not part of the Phase 1 prototype"' : ''}>
          ${on ? '<span class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary" aria-hidden="true"></span>' : ''}
          ${icon(n.icon, 'w-4.5 h-4.5 shrink-0')}<span class="truncate">${esc(n.label)}</span>
          ${disabled ? `<span class="ml-auto text-2xs text-subtle">soon</span>` : ''}
        </a></li>`;
    };
    return DB.nav.filter((n) => canSee(role, n.module)).map((n) => {
      if (!n.children) return item(n, 0);
      const kids = n.children;
      const openGroup = kids.some((k) => k.key === active) || n.key === active;
      return `<li>
        <details ${openGroup ? 'open' : ''} class="group">
          <summary class="flex items-center gap-2.5 rounded-lg px-2.5 min-h-11 text-base font-medium cursor-pointer press hover:bg-surface-3 marker:content-none [&::-webkit-details-marker]:hidden">
            ${icon(n.icon, 'w-4.5 h-4.5 shrink-0')}<span class="flex-1 truncate">${esc(n.label)}</span>
            ${icon('chevron-down', 'w-4 h-4 text-muted transition group-open:rotate-180')}
          </summary>
          <ul class="mt-0.5 space-y-0.5">${kids.map((k) => item(k, 1)).join('')}</ul>
        </details></li>`;
    }).join('');
  }

  function shell(opts = {}) {
    const params = new URLSearchParams(location.search);
    const role = params.get('role') || opts.role || 'Admin';
    const session = DB.sessions[role];
    const active = opts.active || '';
    const content = $('#content');

    document.body.className = 'bg-background text-foreground antialiased min-h-dvh';

    const app = el(`<div class="min-h-dvh flex">
      <a href="#content" class="sr-only focus:not-sr-only focus:fixed focus:z-toast focus:top-3 focus:left-3 focus:px-4 focus:py-2.5 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:font-semibold">Skip to main content</a>

      <!-- Sidebar (>=1024px) -->
      <aside class="hidden lg:flex flex-col w-60 shrink-0 bg-surface-1 border-r border-outline sticky top-0 h-dvh">
        <div class="h-14 flex items-center gap-2.5 px-3 border-b border-outline shrink-0">
          <span class="w-8 h-8 rounded-lg bg-primary text-primary-foreground grid place-items-center shrink-0">${icon('cross', 'w-4.5 h-4.5')}</span>
          <span class="leading-tight min-w-0">
            <span class="block text-base font-semibold font-display truncate">Sirkaya Hospital</span>
            <span class="block text-2xs text-muted truncate">Phase 1 · Pro Max</span>
          </span>
        </div>
        <nav aria-label="Main" class="flex-1 overflow-y-auto p-2">
          <ul class="space-y-0.5">${navHtml(role, active)}</ul>
        </nav>
        <div class="p-2 border-t border-outline shrink-0">
          <button type="button" data-shortcuts class="w-full flex items-center gap-2.5 rounded-lg px-2.5 min-h-11 text-base text-muted hover:bg-surface-3 press">
            ${icon('keyboard', 'w-4.5 h-4.5')}<span class="flex-1 text-left">Shortcuts</span><kbd class="num text-2xs px-1.5 py-0.5 rounded bg-surface-3 border border-outline">?</kbd>
          </button>
          <!-- Sign out sits below a divider, away from navigation, so it is never mis-clicked -->
          <div class="mt-1 pt-1 border-t border-outline">
            <a href="01-signin.html" class="flex items-center gap-2.5 rounded-lg px-2.5 min-h-11 text-base text-danger hover:bg-danger-container press">
              ${icon('log-out', 'w-4.5 h-4.5')}<span>Sign out</span></a>
          </div>
        </div>
      </aside>

      <div class="flex-1 flex flex-col min-w-0">
        <!-- Header -->
        <header class="sticky top-0 z-nav h-14 shrink-0 bg-surface-1/95 backdrop-blur border-b border-outline flex items-center gap-2 px-3 sm:px-4">
          <button type="button" data-menu class="lg:hidden w-11 h-11 -ml-1 rounded-lg grid place-items-center hover:bg-surface-3 press" aria-label="Open navigation menu" aria-expanded="false">${icon('menu', 'w-5 h-5')}</button>
          <div class="min-w-0 lg:hidden flex items-center gap-2">
            <span class="w-7 h-7 rounded-md bg-primary text-primary-foreground grid place-items-center shrink-0">${icon('cross', 'w-4 h-4')}</span>
          </div>
          <div class="min-w-0 flex-1">
            <h1 class="text-md sm:text-lg font-semibold font-display truncate">${esc(opts.title || '')}</h1>
            ${opts.subtitle ? `<p class="hidden sm:block text-xs text-muted truncate">${esc(opts.subtitle)}</p>` : ''}
          </div>

          <!-- Search opens the palette; the icon is never the only affordance -->
          <button type="button" data-cmdk class="hidden md:flex items-center gap-2 h-9 pl-2.5 pr-2 rounded-lg bg-surface-2 border border-outline text-muted hover:bg-surface-3 press min-w-56 text-left">
            ${icon('search', 'w-4 h-4')}<span class="flex-1 text-base">Search patients, actions…</span>
            <kbd class="num text-2xs px-1.5 py-0.5 rounded bg-surface-0 border border-outline">⌘K</kbd>
          </button>
          <button type="button" data-cmdk class="md:hidden w-11 h-11 rounded-lg grid place-items-center hover:bg-surface-3 press" aria-label="Search">${icon('search', 'w-5 h-5')}</button>

          <!-- Density -->
          <button type="button" data-density class="hidden sm:grid w-11 h-11 rounded-lg place-items-center text-muted hover:bg-surface-3 press" aria-label="Toggle row density" aria-pressed="false" title="Row density">${icon('rows-3', 'w-5 h-5')}</button>
          <!-- Theme -->
          <button type="button" data-theme-btn class="w-11 h-11 rounded-lg grid place-items-center text-muted hover:bg-surface-3 press" aria-label="Toggle dark mode">${icon('moon-star', 'w-5 h-5')}</button>

          <!-- Role switcher: the RBAC matrix drives the nav, so switching re-renders it -->
          <div class="relative">
            <button type="button" data-user class="flex items-center gap-2 h-11 pl-1 pr-1.5 sm:pr-2.5 rounded-lg hover:bg-surface-3 press" aria-haspopup="menu" aria-expanded="false">
              ${avatar(session.name, 'w-8 h-8 text-xs')}
              <span class="hidden sm:block text-left leading-tight min-w-0">
                <span class="block text-base font-medium truncate max-w-32">${esc(session.name)}</span>
                <span class="block text-2xs text-muted truncate">${esc(session.role)}${session.dept !== '—' ? ' · ' + esc(session.dept) : ''}</span>
              </span>
              ${icon('chevron-down', 'w-4 h-4 text-muted hidden sm:block')}
            </button>
            <div data-user-menu hidden role="menu" class="anim-in absolute right-0 top-12 w-64 rounded-xl border border-outline bg-surface-0 shadow-overlay p-1.5 z-overlay">
              <p class="px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">Preview as role</p>
              ${Object.keys(DB.sessions).map((r) => `<button type="button" role="menuitemradio" aria-checked="${r === role}" data-role="${r}"
                class="w-full flex items-center gap-2.5 px-2.5 min-h-11 rounded-lg text-base press ${r === role ? 'bg-primary-container text-primary-container-foreground font-semibold' : 'hover:bg-surface-2'}">
                ${avatar(DB.sessions[r].name, 'w-6 h-6 text-2xs')}<span class="flex-1 text-left">${r}</span>
                ${r === role ? icon('check', 'w-4 h-4') : ''}</button>`).join('')}
              <p class="px-2.5 pt-2 pb-1 text-xs text-muted border-t border-outline mt-1.5">Nav and page actions are derived from the role × module permission matrix, not hard-coded.</p>
            </div>
          </div>
        </header>

        <!-- State preview strip: prove all four states without stacking demo blocks -->
        <div class="shrink-0 border-b border-outline bg-surface-2/60 px-3 sm:px-4 py-1.5 flex items-center gap-2 overflow-x-auto">
          <span class="text-2xs font-semibold uppercase tracking-wide text-subtle shrink-0">Preview state</span>
          <div class="flex items-center gap-0.5 rounded-lg bg-surface-0 border border-outline p-0.5 shrink-0" role="group" aria-label="Preview data state">
            ${['ready', 'loading', 'empty', 'error'].map((s) => `<button type="button" data-state-btn="${s}" aria-pressed="${s === 'ready'}" class="${stateBtnClass(s === 'ready')}">${s}</button>`).join('')}
          </div>
          <span class="text-xs text-muted hidden sm:block shrink-0">Every data region on this page responds.</span>
        </div>

        <main id="main" class="flex-1 min-w-0 bg-background"></main>

        <!-- Mobile bottom nav: 4 primary destinations + More, never nested navigation -->
        <nav aria-label="Primary" class="lg:hidden sticky bottom-0 z-nav shrink-0 bg-surface-1/97 backdrop-blur border-t border-outline pb-safe">
          <ul class="flex" data-bottom></ul>
        </nav>
      </div>
    </div>`);

    // Bottom nav from the same permission-filtered list, capped at 5 items.
    const visible = DB.nav.filter((n) => canSee(role, n.module));
    const primary = visible.slice(0, 4);
    const overflow = visible.slice(4);
    $('[data-bottom]', app).innerHTML = [
      ...primary.map((n) => {
        const href = n.key === 'dashboard' ? DB.dashboardFor[role] : (n.href || (n.children && n.children[0].href));
        const on = n.key === active || (n.children || []).some((k) => k.key === active);
        return `<li class="flex-1"><a ${href ? `href="${href}"` : 'aria-disabled="true"'} ${on ? 'aria-current="page"' : ''}
          class="flex flex-col items-center justify-center gap-0.5 min-h-14 px-1 press ${on ? 'text-primary font-semibold' : 'text-muted'}">
          ${icon(n.icon, 'w-5 h-5')}<span class="text-2xs">${esc(n.label)}</span>
          ${on ? '<span class="absolute" aria-hidden="true"></span>' : ''}</a></li>`;
      }),
      overflow.length ? `<li class="flex-1"><button type="button" data-more class="w-full flex flex-col items-center justify-center gap-0.5 min-h-14 px-1 text-muted press">
        ${icon('more-horizontal', 'w-5 h-5')}<span class="text-2xs">More</span></button></li>` : '',
    ].join('');

    document.body.insertBefore(app, document.body.firstChild);
    if (content) { content.hidden = false; $('#main', app).appendChild(content); }
    else { $('#main', app).innerHTML = ''; }

    /* ---- wiring ---- */
    const themeBtn = $('[data-theme-btn]', app);
    const densityBtn = $('[data-density]', app);
    const syncPrefs = () => {
      const dark = PromaxTheme.theme === 'dark';
      themeBtn.innerHTML = icon(dark ? 'sun' : 'moon-star', 'w-5 h-5');
      themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      if (densityBtn) {
        const compact = PromaxTheme.density === 'compact';
        densityBtn.setAttribute('aria-pressed', String(compact));
        densityBtn.classList.toggle('text-primary', compact);
        densityBtn.title = compact ? 'Density: compact (desktop). Click for comfortable.' : 'Density: comfortable. Click for compact.';
      }
      lucide.createIcons({ nameAttr: 'data-lucide' });
    };
    themeBtn.addEventListener('click', () => { PromaxTheme.toggleTheme(); syncPrefs(); broadcast(); });
    densityBtn?.addEventListener('click', () => { PromaxTheme.toggleDensity(); syncPrefs(); broadcast(); announce(`Density ${PromaxTheme.density}`); });
    const broadcast = () => { try { parent.postMessage({ type: 'promax:prefs', theme: PromaxTheme.themePref, density: PromaxTheme.density }, '*'); } catch {} };

    $$('[data-cmdk]', app).forEach((b) => b.addEventListener('click', commandPalette));
    $('[data-shortcuts]', app)?.addEventListener('click', shortcutSheet);

    // Role menu
    const userBtn = $('[data-user]', app), userMenu = $('[data-user-menu]', app);
    const closeMenu = () => { userMenu.hidden = true; userBtn.setAttribute('aria-expanded', 'false'); };
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenu.hidden = !userMenu.hidden;
      userBtn.setAttribute('aria-expanded', String(!userMenu.hidden));
      if (!userMenu.hidden) $('[data-role]', userMenu)?.focus();
    });
    document.addEventListener('click', (e) => { if (!userMenu.hidden && !userMenu.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !userMenu.hidden) { closeMenu(); userBtn.focus(); } });
    $$('[data-role]', userMenu).forEach((b) => b.addEventListener('click', () => {
      const r = b.dataset.role;
      const target = opts.roleAware === false ? location.pathname : DB.dashboardFor[r];
      const url = new URL(target, location.href);
      url.searchParams.set('role', r);
      location.href = url.toString();
    }));

    // Mobile drawer
    const menuBtn = $('[data-menu]', app);
    menuBtn.addEventListener('click', () => openDrawer(role, active));
    $('[data-more]', app)?.addEventListener('click', () => openDrawer(role, active));

    // State switcher
    $$('[data-state-btn]', app).forEach((b) => b.addEventListener('click', () => setState(b.dataset.stateBtn)));

    // Global keys. Ignore while typing so shortcuts never eat real input.
    let gPending = false;
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); commandPalette(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (overlayStack.length) return;
      if (gPending) {
        gPending = false;
        const dest = { p: '03-patient-list.html', a: '05-appointment-booking.html', b: '08-billing.html', r: '07-record-entry.html', d: DB.dashboardFor[role] }[e.key.toLowerCase()];
        if (dest) { e.preventDefault(); location.href = `${dest}?role=${role}`; }
        return;
      }
      if (e.key === 'g') { gPending = true; setTimeout(() => { gPending = false; }, 1200); return; }
      if (e.key === '?') { e.preventDefault(); shortcutSheet(); }
      else if (e.key === 'd') { PromaxTheme.toggleTheme(); syncPrefs(); broadcast(); }
      else if (e.key === 'D') { PromaxTheme.toggleDensity(); syncPrefs(); broadcast(); }
      else if (['1', '2', '3', '4'].includes(e.key)) { setState(['ready', 'loading', 'empty', 'error'][+e.key - 1]); }
    });

    lucide.createIcons({ nameAttr: 'data-lucide' });
    syncPrefs();
    wireFields(document);
    applyState('ready');
    document.addEventListener('promax:prefs', () => syncPrefs());

    // Stagger the first paint of grid children — 200ms, once, and skipped when
    // the user asks for reduced motion.
    if (!reduceMotion()) {
      $$('[data-stagger] > *').forEach((n, i) => {
        n.style.animation = `fadeUp 220ms cubic-bezier(.2,.7,.3,1) ${Math.min(i * 35, 350)}ms both`;
      });
    }
    return { role, session };
  }

  function openDrawer(role, active) {
    const opener = document.activeElement;
    const scrim = el(`<div class="fixed inset-0 z-scrim lg:hidden anim-scrim" style="background: rgb(var(--scrim) / var(--scrim-alpha))"></div>`);
    const panel = el(`<div class="fixed inset-y-0 left-0 z-overlay w-72 max-w-[85vw] bg-surface-1 border-r border-outline shadow-overlay flex flex-col lg:hidden"
      role="dialog" aria-modal="true" aria-label="Navigation" style="animation: sheetUp 200ms cubic-bezier(.2,.7,.3,1) both">
      <div class="h-14 flex items-center gap-2.5 px-3 border-b border-outline shrink-0">
        <span class="w-8 h-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">${icon('cross', 'w-4.5 h-4.5')}</span>
        <span class="flex-1 text-base font-semibold font-display">Sirkaya Hospital</span>
        <button type="button" data-x class="w-11 h-11 -mr-2 rounded-lg grid place-items-center text-muted hover:bg-surface-3" aria-label="Close navigation">${icon('x', 'w-5 h-5')}</button>
      </div>
      <nav aria-label="All destinations" class="flex-1 overflow-y-auto p-2"><ul class="space-y-0.5">${navHtml(role, active)}</ul></nav>
      <div class="p-2 border-t border-outline pb-safe">
        <a href="01-signin.html" class="flex items-center gap-2.5 rounded-lg px-2.5 min-h-12 text-base text-danger hover:bg-danger-container">${icon('log-out', 'w-4.5 h-4.5')}<span>Sign out</span></a>
      </div>
    </div>`);
    document.body.append(scrim, panel);
    document.body.style.overflow = 'hidden';
    lucide.createIcons({ nameAttr: 'data-lucide' });
    const close = () => { scrim.remove(); panel.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey, true); opener?.focus?.(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    scrim.addEventListener('click', close);
    $('[data-x]', panel).addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
    $('a,button', panel)?.focus();
  }

  /* ───────────────────────── Small composition helpers ───────────────────────── */
  const card = (inner, cls = '') => `<section class="card ${cls}">${inner}</section>`;

  const cardHead = ({ title, meta, action, icon: ic }) => `
    <div class="flex items-start justify-between gap-3 mb-3">
      <div class="min-w-0">
        <h2 class="text-lg font-semibold font-display flex items-center gap-2 min-w-0">${ic ? `<span class="text-muted shrink-0">${icon(ic, 'w-4.5 h-4.5')}</span>` : ''}<span class="truncate">${esc(title)}</span></h2>
        ${meta ? `<p class="text-xs text-muted mt-0.5">${meta}</p>` : ''}
      </div>
      ${action ? `<div class="shrink-0 flex items-center gap-1.5">${action}</div>` : ''}
    </div>`;

  /** Dense KPI tile with a sparkline and an explicit trend direction (icon + sign). */
  const metric = ({ label, value, unit, delta, deltaLabel, spark, tone = 'neutral', icon: ic }) => {
    const up = delta != null && delta >= 0;
    const good = tone === 'inverse' ? !up : up;
    return `<div class="card !p-3.5 flex flex-col gap-2 min-w-0">
      <div class="flex items-center gap-2 min-w-0">
        ${ic ? `<span class="w-7 h-7 shrink-0 rounded-md bg-surface-2 border border-outline grid place-items-center text-muted">${icon(ic, 'w-4 h-4')}</span>` : ''}
        <span class="text-xs font-medium text-muted truncate">${esc(label)}</span>
      </div>
      <div class="flex items-end gap-1.5 flex-wrap">
        <span class="num text-3xl font-bold leading-none tracking-tight">${esc(value)}</span>
        ${unit ? `<span class="text-xs text-muted mb-0.5">${esc(unit)}</span>` : ''}
      </div>
      <div class="flex items-center justify-between gap-2 min-w-0">
        ${delta != null ? `<span class="inline-flex items-center gap-0.5 text-xs font-semibold ${good ? 'text-success' : 'text-danger'}">
          ${icon(up ? 'trending-up' : 'trending-down', 'w-3.5 h-3.5')}<span class="num">${up ? '+' : ''}${delta}%</span></span>
          <span class="text-2xs text-subtle truncate">${esc(deltaLabel || 'vs last week')}</span>` : `<span class="text-2xs text-subtle truncate">${esc(deltaLabel || '')}</span>`}
      </div>
      ${spark ? `<div class="-mx-1 -mb-1">${spark}</div>` : ''}
    </div>`;
  };

  /** Bar of filter chips that behave like real toggle buttons. */
  const filterChip = ({ label, count, active, key }) => `<button type="button" data-filter="${esc(key)}" aria-pressed="${!!active}"
    class="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-base font-medium press whitespace-nowrap ${active ? 'bg-primary text-primary-foreground border-transparent' : 'bg-surface-0 text-foreground border-outline hover:bg-surface-2'}">
    <span>${esc(label)}</span>${count != null ? `<span class="num text-2xs px-1.5 py-0.5 rounded-full ${active ? 'bg-primary-foreground/20' : 'bg-surface-3'}">${count}</span>` : ''}</button>`;

  const breadcrumb = (trail) => `<nav aria-label="Breadcrumb" class="mb-3">
    <ol class="flex items-center gap-1 text-xs text-muted flex-wrap">
      ${trail.map((t, i) => `<li class="flex items-center gap-1">${i ? icon('chevron-right', 'w-3 h-3 text-subtle') : ''}
        ${t.href ? `<a href="${t.href}" class="hover:text-foreground hover:underline underline-offset-2">${esc(t.label)}</a>` : `<span class="text-foreground font-medium" aria-current="page">${esc(t.label)}</span>`}</li>`).join('')}
    </ol></nav>`;

  const pageHead = ({ title, meta, actions }) => `
    <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div class="min-w-0">
        <h2 class="text-2xl font-semibold font-display leading-tight">${esc(title)}</h2>
        ${meta ? `<p class="text-base text-muted mt-1">${meta}</p>` : ''}
      </div>
      ${actions ? `<div class="flex flex-wrap items-center gap-2">${actions}</div>` : ''}
    </div>`;

  /** Alert banner — cause plus recovery path, never a bare "error". */
  const banner = ({ tone = 'info', title, body, actions, dismissible = true }) => {
    const map = { info: ['info', 'border-info/40 bg-info-container text-info-container-foreground'], warning: ['alert-triangle', 'border-warning/40 bg-warning-container text-warning-container-foreground'], danger: ['alert-octagon', 'border-danger/50 bg-danger-container text-danger-container-foreground'], success: ['check-circle-2', 'border-success/40 bg-success-container text-success-container-foreground'] }[tone];
    return `<div role="${tone === 'danger' ? 'alert' : 'status'}" class="flex items-start gap-3 rounded-xl border p-3.5 ${map[1]}">
      <span class="shrink-0 mt-0.5">${icon(map[0], 'w-4.5 h-4.5')}</span>
      <div class="flex-1 min-w-0">
        <p class="text-base font-semibold">${esc(title)}</p>
        ${body ? `<p class="text-base mt-0.5 leading-relaxed opacity-90">${body}</p>` : ''}
        ${actions ? `<div class="mt-2.5 flex flex-wrap gap-2">${actions}</div>` : ''}
      </div>
      ${dismissible ? `<button type="button" onclick="this.closest('[role]').remove()" class="shrink-0 w-8 h-8 -mr-1 -mt-1 rounded-lg grid place-items-center hover:bg-black/5 dark:hover:bg-white/10" aria-label="Dismiss">${icon('x', 'w-4 h-4')}</button>` : ''}
    </div>`;
  };

  /** Horizontal capacity meter — value is on the label, not only in the bar length. */
  const meter = ({ label, value, max, tone = 'primary', sub }) => {
    const p = Math.round((value / max) * 100);
    const t = p >= 100 ? 'danger' : p >= 90 ? 'warning' : tone;
    return `<div>
      <div class="flex items-baseline justify-between gap-2 mb-1.5">
        <span class="text-base font-medium truncate">${esc(label)}</span>
        <span class="num text-xs text-muted shrink-0">${value}/${max} · ${p}%</span>
      </div>
      <div class="h-2 rounded-full bg-surface-3 overflow-hidden" role="meter" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="${max}" aria-label="${esc(label)} occupancy">
        <div class="h-full rounded-full bg-${t}" style="width:${Math.min(p, 100)}%"></div>
      </div>
      ${sub ? `<p class="text-2xs text-subtle mt-1">${esc(sub)}</p>` : ''}
    </div>`;
  };

  const wrap = (inner) => `<div class="mx-auto max-w-[1400px] w-full px-3 sm:px-4 lg:px-6 py-4 lg:py-5">${inner}</div>`;

  /**
   * Retry is delegated once, at the document, rather than wired per error block.
   * Error states are generated in a dozen places (tables, widgets, page regions) and
   * every one of them needs a Retry that actually does something.
   */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-retry]');
    if (!btn) return;
    const done = submitting(btn, 'Retrying…');
    setTimeout(() => {
      done();
      setState('ready');
      toast('Service reconnected — data reloaded.', { tone: 'success' });
    }, 900);
  });

  /**
   * Configurable widget grid, shared by all four role dashboards.
   *
   * Implements the PRD's three-layer resolution: role defaults, per-user layout,
   * and admin locks that win. Reordering works by drag AND by focusing a handle
   * and pressing the arrow keys, because drag-only is not an accessible control.
   *
   * @param mount   selector or element to render into
   * @param cfg     { widgets: [{key,name,icon,locked,span,body()}], onChange?() }
   */
  function dashboard(mount, cfg) {
    const host = typeof mount === 'string' ? $(mount) : mount;
    if (!host) return null;
    let order = cfg.widgets.map((w) => w.key);
    const byKey = (k) => cfg.widgets.find((w) => w.key === k);

    function card_(k) {
      const w = byKey(k);
      return `<section data-widget="${k}" draggable="true" aria-roledescription="Draggable widget" aria-label="${esc(w.name)}"
        class="card !p-0 overflow-hidden flex flex-col ${w.span || ''}">
        <header class="flex items-center gap-2 px-3.5 py-2.5 border-b border-outline bg-surface-1">
          <button type="button" data-handle
            class="w-8 h-8 -ml-1 shrink-0 rounded-md grid place-items-center text-subtle hover:bg-surface-3 cursor-grab active:cursor-grabbing press"
            aria-label="Reorder ${esc(w.name)}. Use the left and right arrow keys to move it."
            title="Drag, or focus and press ← →">${icon('grip-vertical', 'w-4 h-4')}</button>
          <h3 class="flex-1 min-w-0 text-base font-semibold font-display truncate flex items-center gap-1.5">
            ${icon(w.icon, 'w-4 h-4 text-muted shrink-0')}<span class="truncate">${esc(w.name)}</span></h3>
          ${w.meta ? `<span class="shrink-0 text-2xs text-muted num hidden sm:inline">${w.meta}</span>` : ''}
          ${w.locked ? `<span class="shrink-0 inline-flex items-center gap-1 text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-surface-3 text-muted" title="Locked by Admin — you cannot remove this widget">
            ${icon('lock', 'w-3 h-3')}Locked</span>` : ''}
          <button type="button" data-rm="${k}" ${w.locked ? 'disabled' : ''}
            class="w-8 h-8 -mr-1 shrink-0 rounded-md grid place-items-center text-subtle hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed press"
            aria-label="${w.locked ? esc(w.name) + ' is locked by Admin and cannot be removed' : 'Remove ' + esc(w.name) + ' from my dashboard'}">${icon('x', 'w-4 h-4')}</button>
        </header>
        <div class="p-3.5 flex-1 min-w-0" data-widget-body="${k}">${w.body ? w.body() : ''}</div>
      </section>`;
    }

    function render() {
      host.innerHTML = order.map(card_).join('');
      lucide.createIcons({ nameAttr: 'data-lucide' });
      cfg.onChange && cfg.onChange(order);
      if (window.Charts) Charts.wire(host);
      applyState(currentState, host);
      wire();
    }

    function move(k, delta) {
      const i = order.indexOf(k), j = i + delta;
      if (i < 0 || j < 0 || j >= order.length) return;
      order.splice(j, 0, order.splice(i, 1)[0]);
      render();
      $(`[data-widget="${k}"] [data-handle]`, host)?.focus();
      announce(`${byKey(k).name} moved to position ${j + 1} of ${order.length}`);
    }

    function wire() {
      let dragKey = null;
      $$('[data-widget]', host).forEach((node) => {
        node.addEventListener('dragstart', (e) => { dragKey = node.dataset.widget; node.style.opacity = '0.45'; e.dataTransfer.effectAllowed = 'move'; });
        node.addEventListener('dragend', () => { node.style.opacity = ''; dragKey = null; });
        node.addEventListener('dragover', (e) => { e.preventDefault(); node.classList.add('ring-2', 'ring-primary'); });
        node.addEventListener('dragleave', () => node.classList.remove('ring-2', 'ring-primary'));
        node.addEventListener('drop', (e) => {
          e.preventDefault();
          node.classList.remove('ring-2', 'ring-primary');
          const target = node.dataset.widget;
          if (!dragKey || dragKey === target) return;
          order.splice(order.indexOf(target), 0, order.splice(order.indexOf(dragKey), 1)[0]);
          render();
          toast('Dashboard layout saved.', { tone: 'success', detail: 'Your layout follows you to any device.' });
        });
      });
      $$('[data-handle]', host).forEach((h) => h.addEventListener('keydown', (e) => {
        const k = h.closest('[data-widget]').dataset.widget;
        if (e.key === 'ArrowLeft') { e.preventDefault(); move(k, -1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); move(k, 1); }
      }));
      $$('[data-rm]', host).forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.rm, at = order.indexOf(k);
        order = order.filter((x) => x !== k);
        render();
        toast(`${byKey(k).name} removed from your dashboard.`, {
          tone: 'neutral',
          undo: () => { order.splice(at, 0, k); render(); toast(`${byKey(k).name} restored.`, { tone: 'success' }); },
        });
      }));
    }

    render();
    return { render, get order() { return order.slice(); } };
  }

  return {
    $, $$, esc, el, icon, uid, chip, acuityBadge, avatar, STATUS, ACUITY, TONE_CHIP,
    toast, announce, dialog, confirmDialog, btnClass, button, field, wireFields,
    validateField, validateForm, setFieldError, submitting, emptyState, errorState,
    skeletonRows, table, setState, applyState, commandPalette, shortcutSheet, shell,
    card, cardHead, metric, filterChip, breadcrumb, pageHead, banner, meter, wrap, canSee,
    dashboard,
  };
})();
