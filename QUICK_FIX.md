# Quick Start: Fix Data Loss on Render

Your edits weren't persisting because Render rebuilds from GitHub, wiping the local JSON file.

## ✅ Easiest Fix: Render Persistent Disk (Already Configured!)

1. **Just redeploy** to Render - the `render.yaml` now includes:
   ```yaml
   disk:
     name: portfolio-data
     mountPath: /opt/render/project/src/data
     sizeGB: 1
   ```

2. **That's it!** Your edits will now survive deploys. **FREE**, no setup needed.

---

## Alternative: MongoDB Atlas (5-min setup)

If the disk doesn't work or you want cloud database:

**Quick Steps:**
1. https://www.mongodb.com/cloud/atlas/register
2. Create **M0 FREE** cluster
3. Add database user (save password!)
4. Whitelist all IPs (0.0.0.0/0)
5. Copy connection string
6. Add to Render env var: `MONGODB_URI=mongodb+srv://user:pass@cluster...`

**See [PERSISTENCE_SETUP.md](PERSISTENCE_SETUP.md) for detailed instructions.**

---

## Verify It Works

After redeploying to Render:

1. Edit a division name or value
2. Wait for logs: `[STORAGE] Portfolio saved successfully`
3. Trigger another deploy (push dummy commit)
4. Check if your edit is still there ✅

If using MongoDB, logs will show: `[STORAGE] Connected to MongoDB` and `[STORAGE] Portfolio saved to MongoDB`

---

**Cost:** Both options are **100% FREE**
