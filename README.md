# Habit Board

Simple static habit-building website designed for GitHub Pages and older iPad Safari, including iPad Air 1 on iOS 12.

## Features

- Morning board from 7:00 AM to 9:30 AM with six large tap-friendly routine cards.
- Clock-only mode outside the morning window, showing hours, minutes, seconds, and AM/PM.
- Daily checklist state stored in browser local storage.
- No framework, no build step, no scrolling layout.

## Files

- `index.html` - page structure
- `styles.css` - layout and dark theme styling
- `app.js` - schedule logic, clock updates, and checklist persistence

## Preview Locally

Open `index.html` directly in a browser.

Optional URL overrides for testing:

- `index.html?mode=morning`
- `index.html?mode=clock`

## Publish To GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository, open `Settings`.
3. Open `Pages`.
4. Set `Source` to `Deploy from a branch`.
5. Choose the `main` branch and the `/ (root)` folder.
6. Save.

GitHub Pages will serve `index.html` automatically.

## Notes For Use

- The site is optimized for a big device like a tablet(iPad), laptop, desktop so that everything is visible from a distance.
- Safari home screen mode is supported through the Apple web app meta tags in `index.html`.
