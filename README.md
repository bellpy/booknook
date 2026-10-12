# booknook

A cozy desktop app for logging books you've read, built with electron.

## Run it
Runs on Node.js 22 LTS or newer (https://nodejs.org).
```
npm install
npm start
```

## Build installers
    npm run dist:linux   # AppImage + .deb - run on Linux

Results land in `dist/`.

## Your data
Stored in a SQLite file `booknook.db`:
- Windows: `%APPDATA%\booknook\booknook.db`
- Linux:   `~/.config/booknook/booknook.db`
- MacOS:   `~/Library/Application Support/booknook/booknook.db`

## Layout
    main.js        window, database, file dialogs (main process)
    preload.js     tiny safe bridge to the UI
    db.js          SQLite + CSV import/export + validation
    renderer/      index.html, styles.css, app.js (UI), stats.js (facts), glyphs.js (icons)

Shortcuts: Ctrl+N add a book, Delete removes the selected book in the library.
