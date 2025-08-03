# 7 Days to Die Dedicated Server Plus

🌐 [繁體中文](readme.md) | [English](readme.en.md)

A lightweight management panel and API for **7 Days to Die** dedicated servers. Supports server start/stop, save backups, Telnet operations, and game information queries.

## Features

- ✅ Web control panel to start/stop the server
- 💾 Backup game saves (automatically compressed to ZIP)
- 📦 List all saved backups
- 🧠 Send in-game commands via Telnet remotely (supports version check, player list, server settings, etc.)
- 📂 Static web interface, customizable

## Project Structure

```
7-days-to-die-dedicated-server-plus/
├─ public/ # Web frontend
│ └─ index.html
├─ src/
│ ├─ server.js # Main backend API
│ └─ server.sample.json # Config template
├─ LICENSE
└─ README.md
```

## Installation & Usage

### 1. Install Node.js (recommended v18+)

https://nodejs.org/

### 2. Install dependencies

```
npm install
```

### 3. Create configuration file

Copy the sample config and adjust it based on your server setup:

```
cp src/web/server.sample.json src/web/server.json
```

### Configuration Explanation (server.json)

| Field | Description |
|-------|-------------|
| `web.port` | Port used by the web API |
| `web.path` | Root path of the project |
| `web.saves` | Output path for backup ZIP files |
| `web.zipTool` | Full path to 7z.exe |
| `web.timeZone` | Timezone for backup timestamp formatting |
| `game_server.ip` | Server IP (usually 127.0.0.1) |
| `game_server.port` | Game connection port |
| `game_server.saves` | Original game save directory |
| `game_server.startBat` | Path to the batch file that starts the server |
| `game_server.telnetPort` | Telnet management port |
| `game_server.telnetPassword` | Telnet password |

### 4. Start the service

```
node src/web/server.js
```

### 5. Open in your browser

```
http://localhost:26903/
```


## Common API Overview

| Path | Description |
|------|-------------|
| `POST /api/start` | Start the server |
| `POST /api/stop` | Stop the server |
| `POST /api/backup` | Backup game saves |
| `POST /api/view-saves` | View all backup files |
| `POST /api/telnet` | Send Telnet commands (e.g. `version`, `listplayers`, `getgameprefs`) |

## License

This project is licensed under **GPLv3**. You may freely modify and redistribute it as long as the project remains open source and complies with GPL terms.

![DEMO](demo.png)