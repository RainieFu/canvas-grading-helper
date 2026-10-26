'use strict';

const statusEl = document.getElementById('status');
const detailEl = document.getElementById('detail');
const buttons = [...document.querySelectorAll('button')];
const isSpeedGrader = url => /^https:\/\/canvas\.ubc\.ca\/courses\/\d+\/gradebook\/speed_grader(?:[/?#]|$)/.test(url || '');

function setStatus(message, kind = '') {
  statusEl.textContent = message;
  statusEl.className = kind;
}

async function run(mode) {
  buttons.forEach(btn => { btn.disabled = true; });
  detailEl.textContent = '';
  setStatus(mode === 'next' ? 'Submitting the quiz grading to Canvas and checking for a save confirmation…'
    : mode === 'verify' ? 'Submitting and checking for a save confirmation…'
      : 'Looking for the quiz grading controls…');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isSpeedGrader(tab.url)) {
      setStatus('Open a UBC Canvas SpeedGrader tab first.', 'warning');
      return;
    }

    // Runs in the top-level document. Its access to the same-origin quiz iframe
    // was confirmed on the user's UBC Canvas page. No Canvas API calls are made.
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [mode],
      func: async mode => {
        function searchForButton(doc, depth = 0) {
          const target = doc.querySelector('button.update-scores[type="submit"]') ||
            [...doc.querySelectorAll('button, input[type="submit"]')]
              .find(el => /update\s+scores/i.test(el.textContent || el.value || ''));
          if (target) return { target, depth };
          if (depth >= 5) return null;
          for (const iframe of doc.querySelectorAll('iframe')) {
            try {
              if (iframe.contentDocument) {
                const found = searchForButton(iframe.contentDocument, depth + 1);
                if (found) return found;
              }
            } catch (_) { /* A frame may be cross-origin. */ }
          }
          return null;
        }

        function failure(message, code = 'other') {
          return { ok: false, code, message };
        }

        const found = searchForButton(document);
        if (!found) return failure('Update Scores was not found. Check that the quiz panel finished loading.', 'not_found');
        const { target, depth } = found;
        const next = document.querySelector('#next-student-button');
        const form = target.form || target.closest('form');
        const formUrl = form?.action ? new URL(form.action, location.href) : null;
        const formPath = formUrl?.pathname || '';
        const saveEndpoint = formPath.match(/^\/courses\/(\d+)\/quizzes\/(\d+)\/submissions\/(\d+)\/?$/);

        if (mode === 'scroll') {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          let win = target.ownerDocument.defaultView;
          while (win && win !== win.parent) {
            try {
              win.frameElement?.scrollIntoView({ block: 'nearest' });
              win = win.parent;
            } catch (_) { break; }
          }
          return { ok: true, message: 'Scrolled to Update Scores.' };
        }

        if (mode === 'inspect') {
          const sanitizedPath = formPath.replace(/\/\d+(?=\/|$)/g, '/:id');
          let frameUrlPattern = '(none)';
          try {
            const frame = target.ownerDocument.defaultView.frameElement;
            const currentPath = new URL(frame?.contentWindow?.location.href || location.href).pathname;
            frameUrlPattern = currentPath.replace(/\/\d+(?=\/|$)/g, '/:id');
          } catch (_) { frameUrlPattern = '(inaccessible)'; }
          return {
            ok: true,
            message: 'Located quiz controls. No changes made.',
            info: {
              updateButtonFound: true,
              updateButtonEnabled: !target.disabled,
              updateButtonFrameDepth: depth,
              updateButtonFormMethod: form?.method || '(no form)',
              formPathPattern: sanitizedPath,
              formMatchesClassicQuiz: !!saveEndpoint,
              quizFramePathPattern: frameUrlPattern,
              nextStudentButtonFound: !!next,
              nextStudentButtonEnabled: next ? !next.disabled : null
            }
          };
        }

        if (mode !== 'verify' && mode !== 'next') return failure('Unknown action.');
        if (!form || !saveEndpoint || form.method.toLowerCase() !== 'post') {
          return failure('This is not the expected Classic Quizzes scoring form. No save attempted.', 'unsupported_form');
        }
        if (formUrl.origin !== location.origin) {
          return failure('Save form points to another origin. No save attempted.', 'unsupported_form');
        }
        if (target.disabled || !target.isConnected) return failure('Update Scores is unavailable. Nothing was submitted.', 'disabled');

        const quizFrame = target.ownerDocument.defaultView?.frameElement;
        // Only handle an embedded quiz so we can observe the server's redirect
        // without losing our controller script in a top-frame navigation.
        if (!quizFrame || quizFrame.tagName !== 'IFRAME') {
          return failure('The quiz is not in the expected iframe. No save attempted.', 'unsupported_frame');
        }
        if (mode === 'next' && (!next || next.disabled || !next.isConnected)) {
          return failure('Next Student is unavailable. Use Save & Verify to save without advancing.', 'next_unavailable');
        }

        const [courseId, quizId] = [saveEndpoint[1], saveEndpoint[2]];
        const originalTopUrl = location.href;
        const verifySuccessUrl = () => {
          try {
            const url = new URL(quizFrame.contentWindow.location.href);
            return url.origin === location.origin &&
              url.pathname.replace(/\/$/, '') === `/courses/${courseId}/quizzes/${quizId}/history` &&
              url.searchParams.get('score_updated') === '1';
          } catch (_) { return false; }
        };

        // Canvas Classic Quizzes' headless POST redirects to quiz history with
        // score_updated=1 after its update controller processes the scores.
        // A click alone, arbitrary sleep, or ordinary iframe reload is NOT
        // considered proof that the save succeeded.
        const result = await new Promise(resolve => {
          let finished = false;
          let timer;
          const finish = value => {
            if (finished) return;
            finished = true;
            quizFrame.removeEventListener('load', onFrameLoad);
            clearTimeout(timer);
            resolve(value);
          };
          const onFrameLoad = () => {
            if (verifySuccessUrl()) {
              finish({ confirmed: true });
            }
          };
          quizFrame.addEventListener('load', onFrameLoad);
          timer = setTimeout(() => {
            finish({ confirmed: false });
          }, 25000);
          try {
            target.click();
          } catch (err) {
            finish({ confirmed: false, clickError: true });
          }
        });

        if (!result.confirmed) {
          return failure(
            result.clickError
              ? 'Canvas Update Scores could not be clicked. No navigation attempted.'
              : 'Save confirmation was not detected. Staying on this student. Check the score and comments manually before moving on.',
            'unconfirmed'
          );
        }
        if (mode === 'verify') {
          return { ok: true, confirmed: true, message: 'Save confirmed by Canvas (score_updated=1). Stayed on this student.' };
        }

        // Re-check the active submission and button before clicking Next.
        if (location.href !== originalTopUrl) {
          return failure('Save confirmed, but SpeedGrader changed students during the save. Did not click Next.', 'page_changed');
        }
        const currentNext = document.querySelector('#next-student-button');
        if (!currentNext || currentNext.disabled || !currentNext.isConnected) {
          return failure('Save confirmed, but Next Student is now unavailable. Stayed on this student.', 'next_unavailable');
        }
        currentNext.click();
        return {
          ok: true,
          confirmed: true,
          message: 'Save confirmed by Canvas. Clicked Next Student. Check that the next submission loads correctly.'
        };
      }
    });

    const result = results?.[0]?.result;
    if (!result) {
      setStatus('No response from the page. Check Canvas before navigating away.', 'warning');
      return;
    }
    setStatus(result.message, result.ok ? 'success' : 'warning');
    if (result.info) detailEl.textContent = JSON.stringify(result.info, null, 2);
  } catch (err) {
    setStatus(`The operation could not be confirmed: ${err?.message || 'Unknown error'}. Check Canvas before changing students.`, 'warning');
  } finally {
    buttons.forEach(btn => { btn.disabled = false; });
  }
}

document.getElementById('scroll-btn').addEventListener('click', () => run('scroll'));
document.getElementById('verify-btn').addEventListener('click', () => run('verify'));
document.getElementById('next-btn').addEventListener('click', () => run('next'));
document.getElementById('inspect-btn').addEventListener('click', () => run('inspect'));
