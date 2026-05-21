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

## 🌐 Proxmox LXC (Ubuntu) Deployment Guide

This application is fully optimized to run in a lightweight Proxmox LXC Ubuntu container and forward securely through Cloudflare Zero Trust Tunnels.

### Step 1: Install Node.js on Ubuntu LXC
Log into your LXC console and install Node.js:
```bash
# Add NodeSource official repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Step 2: Clone & Configure the App
```bash
# Move to your desired directory
cd /opt
git clone <your-repository-url> parcour-judging
cd parcour-judging

# Install production dependencies
npm install --omit=dev

# Set up your environment configs
cp .env.example .env
nano .env
```
Ensure `.env` contains:
```ini
PORT=3000
ADMIN_PASSWORD=your_secure_admin_password_here
NODE_ENV=production
```

### Step 3: Run as a Systemd Service (Background Daemon)
To ensure the app starts automatically when your Proxmox LXC boots and restarts if it crashes, create a systemd service file:

```bash
sudo nano /etc/systemd/system/parcour-judging.service
```

Paste the following configurations (adjusting paths if necessary):
```ini
[Unit]
Description=Parcour Live Judging & Leaderboard
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/parcour-judging
ExecStart=/usr/bin/npm start
Restart=on-failure
EnvironmentFile=/opt/parcour-judging/.env

[Install]
WantedBy=multi-user.target
```

Reload systemd, enable, and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable parcour-judging
sudo systemctl start parcour-judging
```

Check the status to ensure it's running:
```bash
sudo systemctl status parcour-judging
```

---

## ☁️ Cloudflare Tunnels (Zero Trust) Configuration

To safely publish this application to the internet without opening ports or configuring reverse proxies (NGINX), use a Cloudflare Tunnel:

1. **Install cloudflared on your LXC**:
   Follow the [Cloudflare Tunnel installation instructions](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-and-setup/tunnel-guide/local/) for Ubuntu.
2. **Expose the app**:
   Create a tunnel in your Cloudflare Zero Trust dashboard under **Access > Tunnels** and choose **Public Hostname**.
3. **Configure Routing**:
   - **Subdomain/Domain**: `judging.yourdomain.com`
   - **Service Type**: `HTTP`
   - **URL**: `localhost:3000` (or the local IP of your LXC container if running cloudflared elsewhere)
4. **WebSocket Support**:
   Under **Tunnel Settings > TLS**, ensure WebSockets are enabled so Socket.IO updates propagate in real-time.
5. **Additional Access Security (Optional)**:
   Add a Cloudflare Access Application policy in front of `/admin` and `/judge` to authenticate users (e.g., via Google Workspace or Email OTP) before they can even access the login forms!
