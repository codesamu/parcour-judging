# 🏆 Live Judging & Leaderboard System

![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge)
![Socket.io](https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&badgeColor=010101)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)

A lightweight, real-time web application for live judging of competitions. Designed to be simple, fast, and easily deployable in environments like Proxmox LXC containers or behind Cloudflare Tunnels.

## ✨ Features

- **Real-Time Synchronization**: All connected devices update instantly via Socket.IO.
- **Judge Workflow**: Judges can submit scores for the active athlete and edit previous scores at any time.
- **Admin Dashboard**: Easily manage the start list and reset the competition.
- **Dynamic Leaderboard**: Public-facing leaderboard that updates automatically as soon as all judges submit their scores.
- **Dark Mode UI**: Beautiful glassmorphic aesthetics that look great on mobile and desktop.

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Server**
   ```bash
   node server.js
   ```

3. **Access the App**
   - 🏅 Leaderboard: `http://localhost:3000`
   - ⚖️ Judge Panel: `http://localhost:3000/judge`
   - ⚙️ Admin Panel: `http://localhost:3000/admin`

## 👥 Managing Judges & PINs

Judges and their PINs are configured at the very top of `server.js`. To add or remove judges, or to change their names and PINs, simply edit the `JUDGES_CONFIG` array:

```javascript
// Customize Judges Here
const JUDGES_CONFIG = [
  { name: 'Judge1', pin: '1111' },
  { name: 'Judge2', pin: '2222' },
  { name: 'Judge3', pin: '3333' },
  // Add as many as you need!
];
```
*Note: If you change the judges after starting the app, you will need to delete the `db/database.sqlite` file and restart the server so the new judges are imported.*

## 🔒 Admin Login

The default Admin login is:
- **Username:** `admin` (not case sensitive)
- **PIN:** `admin`

*(You can change the admin PIN at the top of `server.js` by editing `ADMIN_PASSWORD`)*
