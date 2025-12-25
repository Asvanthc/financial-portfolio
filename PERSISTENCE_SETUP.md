# Data Persistence Setup for Render

**Problem:** Render rebuilds containers from GitHub on each deploy, wiping the `data/portfolio.json` file. Edits don't persist across deploys.

## Solution 1: Render Persistent Disk (Recommended - Simplest)

1. **Already configured** in `render.yaml`:
   ```yaml
   disk:
     name: portfolio-data
     mountPath: /opt/render/project/src/data
     sizeGB: 1
   ```

2. **Deploy to Render:**
   - Push this commit to GitHub
   - Render will automatically detect the disk config
   - The `/data` folder will now persist across deploys

3. **Verify:**
   - Edit your portfolio in production
   - Trigger a redeploy (push a commit or manual redeploy)
   - Your edits should remain! ✅

**Cost:** FREE (1GB included in free tier)

---

## Solution 2: MongoDB Atlas (More Robust)

If you need better reliability or want to access data from multiple deployments:

### Setup MongoDB Atlas (5 minutes):

1. **Create Free Account:**
   - Go to: https://www.mongodb.com/cloud/atlas/register
   - Sign up (no credit card needed)

2. **Create Free Cluster:**
   - Click "Build a Database"
   - Choose **M0 FREE** tier
   - Select region closest to your Render deployment (e.g., US-East)
   - Click "Create"

3. **Setup Database Access:**
   - Go to "Database Access" (left sidebar)
   - Click "Add New Database User"
   - Username: `portfolio-admin`
   - Password: Generate a secure password (save it!)
   - Database User Privileges: **Read and write to any database**
   - Click "Add User"

4. **Setup Network Access:**
   - Go to "Network Access" (left sidebar)
   - Click "Add IP Address"
   - Click "Allow Access from Anywhere" (0.0.0.0/0)
   - Click "Confirm"

5. **Get Connection String:**
   - Go to "Database" → Click "Connect" on your cluster
   - Choose "Connect your application"
   - Driver: **Node.js** version **6.3 or later**
   - Copy the connection string (looks like):
     ```
     mongodb+srv://portfolio-admin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
     ```
   - Replace `<password>` with your actual password

6. **Add to Render:**
   - Go to your Render dashboard
   - Select your web service
   - Go to "Environment" tab
   - Add environment variable:
     - Key: `MONGODB_URI`
     - Value: `mongodb+srv://portfolio-admin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/financial-portfolio?retryWrites=true&w=majority`
   - Click "Save Changes"
   - Render will redeploy automatically

7. **Verify:**
   - Check logs for: `[STORAGE] Connected to MongoDB`
   - Edit your portfolio
   - Check logs for: `[STORAGE] Portfolio saved to MongoDB`
   - Redeploy → edits persist! ✅

**Cost:** FREE (512MB storage, 100 connections)

---

## How It Works

The app now supports **dual storage**:

1. **With `MONGODB_URI` set:** Uses MongoDB Atlas (cloud database)
2. **Without `MONGODB_URI`:** Uses local disk (Render persistent disk)

Both solutions work great! Choose based on your preference:
- **Render Disk:** Simpler, no setup needed
- **MongoDB:** More portable, can migrate to other hosts easily

---

## Troubleshooting

### Render Disk Not Persisting:
- Check Render dashboard → your service → "Disks" tab
- Ensure disk is mounted at `/opt/render/project/src/data`
- Redeploy after adding disk config

### MongoDB Connection Fails:
- Check connection string format
- Ensure password has no special characters (or URL-encode them)
- Verify IP whitelist includes 0.0.0.0/0
- Check Render logs for error messages

### Data Migration:
If you want to move existing data to MongoDB:
1. Download current `data/portfolio.json` from Render shell
2. Save locally
3. Set `MONGODB_URI` in Render
4. Redeploy
5. POST to `/api/portfolio` with your JSON data
