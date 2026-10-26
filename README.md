# Canvas Grading Helper 0.2 

This unpacked Chrome extension adds three popup controls on UBC Canvas SpeedGrader quiz pages:

- **Scroll to Update Scores:** Scrolls the embedded quiz iframe to the actual Canvas button.
- **Save Scores (test):** Calls `.click()` on Canvas's `button.update-scores`, avoiding manual scrolling. This action will save changes to the real gradebook.
- **Inspect buttons (no changes):** Returns read-only information about the save form and whether the next-student button exists; the form path has numeric identifiers redacted for testing purpose <3

**There is intentionally no automatic Save & Next button yet.** We know where both elements are, but we still need to identify the Canvas save success signal before allowing automatic navigation. Stay tuned for the next update.

## Install/Upgrade

1. Extract the ZIP.
2. Visit `chrome://extensions`, enable Developer mode, and use **Load unpacked** on the `canvas-grading-helper` folder.
3. If v0.1 is installed, use the new extracted directory as a replacement: remove v0.1, load v0.2. (You can also overwrite the files in the original unpacked directory, then click the extension's refresh icon.)
4. Open the UBC Canvas SpeedGrader page and pin/open the extension.
5. For the first test, use an already-graded submission and verify Canvas saved the score after using **Save Scores (test)**.

## Safety and permissions

- This extension uses the `activeTab` and `scripting` permissions only, on explicit clicks.
- It does not send, record, or export student data, or call Canvas APIs directly.
- It only acts if the current URL matches `https://canvas.ubc.ca/courses/<number>/gradebook/speed_grader`.
- It does not modify the scoring fields or advance the student.
- It searches accessible same-origin iframes. If Canvas changes its UI, it may stop locating buttons.

