# Setting Up GitHub Pages as a Frontend Proxy

This guide explains how to use GitHub Pages as the frontend host while running the actual game server on your PC.

## Architecture Overview

```
End User → GitHub Pages (Static HTML/JS/CSS) → Your PC (WebSocket + API Server)
```

**Benefits:**
- Free hosting for static files with GitHub Pages
- Custom domain support through GitHub
- Your PC handles real-time WebSocket connections and game logic
- No need to host static assets on your PC

## Step-by-Step Setup

### 1. Configure WebSocket URLs in Client Files

You need to update the WebSocket URL in three files to point to your public IP:

#### File 1: `public/student.js` (Line 2)
```javascript
const WS_URL = 'ws://YOUR_PUBLIC_IP:3000';
```

#### File 2: `public/game.js` (Line 337)
```javascript
const WS_URL = 'ws://YOUR_PUBLIC_IP:3000';
```

Replace `YOUR_PUBLIC_IP` with:
- Your **public IP address** (for internet access)
- Or your **local network IP** like `192.168.1.100` (for LAN only)
- Or a **domain name** if you have one pointing to your PC

**To find your public IP:**
- Visit: https://whatismyip.com
- Or run: `curl ifconfig.me`

**To find your local IP:**
- Windows: `ipconfig`
- Mac/Linux: `ifconfig` or `ip addr`

### 2. Set Up Port Forwarding on Your Router

Since your game server runs on port 3000, you need to forward this port:

1. **Access your router admin panel** (usually `192.168.1.1` or `192.168.0.1`)
2. **Find Port Forwarding settings** (often under "Advanced" or "NAT")
3. **Add a new rule:**
   - External Port: `3000`
   - Internal Port: `3000`
   - Internal IP: Your PC's local IP (e.g., `192.168.1.100`)
   - Protocol: `TCP` (or `Both TCP/UDP`)
4. **Save** the rule

### 3. Configure Firewall

Allow incoming connections on port 3000:

**Windows:**
```powershell
netsh advfirewall firewall add rule name="Quiz Game Server" dir=in action=allow protocol=TCP localport=3000
```

**Linux (UFW):**
```bash
sudo ufw allow 3000/tcp
```

**Mac:**
- System Preferences → Security & Privacy → Firewall
- Add Node.js or allow port 3000

### 4. Deploy to GitHub Pages

1. **Create a GitHub repository** (or use existing one)

2. **Push your files:**
   ```bash
   git add .
   git commit -m "Setup for GitHub Pages"
   git push origin main
   ```

3. **Enable GitHub Pages:**
   - Go to Repository Settings → Pages
   - Source: Deploy from branch
   - Branch: `main` (or `master`)
   - Folder: `/root` or `/` 
   - Save

4. **Your site will be live at:**
   - `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`

### 5. Update Client Files with Your IP

After getting your public IP, update the three files mentioned in Step 1.

**Example:** If your public IP is `203.0.113.45`:
```javascript
const WS_URL = 'ws://203.0.113.45:3000';
```

### 6. Test the Setup

1. **Start your server on your PC:**
   ```bash
   npm start
   # or
   node server.js
   ```

2. **Visit your GitHub Pages site** from any device

3. **Try to join a game** - it should connect to your PC

## Important Notes

### Dynamic IP Address
If your ISP gives you a dynamic IP (changes periodically):
- Consider using **Dynamic DNS** (DDNS) services like:
  - No-IP (free)
  - DuckDNS (free)
  - DynDNS
  
- Then use a domain instead: `ws://yourname.ddns.net:3000`

### HTTPS vs HTTP
- GitHub Pages uses **HTTPS** by default
- Your local server uses **HTTP** (ws:// not wss://)
- This is okay because the WebSocket connection is direct to your IP, not through GitHub
- Browsers may show "mixed content" warnings, but WebSocket connections will work

### Security Considerations
⚠️ **Exposing your PC to the internet has risks:**
- Only share the link with trusted users
- Consider adding authentication
- Keep your server software updated
- Use a strong firewall
- Consider using a reverse proxy with SSL termination

### For Local Network Only
If you only need this to work within your home/school network:
- Use your **local IP** (e.g., `192.168.1.100`)
- No need for port forwarding
- No need for public IP
- Much more secure!

Example:
```javascript
const WS_URL = 'ws://192.168.1.100:3000';
```

## Troubleshooting

### Connection Fails
1. Check if server is running: `http://YOUR_IP:3000`
2. Verify port forwarding: https://www.yougetsignal.com/tools/open-ports/
3. Check firewall settings
4. Ensure WebSocket URL is correct in all three files

### Mixed Content Errors
- These are normal when connecting from HTTPS (GitHub) to ws:// (your PC)
- The connection should still work despite the warning
- To fix completely, you'd need WSS (WebSocket Secure) with SSL certificates

### Can't Access from Outside Network
1. Verify public IP is correct
2. Check port forwarding rules
3. Ensure firewall allows port 3000
4. Some ISPs block incoming ports - contact them if needed

## Alternative: Use a VPS or Cloud Service

For production use, consider:
- **Heroku** (free tier available)
- **Railway** (free tier)
- **Render** (free tier)
- **DigitalOcean** ($5/month)
- **AWS/Azure/GCP** (various pricing)

These provide static IPs and better uptime than home hosting.

## Quick Reference

Files to modify:
- ✅ `public/student.js` - Line 2
- ✅ `public/game.js` - Line 337

Server requirements:
- Port 3000 open and forwarded
- Node.js with Express and WebSocket support
- Public IP or domain name

GitHub Pages setup:
- Enable in Repository Settings → Pages
- Deploy from main branch
- Site goes live at `username.github.io/repo`
