# 🏆 Mandir 11

A private, mobile-first, local-first sports platform for colony and community sports. Replaces mental bookkeeping (*"who played, who won, who owes whom money"*) with permanent, automatic records, live cricket scoring, tournaments, rankings, peer-to-peer money ledger settlements, and Android APK support.

---

## 🚀 Key Features

### 🏏 Cricket Ball-by-Ball Live Scorer
- **Limited Overs & Test Cricket**: Supports both limited-overs formats (T20, custom overs) and full multi-innings Test matches with follow-on and declaration options.
- **Full Scoring Engine**: Handles runs, extras (wides, no-balls, leg byes, byes, penalty runs), wickets (bowled, caught, run out, stumped, lbw, hit wicket), strike rotation, over completions, and live run rates.
- **Match Summaries & Shareable Scoreboard**: Download high-resolution PNG scorecards generated client-side via HTML5 Canvas.

### 🏐 Multi-Sport Match Management
- Support for **Cricket**, **Volleyball**, and **Badminton**.
- Quick Match wizard with instant team setup, automatic team reuse, and *"Play Again"* shortcuts.
- Match lifecycle state machine: `upcoming` ➔ `live` ➔ `completed` / `abandoned`.

### 🌟 Automatic Man of the Match (MVP)
- Automatic MVP score calculation when a match completes:
  - **Win**: `+10 pts`
  - **Loss**: `+2 pts`
  - **Tie**: `+5 pts`
  - **Run**: `+1 pt`
  - **Wicket**: `+5 pts`
- Deterministic tie-breaking and support for both limited overs and Test matches.

### 🏆 Dynamic Rankings & Leaderboard
- Dynamic ranking point calculation from completed matches.
- Podium display for Top 3 players and filterable sport standings (Cricket, Volleyball, Badminton, Overall).
- Detailed player career profiles, strike rates, bowling economies, win rates, and match histories.

### 💰 Colony Money Ledger & Payment Settlements
- Peer-to-peer stake matching and directional debt calculation.
- **💸 Mark as Settled & Partial Payments**: Support for partial payments (e.g., ₹100 debt ➔ ₹40 paid ➔ ₹60 remaining) and full settlement.
- **✏️ Edit Debt Amounts**: Adjust debt amounts with built-in validation.
- **📜 Payment History & Undo**: Complete audit trail of payment transactions with one-click undo and note editing.
- **Colony Net Balances**: Colony-wide net balance leaderboard and individual player statements.

### 🏅 Tournament Engine
- Create and manage **Knockout**, **Round Robin**, and **League** tournaments.
- Automatic fixture generation, round tracking, bracket progression, and tournament standings table.

### 💾 100% Local-First & Offline Data Persistence
- Built on **IndexedDB via Dexie.js** for instant, offline-first performance with zero external database dependencies.
- Complete data backup and restore via JSON export/import in Settings.

### 📱 Android APK Support
- Packaged with **Capacitor Android** (`com.vedantaware.mandir11`).
- Generates standalone debug APKs for direct installation on Android devices.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | React 19, Vite 8 |
| **Styling** | Tailwind CSS, Custom Modern Dark Glassmorphism Design System |
| **Local Database** | IndexedDB via Dexie.js (browser & native WebView) |
| **Mobile Runtime** | Capacitor Android 8 |
| **Routing** | React Router v7 |
| **Testing** | Vitest, fake-indexeddb |
| **Linter** | Oxlint |

---

## 📂 Project Structure

```
mandir11/
├── MANDIR11-REFERENCE.md         ← Reference specification
├── README.md
├── web/                          ← React + Vite frontend & Capacitor app
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── capacitor.config.json     ← Capacitor Android configuration
│   ├── package.json
│   ├── android/                  ← Native Android project (Capacitor)
│   │   ├── app/
│   │   ├── build.gradle
│   │   └── gradlew.bat
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── index.css             ← Design system & utility classes
│       ├── db/
│       │   └── db.js             ← Dexie.js IndexedDB schema
│       ├── engines/
│       │   ├── matchEngine.js    ← Match lifecycle & MVP calculations
│       │   ├── cricketScorer.js  ← Ball-by-ball cricket engine
│       │   ├── ledgerEngine.js   ← Stakes, payments, settlements & history
│       │   ├── statsEngine.js    ← Dynamic player rankings & streaks
│       │   ├── tournamentEngine.js ← Fixture generation & tournament progression
│       │   └── backupEngine.js   ← Database export/import
│       ├── utils/
│       │   └── scoreboardGenerator.js ← Canvas PNG scoreboard exporter
│       ├── services/
│       │   └── api.js            ← Local-first adapter layer
│       ├── components/
│       │   ├── Navbar.jsx
│       │   ├── MatchCard.jsx
│       │   └── ui.jsx            ← Reusable modals, spinners, buttons
│       ├── pages/
│       │   ├── Dashboard.jsx     ← Colony overview & recent matches
│       │   ├── QuickMatch.jsx    ← Match creation wizard & team selector
│       │   ├── CricketScorer.jsx ← Interactive ball-by-ball scorer
│       │   ├── MatchDetail.jsx   ← Full scorecard, MVP badge & PNG download
│       │   ├── Leaderboard.jsx   ← Dynamic rankings & Top 3 podium
│       │   ├── Ledger.jsx        ← Outstanding debts, settlements & payment history
│       │   ├── Tournaments.jsx   ← Tournament management & brackets
│       │   ├── Players.jsx       ← Colony player roster
│       │   ├── PlayerProfile.jsx ← Lifetime career statistics
│       │   └── Settings.jsx      ← Data backup & restore
│       └── __tests__/            ← Vitest unit test suite (95+ tests)
```

---

## 💻 Getting Started

### Prerequisites
- **Node.js**: v18 or later
- **npm**: v9 or later
- **Java JDK**: JDK 17+ (for building Android APKs)
- **Android SDK**: API 34+ (for Android builds)

### 1. Install Dependencies

```bash
cd web
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing & Quality Checks

Run the automated test suite with Vitest:

```bash
cd web
npm test
```

Run code linting:

```bash
npm run lint
```

Build the web production bundle:

```bash
npm run build
```

---

## 📱 Building the Android APK

Mandir 11 can be built as a standalone Android APK using Capacitor and Gradle.

### 1. Build and Sync Web Assets

```bash
cd web
npm run apk:build
```

### 2. Assemble Debug APK

```bash
cd android
.\gradlew assembleDebug       # On Windows
./gradlew assembleDebug        # On macOS / Linux
```

### 3. APK Output Location

The generated APK will be available at:
```
web/android/app/build/outputs/apk/debug/app-debug.apk
```

Transfer this file directly to your Android device via USB, Drive, or WhatsApp to install and use Mandir 11 completely offline on your phone.

---

## 📜 License

Created with ❤️ by **Vedant** for **Mandir 11**.
Private colony sports management platform.
