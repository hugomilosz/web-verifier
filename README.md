# AI Fact-Check Extension

A browser extension that cross-references web content with trusted sources using a real-time retrieval-augmented generation (RAG) backend.

## Features

* **AI Overview Verification:** Automatically adds a "Verify" button to AI Overview sections on search pages.
* **Tooltip Verification:** Highlight any text on a webpage to pop up a "Verify this" button.
* **Context Menu Verification:** Right-click on any selected text and choose "Verify selection" from the menu.
* **Verification Results:**
    - **Clear Results:** Displays "Supported," "Contradicted," or "Unsure" claims in a simple results box with sources.
    - **Confidence Meter:** Visual bar (0-100%) indicating how certain the AI is based on the strength of evidence found.
    - **Source Credibility Badges:** Labels sources by domain type (`[GOV]`, `[ACADEMIC]`, `[NEWS]`, or `[OPINION]`).
    - **Transparent Reasoning:** Expandable "See Reasoning" section explaining *why* a verdict was reached.

## Setup

Before you begin, ensure you have the following:
- **Python 3.9+**
- **Google Chrome**
- A [**Gemini API Key**](https://aistudio.google.com/app/apikey)

This project has two parts that must be running: the backend server and the frontend extension.

### 1. Backend Server

1.  Clone the repository.
2.  Create a `.env` file in the root directory and add your key:
    ```env
    GEMINI_API_KEY=your_actual_api_key_here
    ```
3.  Start your backend API server.

### 2. Chrome Extension

1.  Open Google Chrome and navigate to `chrome://extensions`.
2.  Enable **Developer mode** using the toggle in the top-right corner.
3.  Click the **Load unpacked** button.
4.  Select the folder containing the extension files (`manifest.json`, `background.js`, `content.js`, etc.).

The extension is now active and will work as long as the backend server is running.

## How to Use

* **For AI Overviews:** Click the `🕵️ Verify with Trusted Sources` button that appears in the AI Overview box.
* **For Any Text:** Highlight the text you want to check. Either click the tooltip that appears or right-click and select `Verify selection`.
