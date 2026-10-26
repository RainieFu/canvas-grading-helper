"use strict";

const button = document.getElementById("scroll-btn");
const status = document.getElementById("status");

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "Searching the SpeedGrader page…";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/canvas\.ubc\.ca\/courses\/\d+\/gradebook\/speed_grader(?:[/?#]|$)/.test(tab.url || "")) {
      status.textContent = "Open a UBC Canvas SpeedGrader page first.";
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Runs on demand after a click; no data leaves the tab.
        function findAndScroll(doc) {
          const candidates = doc.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]');
          const target = [...candidates].find(el =>
            /update\s+scores/i.test(el.textContent || el.value || "") &&
            !el.disabled
          );
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            return true;
          }
          for (const iframe of doc.querySelectorAll("iframe")) {
            try {
              if (iframe.contentDocument && findAndScroll(iframe.contentDocument)) {
                iframe.scrollIntoView({ behavior: "smooth", block: "nearest" });
                return true;
              }
            } catch (_) {
              // Cross-origin frames are inaccessible; skip safely.
            }
          }
          return false;
        }
        return findAndScroll(document);
      }
    });

    status.textContent = results?.[0]?.result
      ? "Found it! Scrolled to Update Scores."
      : "Button not found. Make sure the submission finished loading.";
  } catch (err) {
    status.textContent = "Couldn't access this tab. Try refreshing Canvas. " + (err?.message || "");
  } finally {
    button.disabled = false;
  }
});
