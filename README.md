# 🎹 Tintinnabuli Visualizer

A minimalist, aesthetic MIDI and Audio visualizer inspired by minimalism musical style. Designed for musicians, content creators, and music lovers who want an elegant visual presentation for their compositions.

## ✨ Features

*   **Immersive Piano Roll**: Smooth, high-performance rendering of MIDI notes with a soft, organic feel.
*   **Reactive Oscilloscope**: Real-time waveform visualization with adjustable line width—from ultra-fine "laser" lines to thick, hand-drawn styles.
*   **Intelligent Layouts**:
    *   **16:9 Landscape**: A balanced grid layout perfect for YouTube or desktop screens.
    *   **9:16 Portrait**: A full-bleed, edge-to-edge layout optimized for TikTok, Reels, and YouTube Shorts.
*   **Image-Driven Theme Engine**: Upload an album cover and the app automatically extracts a harmonious color palette, adjusting the background, notes, and oscilloscope colors.
*   **Smart Interface**:
    *   **Adaptive Contrast**: The settings button automatically switches between Black and White based on the background luminance to ensure perfect visibility.
    *   **Distraction-Free Recording**: When using the "Start 3s" timer, the UI completely disappears for a clean recording. Hover over the top-right corner to bring the controls back.
*   **Precision Control**:
    *   **Sync Offset**: Fine-tune the timing alignment between Audio and MIDI (+/- 2000ms).
    *   **Cover Art Editing**: Zoom and reposition (Y-Offset) your image directly within the app.
    *   **Theme Tuning**: Adjust brightness and contrast of the generated color themes.
    *   **Dynamic Typography**: Self-scaling title system that maintains elegance regardless of text length.

## 🚀 How to Use

1.  **Audio**: Load your audio file (MP3, WAV, etc.).
2.  **MIDI**: Load the corresponding MIDI file.
3.  **Visuals**: Upload a cover image. The app will generate a matching theme.
4.  **Settings**: 
    *   Adjust the **Sync Offset** if the MIDI isn't perfectly aligned.
    *   Tweak the **Oscilloscope** line width.
    *   Select your format (**16:9** or **9:16**).
5.  **Record**: Click **"Start 3s"**. The UI will vanish, giving you a 3-second countdown before playback starts—perfect for screen capture.

## 🛠️ Tech Stack

*   **React** & **Tailwind CSS** for the interface.
*   **Canvas API** for high-performance 60fps rendering.
*   **Web Audio API** for real-time spectral analysis.
*   **@tonejs/midi** for precise musical data parsing.

---

*Note: This project focuses on aesthetics and contemplation, turning any musical piece into a beautiful visual experience.*