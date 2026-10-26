'use strict';

// Only state about the panel itself is kept for the lifetime of Chrome's session.
// No student identifiers, grading fields, comments, or Canvas page content are saved.
const SPEEDGRADER_URL = /^https:\/\/canvas\.ubc\.ca\/courses\/\d+\/gradebook\/speed_grader(?:[/?#]|$)/;
const stateKey = tabId => `cgh_panel_${tabId}`;

function isSpeedGrader(url) {
  return SPEEDGRADER_URL.test(url || '');
}

async function getState(tabId) {
  const key = stateKey(tabId);
  const obj = await chrome.storage.session.get(key);
  return obj[key] || { visible: false, position: null };
}

async function setState(tabId, newState) {
  await chrome.storage.session.set({ [stateKey(tabId)]: newState });
}

async function injectPanelScript(tabId) {
  // Re-injecting the file is safe: its controller checks for a previous instance.
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    files: ['content.js']
  });
}

async function sendVisibility(tabId, visible, position) {
  return chrome.tabs.sendMessage(tabId, {
    type: 'CGH_SET_VISIBILITY',
    visible,
    position: position || null
  });
}

// One click on the extension icon toggles the panel, without a popup.
chrome.action.onClicked.addListener(tab => {
  (async () => {
    if (!tab?.id || !isSpeedGrader(tab.url)) return;
    const state = await getState(tab.id);
    const wantVisible = !state.visible;

    if (wantVisible) {
      await setState(tab.id, { ...state, visible: true });
      try {
        await injectPanelScript(tab.id);
        const result = await sendVisibility(tab.id, true, state.position);
        if (!result?.visible) await setState(tab.id, { ...state, visible: false });
      } catch (err) {
        await setState(tab.id, { ...state, visible: false });
        throw err;
      }
    } else {
      let result;
      try {
        result = await sendVisibility(tab.id, false, state.position);
      } catch (_) { /* The page may have reloaded between events. */ }
      // While saving, the panel refuses to close. Preserve open state.
      if (result?.reason !== 'busy') {
        await setState(tab.id, { ...state, visible: false });
      }
    }
  })().catch(err => console.warn('Canvas Grading Helper: could not toggle panel.', err));
});

// If a new top-level document loads in the same SpeedGrader tab, restore the panel.
// Chrome retains the activeTab permission through same-origin navigation/reloads.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  (async () => {
    const state = await getState(tabId);
    if (!state.visible || !tab.url) return;
    if (!isSpeedGrader(tab.url)) {
      await setState(tabId, { ...state, visible: false });
      return;
    }
    await injectPanelScript(tabId);
    await sendVisibility(tabId, true, state.position);
  })().catch(() => {
    // Site access may be revoked, the tab may close, or the page may reload again.
    // The grader can reopen the panel by clicking the extension icon.
  });
});

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove(stateKey(tabId)).catch(() => {});
});

// Actions sent by the floating panel. Validate the actual sender's tab and URL.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!['CGH_CLOSE_PANEL', 'CGH_SAVE_POSITION'].includes(message?.type)) return false;
  (async () => {
    const tabId = sender.tab?.id;
    if (!tabId || !isSpeedGrader(sender.url)) {
      sendResponse({ ok: false });
      return;
    }
    const state = await getState(tabId);
    if (message.type === 'CGH_CLOSE_PANEL') {
      await setState(tabId, { ...state, visible: false });
    } else {
      const p = message.position;
      if (!p || !Number.isFinite(p.left) || !Number.isFinite(p.top)) {
        sendResponse({ ok: false });
        return;
      }
      await setState(tabId, {
        ...state,
        position: {
          left: Math.max(0, Math.min(10000, Math.round(p.left))),
          top: Math.max(0, Math.min(10000, Math.round(p.top)))
        }
      });
    }
    sendResponse({ ok: true });
  })().catch(() => sendResponse({ ok: false }));
  return true;
});
