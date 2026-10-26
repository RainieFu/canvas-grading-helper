# Canvas Grading Helper 0.1

A tiny, local-only Chrome extension for UBC Canvas SpeedGrader.

## Installation

1. Unzip the downloaded package.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted **canvas-grading-helper** directory (the folder containing `manifest.json`).
6. Open the Canvas SpeedGrader page and click the extension icon (pin it if useful).
7. Click **Scroll to Update Scores**.

## Safety and permissions

- This version *only scrolls*: it never clicks Update Scores or changes grades.
- It does not connect to external servers, log or transmit students' information, or use Canvas APIs.
- It requests Chrome's `activeTab` and `scripting` permissions so it can run the scrolling function on the current tab when clicked.
- It explicitly checks that the active tab is a UBC Canvas SpeedGrader page.
- It searches same-origin frames because the quiz grading panel is embedded in an iframe.

## Next step

A **Save & Next Student** function needs separate testing though, to verify how the save completes, how errors are presented, and how next-student navigation works in the current SpeedGrader version. No guarantee of the update ;P
