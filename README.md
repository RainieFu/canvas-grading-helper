# Canvas Grading Helper v0.4.1

v0.4 adds the **Floating Grading Panel**, and v0.4.1 fixes a scrolling issue!! You no longer have to open the Chrome extension popup every time you finish grading a student :P

The panel sits directly on the UBC Canvas SpeedGrader page (Classic Quizzes) and includes the same three main functions from v0.3:

- **Scroll to Update Scores:** Scrolls the quiz iframe to Canvas's actual Update Scores button. Still here if you prefer saving manually!
- **Save & Verify:** Clicks Canvas's Update Scores button, waits for the `score_updated=1` confirmation, and stays on the current student.
- **Save & Next Student:** Saves and verifies the update, then clicks Canvas's Next Student button. No automatic advance without the expected confirmation.

**Inspect buttons** is also available in the floating panel for debugging. It does not change grades.

## v0.4.1 — Small scrolling fix

On some long submissions, **Scroll to Update Scores** used to stop near the bottom without actually showing the button. The quiz content and the surrounding SpeedGrader panel can scroll independently, and Canvas sometimes makes the embedded iframe much taller than the visible grading area.

This patch scrolls the actual Update Scores button into view across the iframe and the surrounding page, instead of scrolling to the iframe itself. It also checks whether the button appears in the viewport before reporting success. The save-and-next logic is unchanged.


## What's new?

1. Click the **extension icon once** while you're on SpeedGrader to open the floating panel. There is no longer a separate popup.
2. The panel stays visible as you move between submissions, including ordinary same-origin SpeedGrader reloads in that tab.
3. **Drag the header** to put it somewhere that doesn't block the exam or scoring fields. Its position is remembered for that tab during the Chrome session.
4. Click the **×** on the panel (or click the extension icon again) to close it. Click the extension icon to reopen it whenever you want.
5. All three grading actions are available directly on the page. No need to keep opening the extension popup!

Note: The panel follows the **same tab** while you're working on UBC SpeedGrader. A new tab, browser restart, or navigation away from the Canvas site may require clicking the extension icon again.

## How does Save & Next work?

The actual grading logic is unchanged from v0.3:

1. Find `button.update-scores` in the embedded quiz iframe.
2. Click that button to submit scores/comments through Canvas's own grading form.
3. Listen for the quiz iframe to finish loading.
4. Check the redirected URL for the matching quiz's `score_updated=1` confirmation.
5. **Only after confirming the save**, click `#next-student-button` in SpeedGrader.

If the confirmation isn't detected, the extension stays on the current student. This doesn't necessarily mean Canvas failed to save: check the actual grades and comments before trying again.

The success signal confirms that Canvas processed the update, **not** that every individual score or comment has been independently audited. Grading is still up to the user <3

## Install/Upgrade

1. Download and extract the v0.4.1 ZIP file.
2. Open `chrome://extensions` and enable **Developer mode**.
3. If an older version is installed, either remove the older unpacked extension and select **Load unpacked** for the new `canvas-grading-helper` folder, **or** replace its files in the same folder and click **Reload** on the extension card. The folder should contain `manifest.json`.
4. Refresh your UBC Canvas SpeedGrader tab.
5. Pin the extension if useful. **Click its toolbar icon once** to show the floating panel.
6. Try **Scroll to Update Scores** first, then test **Save & Verify** and **Save & Next Student** on an already-graded submission before using v0.4.1 in active grading.

Clicking the extension icon now **shows/hides the floating panel directly**; it will not open the old v0.3 popup. Inspect Buttons moved into the floating panel.

## Safety and permissions

- Chrome permissions: `activeTab`, `scripting`, and `storage`. The new `storage` permission keeps only the panel's open/closed state and its position **for the current browser session**. No grades, comments, names, student IDs, or submission content are stored.
- The extension does not connect to external servers, export or log student information, or call Canvas APIs independently.
- It only acts on `https://canvas.ubc.ca/courses/<number>/gradebook/speed_grader` pages after the extension icon has been clicked. It does not request permanent site access.
- Saving uses Canvas's own Update Scores button; the extension does not assign marks or edit grading fields.
- While saving, the panel disables its controls to avoid duplicate actions. It also won't close halfway through an in-progress save.
- Save & Next Student won't advance if confirmation is missing, the submission/page appears to have changed, or the Next Student button is unavailable.
- The extension is intended for the current UBC Canvas **Classic Quizzes** SpeedGrader interface. Canvas UI changes can break the selectors or confirmation check.

## Next step

Question Navigation (maybe maybe?)

Another annoying part of grading long exams is having to scroll through every student's submission to find the questions we're assigned to grade.

Some ideas for the next version:

- Let users enter the question numbers they're responsible for grading.
- Add a Jump to Question function to the floating panel.
- Automatically scroll to the first assigned question after Save & Next Student, so the next submission is ready for grading right away.

Maybe add Previous/Next Assigned Question buttons to make navigating between assigned questions easier.