# GitHub Pages + ngrok Setup Guide

This guide shows you how to host your game server on your PC while using GitHub Pages as the frontend, with ngrok handling the public exposure without needing port forwarding.

## Architecture Overview

```
End Users → GitHub Pages (HTML/CSS/JS) → ngrok Tunnel → Your PC (Node.js Server)
```

- **GitHub Pages**: Serves the static HTML/CSS/JavaScript files
- **ngrok**: Creates a secure tunnel from the internet to your local server (no port forwarding needed!)
- **Your PC**: Runs the actual game server with WebSocket and embedding functionality

## Prerequisites

1. Node.js installed on your PC
2. A GitHub account
3. ngrok account (free tier works fine)

## Step-by-Step Setup

### Step 1: Install ngrok

1. Go to [https://ngrok.com/download](https://ngrok.com/download)
2. Sign up for a free account
3. Download ngrok for your operating system
4. Extract the file and move it to a convenient location (e.g., `C:\ngrok` on Windows or `/usr/local/bin` on Mac/Linux)
5. Connect your ngrok account by running:
   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```
   (Find your auth token in the ngrok dashboard at https://dashboard.ngrok.com/get-started/your-authtoken)

### Step 2: Start Your Local Server

Open a terminal in your project directory and run:

```bash
npm start
```

Or if you don't have a start script:

```bash
node server.js
```

Your server should now be running on `http://localhost:3000`

### Step 3: Create ngrok Tunnel

Open a **new terminal window** (keep your server running in the first one) and run:

```bash
ngrok http 3000
```

You'll see output like this:

```
Session Status                online
Account                       Your Name (Plan: Free)
Version                       3.x.x
Region                        United States (us)
Forwarding                    https://abc123.ngrok.io -> http://localhost:3000
Forwarding                    http://abc123.ngrok.io -> http://localhost:3000
```

**Important**: Copy the **HTTPS** URL (e.g., `https://abc123.ngrok.io`)

### Step 4: Update Client Configuration

Now update the WebSocket URLs in your client JavaScript files to use the ngrok URL.

#### Update `public/student.js`:

Replace line 2:
```javascript
const WS_URL = 'wss://YOUR_NGROK_URL.ngrok.io';
```

For example:
```javascript
const WS_URL = 'wss://abc123.ngrok.io';
```

**Note**: Use `wss://` (secure WebSocket) instead of `ws://` when using ngrok HTTPS.

#### Update `public/game.js`:

Replace line 337:
```javascript
const WS_URL = 'wss://YOUR_NGROK_URL.ngrok.io';
```

For example:
```javascript
const WS_URL = 'wss://abc123.ngrok.io';
```

### Step 5: Deploy to GitHub Pages

1. **Initialize Git** (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Create a GitHub repository**:
   - Go to https://github.com/new
   - Create a new public repository
   - Follow the instructions to push your code

3. **Push your code**:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

4. **Enable GitHub Pages**:
   - Go to your repository on GitHub
   - Click on **Settings** → **Pages**
   - Under "Build and deployment", select:
     - Source: **Deploy from a branch**
     - Branch: **main** (or master)
     - Folder: **/root**
   - Click **Save**

5. **Wait for deployment**:
   - GitHub will deploy your site (takes 1-2 minutes)
   - Your site will be available at: `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`

### Step 6: Access Your Game

- **Students**: Visit your GitHub Pages URL (e.g., `https://username.github.io/repo/student.html`)
- **Teacher**: Visit your GitHub Pages URL (e.g., `https://username.github.io/repo/teacher.html`)

The frontend loads from GitHub Pages, but all WebSocket connections go through ngrok to your PC!

## Important Notes

### ⚠️ ngrok URL Changes

On the **free plan**, ngrok gives you a **random URL that changes every time you restart ngrok**. Every time you restart:

1. Stop ngrok (Ctrl+C)
2. Restart ngrok: `ngrok http 3000`
3. Copy the new HTTPS URL
4. Update the `WS_URL` in both `student.js` and `game.js`
5. Commit and push the changes to GitHub:
   ```bash
   git add public/student.js public/game.js
   git commit -m "Update ngrok URL"
   git push
   ```

### 💡 Pro Tip: Fixed ngrok Domain (Paid Option)

If you want a permanent URL that doesn't change:

1. Upgrade to ngrok's paid plan ($8/month)
2. Reserve a custom subdomain in the ngrok dashboard
3. Start ngrok with: `ngrok http 3000 --domain your-fixed-name.ngrok.io`
4. You'll only need to set the URL once!

### 🔒 Security Considerations

- Your server is exposed to the internet via ngrok
- ngrok provides basic security, but consider adding authentication for production use
- The free ngrok plan has bandwidth and connection limits
- Anyone with the ngrok URL can potentially connect to your server

### 🛑 When You're Done Playing

Remember to:
1. Stop ngrok (Ctrl+C in the terminal)
2. Stop your Node.js server (Ctrl+C)
3. This closes the tunnel and makes your server inaccessible from the internet

## Troubleshooting

### Connection Issues

**Problem**: Students can't connect

**Solutions**:
- Make sure ngrok is running and shows "online" status
- Verify the ngrok URL in `student.js` and `game.js` matches the current ngrok URL
- Check that you're using `wss://` (not `ws://`) with the ngrok HTTPS URL
- Ensure your Node.js server is running on port 3000

### WebSocket Connection Failed

**Problem**: Console shows "WebSocket connection failed"

**Solutions**:
- Check browser console for specific error messages
- Verify ngrok is forwarding to the correct port (3000)
- Try accessing `https://YOUR_NGROK_URL.ngrok.io/api/game` in your browser - you should see JSON data
- Make sure your firewall isn't blocking localhost connections

### GitHub Pages Not Updating

**Problem**: Changes to JS files aren't reflected

**Solutions**:
- Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
- Clear browser cache
- Check GitHub Actions tab to ensure deployment completed successfully
- Verify you pushed the latest commits

## Alternative Tunneling Services

If you prefer alternatives to ngrok:

### Cloudflare Tunnel (Free, No Account Limits)
```bash
# Install cloudflared
# Then run:
cloudflared tunnel --url http://localhost:3000
```

### LocalXpose
```bash
loclx tunnel http --to localhost:3000
```

### Serveo (No Installation)
```bash
ssh -R 80:localhost:3000 serveo.net
```

All of these work similarly - just update the `WS_URL` in your JavaScript files accordingly.

## Quick Start Checklist

- [ ] Install ngrok and add auth token
- [ ] Start Node.js server (`node server.js`)
- [ ] Start ngrok tunnel (`ngrok http 3000`)
- [ ] Copy ngrok HTTPS URL
- [ ] Update `WS_URL` in `public/student.js`
- [ ] Update `WS_URL` in `public/game.js`
- [ ] Commit and push to GitHub
- [ ] Enable GitHub Pages in repository settings
- [ ] Test student and teacher pages

## Example Session

Here's what a typical gaming session looks like:

```bash
# Terminal 1 - Start server
$ node server.js
Server running on http://localhost:3000
Loading embedding model...
Embedding model loaded successfully

# Terminal 2 - Start ngrok
$ ngrok http 3000
Forwarding: https://abc123.ngrok.io -> http://localhost:3000

# Update JS files with: wss://abc123.ngrok.io
# Commit and push to GitHub
$ git add public/student.js public/game.js
$ git commit -m "Update ngrok URL"
$ git push

# Share GitHub Pages URL with students!
```

Enjoy your game! 🎮
