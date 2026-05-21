# 🛡️ Proxmox LXC & Cloudflare Zero Trust Deployment Guide

This guide provides a comprehensive, step-by-step walkthrough to deploy the **Live Judging & Leaderboard System** on a clean **Ubuntu Proxmox LXC (Linux Container)**, configure it as a secure system daemon, and publish it safely to the internet using **Cloudflare Zero Trust Tunnels**.

---

## 🏗️ Phase 1: Proxmox LXC Container Creation

For maximum resource efficiency and security, it is highly recommended to run this application inside a dedicated unprivileged LXC container.

### LXC Hardware Specifications
The application is extremely lightweight. You can use minimal resource allocations:
* **Template**: Ubuntu 22.04 LTS or Ubuntu 24.04 LTS
* **CPU Cores**: 1 Core (more than enough)
* **Memory (RAM)**: 512 MB (can easily run on 256 MB)
* **Storage**: 8 GB (mostly for system logs and SQLite database growth)
* **Privileged**: **Unprivileged** (highly recommended for safety)

---

## ⚙️ Phase 2: Ubuntu Server Configuration

Once the LXC container is created and started, open its console to perform initial system configuration.

### 1. Update the System
Ensure your package lists and installed binaries are fully up to date:
```bash
apt update && apt upgrade -y
```

### 2. Create a Dedicated Service User
Running web applications as the `root` user is a major security risk. Create a dedicated system user `judging` with no login shell or password to run the daemon:
```bash
sudo adduser --system --group --no-create-home --shell /bin/false judging
```

### 3. Install Node.js LTS (v20+)
Install the official NodeSource distribution of Node.js:
```bash
# Install curl if not present
apt install -y curl build-essential git

# Add NodeSource GPG Key and Repo
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -

# Install Node.js
apt install -y nodejs
```
Verify the installation:
```bash
node -v  # Should be v20.x.x
npm -v   # Should be v10.x.x
```

---

## 📂 Phase 3: Application Installation

Next, we place the application files onto the server, lock down folder permissions, and configure production environment variables.

### 1. Copy Application Files
We will house the application inside `/opt/parcour-judging`. Clone or move your files there:
```bash
cd /opt
# If cloning via Git:
git clone <your-repository-url> parcour-judging

# Enter directory
cd parcour-judging
```

### 2. Configure Environment Variables
Copy the production environment variables template:
```bash
cp .env.example .env
```
Open the `.env` file for editing:
```bash
nano .env
```
Configure your secure, strong **Admin Password** and ensure the environment is set to `production`:
```ini
PORT=3000
ADMIN_PASSWORD=change_me_to_something_super_secure!
NODE_ENV=production
```
*Press `CTRL + O`, then `Enter` to save, and `CTRL + X` to exit nano.*

### 3. Install Production Dependencies
Run `npm` with production parameters to skip development modules:
```bash
npm install --omit=dev
```

### 4. Lock Down File Permissions
To prevent unauthorized users or processes from reading your `.env` secrets or modifying files, grant ownership of the directory to the dedicated `judging` system user:
```bash
# Assign ownership of folder to judging user and group
chown -R judging:judging /opt/parcour-judging

# Tighten file read/write permissions
chmod -R 750 /opt/parcour-judging
```
*Note: SQLite requires the `judging` user to have write permissions not only on `db/database.sqlite` but also on the parent `db/` folder to manage database locks and write-ahead logs. The recursive ownership command above takes care of this.*

---

## 🚀 Phase 4: Systemd Daemon Setup (Auto-Start)

To run the application continuously in the background, start it on boot, and auto-restart if it encounters a failure, configure it as a **Systemd Service**.

### 1. Create the Service File
```bash
nano /etc/systemd/system/parcour-judging.service
```

### 2. Paste Configuration
Copy and paste the configuration below into the file:
```ini
[Unit]
Description=Parcour Live Judging & Leaderboard Daemon
After=network.target

[Service]
Type=simple
User=judging
Group=judging
WorkingDirectory=/opt/parcour-judging
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5s

# Enforce Security Sandboxing
ProtectSystem=strict
ReadWritePaths=/opt/parcour-judging/db
ProtectHome=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```
*Note: The `ProtectSystem=strict` and `ReadWritePaths` configurations act as sandboxing, allowing the application to write files ONLY inside your SQLite `db/` folder while locking down the rest of your operating system as read-only. This is a crucial defense-in-depth step.*

### 3. Enable and Start the Service
Reload systemd, enable the service to boot automatically, and start it up:
```bash
# Reload systemd configuration
systemctl daemon-reload

# Enable service on boot
systemctl enable parcour-judging

# Start service
systemctl start parcour-judging
```

### 4. Verification and Log Diagnostics
Confirm the service is running successfully:
```bash
systemctl status parcour-judging
```
View the live log feed to verify connections and database migrations:
```bash
journalctl -u parcour-judging -f -n 50
```

---

## ☁️ Phase 5: Cloudflare Zero Trust Tunnel Setup

Cloudflare Tunnels expose your Proxmox LXC container safely to the internet without configuring reverse proxies (like Nginx) or opening firewall ports on your local router.

### 1. Create a Cloudflare Tunnel
1. Log into the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2. Navigate to **Networks > Tunnels** and click **Create a Tunnel**.
3. Name your tunnel (e.g. `parcour-judging-lxc`) and click **Save**.
4. Select **Debian** and **64-bit** (since LXC Ubuntu is Debian-based).
5. Copy the command shown in the box under **Install and run a connector** (starts with `curl ...`).
6. Paste and run that command inside your LXC container terminal to install `cloudflared` and link the connector.

### 2. Configure Public Routing
1. Back on the Cloudflare Dashboard, click **Next**.
2. Under **Public Hostname**, configure your domain setup:
   * **Subdomain**: `judging` (or whatever you prefer)
   * **Domain**: `yourdomain.com` (select from your registered Cloudflare domains)
3. Under **Service**:
   * **Type**: `HTTP`
   * **URL**: `localhost:3000` (or `127.0.0.1:3000`)
4. Click **Save Tunnel**.

### 3. CRITICAL: Enable WebSocket Support
Since this app synchronizes judging metrics and leaderboard updates in real-time via WebSockets (Socket.IO), WebSockets **must** be allowed on Cloudflare:
1. In the Zero Trust dashboard, navigate to **Settings > Network**.
2. Scroll down to **WebSockets** and ensure it is **Enabled**.

---

## 🔒 Phase 6: Cloudflare Access Policies (Optional Security Layer)

Since this app is exposed to the internet, you can prevent random web users from hitting your `/admin` and `/judge` paths by locking them down with **Cloudflare Access (Zero Trust Applications)**. This adds an external login prompt (Email OTP, Google Workspace, GitHub SSO) in front of the actual application pages.

### 1. Lock Down the Administrative Panel
1. In Zero Trust Dashboard, navigate to **Access > Applications > Add an Application**.
2. Select **Self-Hosted**.
3. **Application name**: `Judging Admin Panel`
4. Under **Domain**, match your tunnel URL and add the path:
   * Domain: `judging.yourdomain.com`
   * Path: `admin` (locks down `/admin` and sub-paths)
5. Under **Policies**:
   * Create an **Allow** rule specifying who is permitted to access it (e.g., your personal email address or a specific IP range).
6. Click **Add Application**.

### 2. Lock Down the Judge Panel (Optional)
Repeat the steps above, setting the path to `judge` to restrict access to only your competition's judges. The general leaderboard `/` remains completely open for public spectators to view!

---

## 🛠️ Troubleshooting Guide

### 1. Database Lock Errors (`SQLITE_BUSY` or Perm Error)
* **Symptom**: Server logs show `SQLITE_CANTOPEN` or permissions error when performing write actions.
* **Solution**: SQLite needs to write to the `db/` folder itself, not just the `database.sqlite` file. Ensure the service user owns the folder:
  ```bash
  chown -R judging:judging /opt/parcour-judging/db
  ```

### 2. Ports Collision (`EADDRINUSE`)
* **Symptom**: Systemd logs show `Error: listen EADDRINUSE: address already in use 0.0.0.0:3000`.
* **Solution**: Another service is running on port 3000. Open `/opt/parcour-judging/.env` and change the `PORT` to a free port (e.g. `PORT=3080`), then restart the service:
  ```bash
  systemctl restart parcour-judging
  ```
  *(Remember to update the Service URL in your Cloudflare Tunnel settings to match the new port!)*

### 3. Socket.IO Fails to Re-sync
* **Symptom**: Web UI loads, but actions taken on the Judge Panel do not update the Leaderboard in real-time.
* **Solution**: Check that the WebSocket protocol is not being blocked. Ensure **WebSockets** is toggled on in your Cloudflare Zero Trust Network Settings (as outlined in Phase 5, Step 3).
