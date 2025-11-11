# AI Fact-Check Extension

A browser extension that verifies factual claims in AI-generated overviews and selected text using a backend verification server.

## Features

* **AI Overview Verification:** Automatically adds a "Verify" button to AI Overview sections on search pages.
* **Tooltip Verification:** Highlight any text on a webpage to pop up a "Verify this" button.
* **Context Menu Verification:** Right-click on any selected text and choose "Verify selection" from the menu.
* **Clear Results:** Displays "Supported," "Contradicted," or "Unsure" claims in a simple results box with sources.

## Setup

This project has two parts that must be running: the backend server and the frontend extension.

### 1. Backend Server

1.  Start your backend API server (e.g., the Python/FastAPI server).
2.  Ensure it is running and accessible at `http://127.0.0.1:8000`.

### 2. Chrome Extension

1.  Open Google Chrome and navigate to `chrome://extensions`.
2.  Enable **Developer mode** using the toggle in the top-right corner.
3.  Click the **Load unpacked** button.
4.  Select the folder containing the extension files (`manifest.json`, `background.js`, `content.js`, etc.).

The extension is now active and will work as long as the backend server is running.

## How to Use

* **For AI Overviews:** Click the `🕵️ Verify with Trusted Sources` button that appears in the AI Overview box.
* **For Any Text:** Highlight the text you want to check. Either click the tooltip that appears or right-click and select `Verify selection`.
