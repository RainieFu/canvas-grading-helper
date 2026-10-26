# Canvas Grading Helper 0.3

This version finally adds the **Save & Next Student** function!! No more scrolling all the way down just to save the grades and move on to the next submission :P

The extension now has four controls for UBC Canvas SpeedGrader:

- **Scroll to Update Scores:** Scrolls the embedded quiz iframe to the actual Canvas Update Scores button. Same function as v0.1.
- **Save & Verify:** Clicks Canvas's Update Scores button and checks whether the save was successful. Stays on the current student.
- **Save & Next Student (beta):** Saves the grades, waits for Canvas to confirm the update, and then automatically clicks the Next Student button.
- **Inspect buttons (no changes):** Checks whether the grading controls are available and returns basic information for debugging. Does not change anything.

**Both Save & Verify and Save & Next Student have been tested successfully on UBC Canvas!** The next student's submission loaded correctly, and the previous student's grades and comments remained saved <3

## How does Save & Next work?

The extension uses Canvas's own Update Scores button rather than making separate API requests.

1. Find the Update Scores button inside the quiz iframe.
2. Click the button to submit the grades and comments.
3. Wait for Canvas to finish processing the update.
4. Check for the `score_updated=1` confirmation in the quiz iframe's redirected URL.
5. If the save is confirmed, click the Next Student button in SpeedGrader.

**If the save cannot be confirmed, the extension will NOT automatically move to the next student.** However, this does not necessarily mean the save failed. Check Canvas manually before trying again.

The confirmation indicates that Canvas processed the score update, but it does not independently verify every individual grade or comment.

## Install/Upgrade

1. Extract the ZIP file.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted `canvas-grading-helper` folder (the one containing `manifest.json`).
4. If an older version is already installed, remove it and load the new version. Alternatively, replace the files in the existing extension directory and click Reload.
5. Refresh the UBC Canvas SpeedGrader page.
6. Open the extension popup and select whichever function you need!

For the first test, use an already-graded submission to make sure the scores and comments are saved correctly before trying Save & Next Student on active grading work.

## Safety and permissions

- The extension only requests Chrome's `activeTab` and `scripting` permissions. It runs when the user explicitly clicks a function.
- It does not connect to external servers, store or transmit student information, or make independent Canvas API requests.
- It only works on UBC Canvas SpeedGrader pages matching `https://canvas.ubc.ca/courses/<number>/gradebook/speed_grader`.
- It uses Canvas's existing grading and navigation buttons. It does not change individual scoring fields or make grading decisions.
- It searches accessible same-origin iframes because the quiz grading panel is embedded inside one.
- Save & Next Student only advances after detecting Canvas's expected save confirmation. If the confirmation is missing or the Next Student button is unavailable, it will not automatically navigate.
- The extension is designed and tested for the current UBC Canvas Classic Quizzes interface. Changes to Canvas may break the selectors or save verification.

Please still double-check the grades and comments, especially when using Save & Next Student for the first time. We tested it, but no guarantee it will survive every future Canvas update ;P

## Next step

**v0.4 — Floating Grading Panel**

The current version works, but opening the Chrome extension popup every time is still an extra step (ugh!). The next goal is to make the workflow even smoother with a small floating control panel directly on the SpeedGrader page.

The idea is:

1. Click the extension icon once to open the floating panel.
2. The panel stays visible while grading and moving between student submissions.
3. Keep all three main controls available (with cleaner layout):
   - **Scroll to Update Scores**
   - **Save & Verify**
   - **Save & Next Student**
4. Allow users to drag the panel somewhere convenient so it doesn't cover the exam or grading fields.
5. Add a close button to dismiss the panel whenever it is no longer needed. Users can reopen it through the extension icon.

Ideally, the panel should remain available throughout the SpeedGrader session, including after moving to the next student, without needing to reopen the extension every time.

The existing **Inspect buttons** function can stay in the extension popup for debugging purposes.

The goal is to make grading faster with fewer unnecessary clicks, while keeping the actual grading decisions and control over saving in the grader's hands.

Stay tuned for v0.4! :)
