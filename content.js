(() => {
  'use strict';

  // The background worker may reinject this file when the icon is clicked.
  if (globalThis.__cghFloatingPanelController) return;

  const SPEEDGRADER_URL = /^https:\/\/canvas\.ubc\.ca\/courses\/\d+\/gradebook\/speed_grader(?:[/?#]|$)/;
  const HOST_ID = 'canvas-grading-helper-floating-panel';
  const SAVE_TIMEOUT_MS = 25000;

  let host = null;
  let shadow = null;
  let busy = false;
  let savedPosition = null;
  let dragCleanup = null;

  function validPage() { return SPEEDGRADER_URL.test(location.href); }
  function $(selector) { return shadow?.querySelector(selector); }

  function status(text, tone = '') {
    const target = $('[data-role="status"]');
    if (!target) return;
    target.textContent = text;
    target.dataset.tone = tone;
  }

  function setBusy(value) {
    busy = value;
    if (!shadow) return;
    shadow.querySelectorAll('button').forEach(button => {
      button.disabled = value;
    });
    const card = $('[data-role="card"]');
    if (card) card.setAttribute('aria-busy', String(value));
  }

  function clampPosition(left, top) {
    const rect = host?.getBoundingClientRect();
    const width = rect?.width || 300;
    const height = rect?.height || 300;
    return {
      left: Math.max(8, Math.min(left, Math.max(8, innerWidth - width - 8))),
      top: Math.max(8, Math.min(top, Math.max(8, innerHeight - height - 8)))
    };
  }

  function positionPanel(p) {
    if (!host || !p || !Number.isFinite(p.left) || !Number.isFinite(p.top)) return;
    const clamped = clampPosition(p.left, p.top);
    host.style.right = 'auto';
    host.style.left = `${clamped.left}px`;
    host.style.top = `${clamped.top}px`;
    savedPosition = clamped;
  }

  function savePosition() {
    if (!savedPosition) return;
    chrome.runtime.sendMessage({ type: 'CGH_SAVE_POSITION', position: savedPosition }).catch(() => {});
  }

  function startDragging(event) {
    if (event.button !== 0 || busy) return;
    if (!host) return;
    event.preventDefault();
    const start = host.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;

    const move = e => positionPanel({
      left: start.left + e.clientX - x,
      top: start.top + e.clientY - y
    });
    const finish = () => {
      if (dragCleanup) dragCleanup();
      savePosition();
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
      dragCleanup = null;
    };
    dragCleanup = cleanup;
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
  }

  function findUpdateButton(doc = document, depth = 0) {
    const button = doc.querySelector('button.update-scores[type="submit"]') ||
      [...doc.querySelectorAll('button, input[type="submit"]')]
        .find(el => /update\s+scores/i.test(el.textContent || el.value || ''));
    if (button) return { button, depth };
    if (depth >= 5) return null;
    for (const frame of doc.querySelectorAll('iframe')) {
      try {
        if (!frame.contentDocument) continue;
        const result = findUpdateButton(frame.contentDocument, depth + 1);
        if (result) return result;
      } catch (_) { /* A cross-origin iframe isn't accessible. */ }
    }
    return null;
  }

  function scrollToUpdate() {
    if (!validPage()) return status('Open a UBC Canvas SpeedGrader quiz page first.', 'warning');
    const found = findUpdateButton();
    if (!found) return status('Update Scores was not found. Is the quiz fully loaded?', 'warning');
    found.button.scrollIntoView({ behavior: 'smooth', block: 'center' });
    let win = found.button.ownerDocument.defaultView;
    while (win && win !== win.parent) {
      try {
        win.frameElement?.scrollIntoView({ block: 'nearest' });
        win = win.parent;
      } catch (_) { break; }
    }
    status('Scrolled to Update Scores.', 'success');
  }

  function inspectButtons() {
    if (!validPage()) return status('Open UBC Canvas SpeedGrader first.', 'warning');
    const found = findUpdateButton();
    const next = document.querySelector('#next-student-button');
    const form = found?.button.form || found?.button.closest('form');
    const formPath = form?.action ? new URL(form.action, location.href).pathname : '';
    const safePath = p => p.replace(/\/\d+(?=\/|$)/g, '/:id');
    const info = {
      updateButtonFound: !!found,
      updateButtonEnabled: found ? !found.button.disabled : null,
      updateButtonFrameDepth: found?.depth ?? null,
      updateButtonFormMethod: form?.method || null,
      formPathPattern: safePath(formPath),
      nextStudentButtonFound: !!next,
      nextStudentButtonEnabled: next ? !next.disabled : null
    };
    const infoEl = $('[data-role="details"]');
    infoEl.textContent = JSON.stringify(info, null, 2);
    infoEl.hidden = false;
    status('Inspected the buttons. No grades changed.', 'success');
  }

  async function saveAndMaybeNext(advance) {
    if (busy) return;
    if (!validPage()) return status('This is not a UBC Canvas SpeedGrader page.', 'warning');
    const found = findUpdateButton();
    if (!found) return status('Update Scores was not found. No save attempted.', 'warning');
    const button = found.button;
    const form = button.form || button.closest('form');
    let formUrl;
    try { formUrl = form?.action ? new URL(form.action, location.href) : null; }
    catch (_) { /* Handled below. */ }
    const endpoint = formUrl?.pathname.match(/^\/courses\/(\d+)\/quizzes\/(\d+)\/submissions\/(\d+)\/?$/);
    if (!form || !endpoint || form.method.toLowerCase() !== 'post' || formUrl.origin !== location.origin) {
      return status('Unexpected quiz grading form. No save attempted.', 'warning');
    }
    if (button.disabled || !button.isConnected) {
      return status('Update Scores is unavailable. No save attempted.', 'warning');
    }
    const frame = button.ownerDocument.defaultView?.frameElement;
    if (!frame || frame.tagName !== 'IFRAME') {
      return status('Expected an embedded quiz iframe. No save attempted.', 'warning');
    }
    const next = document.querySelector('#next-student-button');
    if (advance && (!next || next.disabled || !next.isConnected)) {
      return status('Next Student is unavailable. Nothing submitted; try Save & Verify.', 'warning');
    }

    const [courseId, quizId] = [endpoint[1], endpoint[2]];
    const originalTopUrl = location.href;
    const originalFrameSrc = frame.getAttribute('src');

    const confirmedUrl = () => {
      try {
        const url = new URL(frame.contentWindow.location.href);
        return url.origin === location.origin &&
          url.pathname.replace(/\/$/, '') === `/courses/${courseId}/quizzes/${quizId}/history` &&
          url.searchParams.get('score_updated') === '1';
      } catch (_) { return false; }
    };

    setBusy(true);
    status('Saving with Canvas’s Update Scores button…', '');
    $('[data-role="details"]').hidden = true;
    try {
      const outcome = await new Promise(resolve => {
        let completed = false;
        let timeout;
        const done = result => {
          if (completed) return;
          completed = true;
          frame.removeEventListener('load', onLoad);
          clearTimeout(timeout);
          resolve(result);
        };
        const onLoad = () => {
          if (confirmedUrl()) done({ confirmed: true });
        };
        // Attach the listener *before* submitting Canvas's own form.
        frame.addEventListener('load', onLoad);
        timeout = setTimeout(() => done({ confirmed: false }), SAVE_TIMEOUT_MS);
        try { button.click(); }
        catch (_) { done({ confirmed: false, clickError: true }); }
      });

      if (!outcome.confirmed) {
        return status(outcome.clickError
          ? 'Could not click Update Scores. Check Canvas before navigating.'
          : 'Save confirmation not found. Staying on this student; check Canvas before retrying.', 'warning');
      }
      if (!advance) return status('Save confirmed by Canvas (score_updated=1). Stayed on this student.', 'success');

      // Avoid moving onward if the grader changed the submission meanwhile.
      if (location.href !== originalTopUrl || !frame.isConnected ||
          frame.getAttribute('src') !== originalFrameSrc || !host?.isConnected) {
        return status('Save confirmed, but the page changed. Did not click Next Student.', 'warning');
      }
      const currentNext = document.querySelector('#next-student-button');
      if (!currentNext || currentNext.disabled || !currentNext.isConnected) {
        return status('Save confirmed, but Next Student is unavailable. Stayed on this student.', 'warning');
      }
      currentNext.click();
      status('Save confirmed by Canvas. Clicked Next Student. Check that the new submission loads.', 'success');
    } catch (_) {
      status('Could not verify the save. Check Canvas before changing students.', 'warning');
    } finally {
      setBusy(false);
    }
  }

  function closePanel() {
    if (busy) return status('A save is in progress. The panel will stay open until it finishes.', 'warning');
    hidePanel();
    chrome.runtime.sendMessage({ type: 'CGH_CLOSE_PANEL' }).catch(() => {});
  }

  function hidePanel() {
    if (dragCleanup) dragCleanup();
    host?.remove();
    host = null;
    shadow = null;
  }

  function createPanel() {
    if (host?.isConnected) return;
    if (!document.documentElement) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'position:fixed;top:108px;right:18px;z-index:2147483646;';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; position: fixed; z-index: 2147483646; width: 302px; font-family: system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color: #192538; }
        * { box-sizing: border-box; }
        .card { background: #fff; color: #192538; border: 1px solid #cbd5e1; border-radius: 13px; box-shadow: 0 12px 35px rgba(23,35,55,.22); overflow: hidden; font-size: 13px; line-height: 1.4; }
        .header { background: #f6f8fb; padding: 11px 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #dbe3ed; }
        .drag { flex: 1; cursor: grab; touch-action: none; user-select: none; padding: 1px 0; }
        .drag:active { cursor: grabbing; }
        .title { font-weight: 750; font-size: 14px; }
        .version { margin-left: 5px; color: #64748b; font-weight: 500; font-size: 10px; }
        .subtitle { color: #64748b; font-size: 11px; margin-top: 2px; }
        .close { border: 1px solid transparent; border-radius: 6px; background: transparent; color: #475569; font-size: 20px; width: 29px; height: 29px; padding: 0; cursor: pointer; }
        .body { padding: 12px; }
        button { font: inherit; }
        .action { display: block; width: 100%; text-align: left; font-weight: 650; padding: 10px 11px; margin: 0 0 8px; border: 1px solid #ccd6e2; border-radius: 8px; background: #f4f7fc; color: #213d6b; cursor: pointer; }
        .action.next { background: #126256; color: #fff; border-color: #126256; }
        .action:hover:not(:disabled), .close:hover:not(:disabled) { filter: brightness(.95); }
        button:focus-visible { outline: 3px solid #f0bb43; outline-offset: 2px; }
        button:disabled { opacity: .55; cursor: not-allowed; }
        .status { font-size: 11px; padding: 9px 10px; background: #eef3f8; color: #334155; border-radius: 7px; overflow-wrap: anywhere; }
        .status[data-tone="success"] { background: #e9f7f1; color: #155540; }
        .status[data-tone="warning"] { background: #fff1e0; color: #854c19; }
        .footer { margin-top: 9px; display: flex; justify-content: space-between; align-items: center; }
        .inspect { background: transparent; border: 0; color: #48618b; cursor: pointer; font-size: 11px; text-decoration: underline; padding: 4px; }
        .tip { font-size: 10px; color: #64748b; }
        pre { font: 10px/1.45 ui-monospace,SFMono-Regular,monospace; white-space: pre-wrap; word-break: break-word; max-height: 150px; overflow: auto; background: #f5f6f8; border-radius: 6px; padding: 8px; }
        [hidden] { display: none !important; }
      </style>
      <section class="card" data-role="card" role="region" aria-label="Canvas Grading Helper">
        <header class="header">
          <div class="drag" data-role="drag" title="Drag to move this panel">
            <div class="title">Canvas Grading Helper <span class="version">v0.4</span></div>
            <div class="subtitle">Drag here to move · Classic Quizzes</div>
          </div>
          <button class="close" type="button" data-role="close" aria-label="Close floating panel" title="Close">×</button>
        </header>
        <div class="body">
          <button class="action" type="button" data-role="scroll">↓ Scroll to Update Scores</button>
          <button class="action" type="button" data-role="verify">✓ Save & Verify</button>
          <button class="action next" type="button" data-role="next">→ Save & Next Student</button>
          <div class="status" data-role="status" role="status" aria-live="polite">Ready. Save actions use Canvas’s own Update Scores button.</div>
          <div class="footer">
            <button class="inspect" type="button" data-role="inspect">Inspect buttons</button>
            <span class="tip">No external grade storage</span>
          </div>
          <pre data-role="details" hidden></pre>
        </div>
      </section>`;
    document.documentElement.appendChild(host);

    // Prevent the floating controls' clicks from being handled by Canvas.
    shadow.addEventListener('click', e => e.stopPropagation());
    $('[data-role="drag"]').addEventListener('pointerdown', startDragging);
    $('[data-role="close"]').addEventListener('click', closePanel);
    $('[data-role="scroll"]').addEventListener('click', scrollToUpdate);
    $('[data-role="verify"]').addEventListener('click', () => saveAndMaybeNext(false));
    $('[data-role="next"]').addEventListener('click', () => saveAndMaybeNext(true));
    $('[data-role="inspect"]').addEventListener('click', inspectButtons);
  }

  function showPanel(position) {
    if (!validPage()) return false;
    if (!host?.isConnected) createPanel();
    if (position) positionPanel(position);
    return !!host?.isConnected;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'CGH_SET_VISIBILITY') return false;
    if (message.visible) {
      sendResponse({ visible: showPanel(message.position) });
    } else if (busy) {
      status('A save is in progress. Wait for confirmation before hiding the panel.', 'warning');
      sendResponse({ visible: true, reason: 'busy' });
    } else {
      hidePanel();
      sendResponse({ visible: false });
    }
    return false;
  });

  // Handle viewport resizing while keeping the floating panel inside the page.
  window.addEventListener('resize', () => {
    if (host && savedPosition) positionPanel(savedPosition);
  });

  globalThis.__cghFloatingPanelController = true;
})();
