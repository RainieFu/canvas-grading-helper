'use strict';

const status = document.getElementById('status');
const detail = document.getElementById('detail');
const buttons = [...document.querySelectorAll('button')];
const setBusy = state => buttons.forEach(b => { b.disabled = state; });

const isSpeedGrader = url => /^https:\/\/canvas\.ubc\.ca\/courses\/\d+\/gradebook\/speed_grader(?:[/?#]|$)/.test(url || '');

async function action(mode) {
  setBusy(true);
  detail.textContent = '';
  status.textContent = mode === 'save' ? 'Clicking Canvas Update Scores…' : 'Checking SpeedGrader…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isSpeedGrader(tab.url)) {
      status.textContent = 'Open a UBC Canvas SpeedGrader tab first.';
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [mode],
      func: mode => {
        function search(doc, depth = 0) {
          const target = doc.querySelector('button.update-scores[type="submit"]') ||
            [...doc.querySelectorAll('button, input[type="submit"]')].find(el => /update\s+scores/i.test(el.textContent || el.value || ''));
          if (target) return { target, doc, depth };
          if (depth > 5) return null;
          for (const iframe of doc.querySelectorAll('iframe')) {
            try {
              if (iframe.contentDocument) {
                const result = search(iframe.contentDocument, depth + 1);
                if (result) return result;
              }
            } catch (_) { /* Inaccessible frame; not needed for this quiz. */ }
          }
          return null;
        }

        const found = search(document);
        if (!found) return { ok: false, message: 'Could not find Update Scores. Make sure the quiz panel has loaded.' };
        const { target, depth } = found;
        const next = document.querySelector('#next-student-button');
        if (mode === 'scroll') {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Ensure that any enclosing frame remains visible.
          let win = target.ownerDocument.defaultView;
          while (win && win !== win.parent) {
            try { win.frameElement?.scrollIntoView({ block: 'nearest' }); win = win.parent; }
            catch (_) { break; }
          }
          return { ok: true, message: 'Scrolled to Update Scores.' };
        }
        if (mode === 'inspect') {
          const form = target.form || target.closest('form');
          const rawPath = form?.action ? new URL(form.action, location.href).pathname : '(none)';
          const sanitizedPath = rawPath.replace(/\/\d+(?=\/|$)/g, '/:id');
          return {
            ok: true,
            message: 'Both controls located.' ,
            info: {
              updateButtonFound: true,
              updateButtonFrameDepth: depth,
              updateButtonEnabled: !target.disabled,
              updateButtonFormMethod: form?.method || '(no enclosing form)',
              formPathPattern: sanitizedPath,
              nextStudentButtonFoundInMainPage: !!next,
              nextStudentButtonEnabled: next ? !next.disabled : null
            }
          };
        }
        if (mode === 'save') {
          if (target.disabled) return { ok: false, message: 'Update Scores is disabled. No action taken.' };
          target.click();
          return { ok: true, message: 'Clicked Canvas Update Scores. Verify its success confirmation or saved score before advancing.' };
        }
        return { ok: false, message: 'Unknown action.' };
      }
    });

    const result = results?.[0]?.result;
    status.textContent = result?.message || 'No result from the page.';
    if (result?.info) detail.textContent = JSON.stringify(result.info, null, 2);
  } catch (err) {
    status.textContent = `Could not access this tab: ${err?.message || 'Unknown error'}`;
  } finally {
    setBusy(false);
  }
}

document.getElementById('scroll-btn').addEventListener('click', () => action('scroll'));
document.getElementById('save-btn').addEventListener('click', () => action('save'));
document.getElementById('inspect-btn').addEventListener('click', () => action('inspect'));
