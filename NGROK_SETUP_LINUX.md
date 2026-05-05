# Setting Up with ngrok on Linux

This guide will help you set up your self-hosted game server with ngrok tunneling, allowing GitHub Pages to serve as the frontend while your PC hosts the backend.

## Prerequisites

- Linux operating system
- Node.js installed
- Git installed
- ngrok account (free tier works)

## Step 1: Install ngrok on Linux

### Option A: Using Snap (Recommended for Ubuntu/Debian)
```bash
sudo snap install ngrok
```

### Option B: Using Direct Download
```bash
# Download ngrok
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz

# Extract it
tar -xvzf ngrok-v3-stable-linux-amd64.tgz

# Move to /usr/local/bin
sudo mv ngrok /usr/local/bin/

# Make it executable
chmod +x /usr/local/bin/ngrok
```

### Option C: Using APT (Debian/Ubuntu)
```bash
# Add ngrok repository
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc

echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list

# Update and install
sudo apt update
sudo apt install ngrok
```

## Step 2: Authenticate ngrok

1. Sign up at [https://dashboard.ngrok.com/signup](https://dashboard.ngrok.com/signup)
2. Get your auth token from the dashboard
3. Run:
```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN_HERE
```

## Step 3: Start Your Game Server

In your project directory:
```bash
node server.js
```

Keep this terminal open - your server is now running on `http://localhost:3000`

## Step 4: Create ngrok Tunnel

Open a **new terminal** and run:
```bash
ngrok http 3000
```

You'll see output like:
```
Forwarding    https://abc123def456.ngrok.io -> http://localhost:3000
```

**Copy the HTTPS URL** (e.g., `https://abc123def456.ngrok.io`)

## Step 5: Update Configuration Files

Edit these two files and replace `YOUR_NGROK_URL` with your actual ngrok subdomain:

### File 1: `/workspace/public/student.js` (Line 2)
Change:
```javascript
const WS_URL = 'wss://YOUR_NGROK_URL.ngrok.io';
```
To (example):
```javascript
const WS_URL = 'wss://abc123def456.ngrok.io';
```

### File 2: `/workspace/public/game.js` (Line 337)
Change:
```javascript
const WS_URL = 'wss://YOUR_NGROK_URL.ngrok.io';
```
To (example):
```javascript
const WS_URL = 'wss://abc123def456.ngrok.io';
```

**Important Notes:**
- Use `wss://` (WebSocket Secure), NOT `ws://`
- Don't include the `https://` prefix - use just the domain
- The URL must match exactly what ngrok gives you

## Step 6: Deploy to GitHub Pages

```bash
# Commit your changes
git add public/student.js public/game.js
git commit -m "Update WebSocket URL for ngrok"

# Push to GitHub
git push origin main
```

Then in your GitHub repository:
1. Go to **Settings** → **Pages**
2. Under "Source", select your branch (usually `main`)
3. Click **Save**
4. Wait a few minutes for deployment
5. Your site will be available at `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME`

## Step 7: Test Everything

1. Keep your server running: `node server.js`
2. Keep ngrok running: `ngrok http 3000`
3. Visit your GitHub Pages URL
4. Try joining a game room!

## Important: ngrok Free Tier Limitations

⚠️ **The free ngrok plan has limitations:**
- **URL changes every restart**: Each time you stop and restart ngrok, you get a new random URL
- **Session timeout**: Connections may timeout after extended periods
- **Bandwidth limits**: Limited bandwidth for free tier

### What This Means:
Every time you restart ngrok, you must:
1. Copy the new ngrok URL
2. Update both JavaScript files (`student.js` and `game.js`)
3. Commit and push to GitHub
4. Wait for GitHub Pages to redeploy (~1-2 minutes)

### Workaround for Development:
Keep ngrok running in a screen/tmux session so it doesn't restart:
```bash
# Install tmux if not installed
sudo apt install tmux  # or sudo yum install tmux

# Start a tmux session
tmux

# Run ngrok inside tmux
ngrok http 3000

# Detach from tmux (keeps it running)
# Press Ctrl+B, then D

# Reattach later
tmux attach
```

## Alternative: ngrok Paid Plans

If you need a permanent URL, consider ngrok's paid plans which offer:
- Static domains
- Longer session times
- More features

Or explore alternatives like:
- **Cloudflare Tunnel** (free, static URLs)
- **LocalTunnel** (free, but less reliable)
- **Serveo** (free SSH-based tunneling)

## Troubleshooting

### Connection Issues
1. Make sure both terminals are running (server + ngrok)
2. Verify the ngrok URL is correct in both JS files
3. Check that you're using `wss://` not `ws://`
4. Clear browser cache and hard refresh (Ctrl+Shift+R)

### WebSocket Connection Failed
- Ensure ngrok shows "Forwarding" status
- Check browser console for error messages (F12)
- Verify your server is actually running on port 3000

### GitHub Pages Not Updating
- Wait 1-2 minutes after pushing
- Check GitHub Actions tab for deployment status
- Hard refresh your browser (Ctrl+Shift+R)

## Quick Reference Commands

```bash
# Start server
node server.js

# In new terminal - start ngrok
ngrok http 3000

# Check ngrok status (in browser)
# Visit: http://127.0.0.1:4040

# Update git
git add .
git commit -m "Update ngrok URL"
git push

# Run ngrok in background with tmux
tmux new -s ngrok
ngrok http 3000
# Ctrl+B, then D to detach
```

## Security Notes

⚠️ **Important Security Considerations:**
- Your PC is now publicly accessible via ngrok
- Only run this when actively hosting games
- Stop ngrok when not in use
- Keep your system updated
- Consider using a VM or container for additional isolation
- Don't expose sensitive data on your development machine

---

**Need Help?** Check the ngrok documentation at [https://ngrok.com/docs](https://ngrok.com/docs)
