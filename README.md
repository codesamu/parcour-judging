# 🏆 Live Judging & Leaderboard System

![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge)
![Socket.io](https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&badgeColor=010101)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)

A lightweight, real-time web application for live judging of competitions. Designed to be simple, fast, secure, and easily deployable in environments like **Proxmox LXC containers** or behind **Cloudflare Tunnels**.

---

## ✨ Features

- **Real-Time Synchronization**: Connected devices update instantly via WebSockets (Socket.IO).
- **SQLite Database**: Powered by `better-sqlite3` for high-performance, concurrent, and ACID-compliant scoring.
- **Judge Workflow**: Judges log in with their PIN to submit and update scores dynamically.
- **Dynamic Leaderboard**: Public-facing leaderboard updates instantly as soon as all judges submit scores.
- **Admin Control Panel**: Add, edit, and reorder athletes/judges on the fly, reset the board, or load mock testing presets.
- **Safe & Modular Architecture**: Structured with clean routing, strict type validation, and central error catching.

---

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Copy the example environment file and customize it:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and set your secure `ADMIN_PASSWORD` and `PORT`.

3. **Start the Server**
   ```bash
   npm start
   ```

4. **Access the App**
   - 🏅 **Leaderboard**: `http://localhost:3000`
   - ⚖️ **Judge Panel**: `http://localhost:3000/judge`
   - ⚙️ **Admin Panel**: `http://localhost:3000/admin`

---

## 👥 Managing Judges & Athletes

Judges and athletes are managed entirely through the **Admin UI** (`/admin`).
- **Judges**: Added dynamically with custom names and login PINs.
- **Athletes**: Added dynamically, and starting orders can be arranged via drag-and-drop/re-ordering.
- **Persistent Storage**: All changes are immediately written to your SQLite database under `db/database.sqlite`.

---

## 🌐 Server Deployment & Hosting

For detailed, step-by-step guides on deploying this application in production environments, check out our comprehensive deployment documentation:

👉 **[Production Deployment & Zero Trust Guide (DEPLOYMENT.md)](file:///Users/samuelfronthaler/code/parcour-judging/DEPLOYMENT.md)**

This companion guide covers:
1. 🏗️ **Proxmox LXC Container** hardware sizing and creation parameters.
2. ⚙️ **Ubuntu Server configuration** (Node.js LTS setup and locking down folder permissions).
3. 🛡️ **Systemd Daemon configuration** to run the app as a secure, sandboxed non-root background process.
4. ☁️ **Cloudflare Tunnels (Zero Trust)** settings for exposing your local LXC securely without opening router ports (including enabling essential WebSockets support).
5. 🔒 **Cloudflare Access Policies** to add Email OTP/OAuth layers in front of your admin and judge login pages.
6. 🛠️ **Troubleshooting steps** for database locks, port collisions, and socket synching.

