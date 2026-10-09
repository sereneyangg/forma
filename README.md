# Forma — visual drawing coach

A Next.js 16 / React 19 drawing studio with live camera practice and finished drawing review.

## Run locally

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3000. The dev launcher uses polling to avoid file-watcher limits in restricted macOS workspaces. Camera access requires HTTPS or localhost, a compatible browser, and camera permission; no microphone access is requested.

## Hands-on guidance

1. Upload a drawing and an optional reference, or enable a camera with a reference.
2. Choose **Review my drawing**. In live practice, guides update approximately every 4.5 seconds.
3. Click a **numbered marker** or **Show me** to focus an edit. Green contours suggest a line to check, green hatching suggests adding tone, and amber patches suggest lifting graphite.
4. Read the focused lesson beneath the drawing: your original detail, the matching reference detail, an illustration of marks to try, recommended tool, and three concrete steps.
5. Switch between **Show edits**, **Original**, and **Reference**. Adjust reference transparency; use **Align reference** to match horizontal position, vertical position, and size, then apply to recalculate.
6. Mark an edit **Tried** to track practice. This is a self-reported checklist, not verification of a correction. Upload a new photo or resume the camera to analyze the changed drawing.

Selecting a live edit pauses feedback and displays the exact analyzed frame. Resume returns to the moving camera. Stopping the camera releases the stream and keeps the last analyzed frame available for study. Camera tracks stop when leaving live mode. Notes downloads include the localized instructions.

## What it can and cannot infer

The app measures real image data locally: grayscale values, local contour differences, and connected darker/lighter regions. Broad differences are reduced to small patches rather than asking the artist to redo the entire drawing. Reference alignment is applied consistently to both the analysis and displayed overlay.

These are **conditional image-difference guides**, not semantic AI criticism or an automatically corrected artwork. A darker photographic surface is not always a shadow; the user should compare each suggestion with the actual reference and their intent. Cropping, lighting, backgrounds, style, and color-to-gray conversion can affect the guides. Best results come from dark marks on light paper, straight-on photos, and matching subject framing.

Without a reference, guidance is limited to optional local technique exercises. The app cannot identify missing eyes, fingers, leaf veins, anatomy errors, or perspective errors. Subject-aware critique requires a separately configured vision-model integration. No AI key is connected and no AI requests are made.

## Privacy

JPG, PNG, and WebP uploads (up to 12 MB) and camera frames stay in browser memory. Images are resized locally to at most 1600px; visual comparisons use a 128×128 luminance grid. Nothing is uploaded, stored, or analyzed on a server. Reloading clears the session. Google Fonts loads typography externally, without sending artwork.

## Check and build

```sh
npm test
npm run typecheck
npm run build
```

`next build` creates a static export in `out/`. To preview it without a framework server:

```sh
python3 -m http.server 3000 --bind 127.0.0.1 --directory out
```

All 15 tests passed. The tests cover blank-page handling, localized shading/erasing/contour targets, identity comparisons, translated reference alignment, bounds, and manageable patch size. The built-in pear pair is also exercised against the actual image-processing pipeline during development. Browser validation of this update was blocked by the browser URL policy; physical-camera behavior remains unverified on hardware.

## Project location and hosting

This workspace contains the restored source from the earlier Forma build, plus the visual coaching update. `.openai/hosting.json` preserves the existing private Sites project identity. Publication requires explicit authorization to upload this source to that private destination; it was blocked by automatic approval review in this editing session. No production version has been deployed.
