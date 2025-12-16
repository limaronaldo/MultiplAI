# 🚀 AutoDev Deployment Guide

## ✅ Your App is Live!

**Production URL:** https://autodev.fly.dev

---

## 📊 Current Status

```
✅ Deployed: December 10, 2025
✅ Region: gru (São Paulo, Brazil)
✅ Machines: 2 running (zero-downtime deployments)
✅ Health: All checks passing
✅ Database: Connected to Neon PostgreSQL
```

---

## 🔗 Important URLs

| Service | URL |
|---------|-----|
| **Production App** | https://autodev.fly.dev |
| **Health Check** | https://autodev.fly.dev/api/health |
| **Tasks API** | https://autodev.fly.dev/api/tasks |
| **Webhook Endpoint** | https://autodev.fly.dev/webhooks/github |
| **Fly.io Dashboard** | https://fly.io/apps/autodev |

---

## 🎯 GitHub Webhook Configuration

### Step 1: Go to Your Repository Settings

Navigate to: `https://github.com/limaronaldo/autodev-test/settings/hooks`

### Step 2: Add Webhook

Click **"Add webhook"** and configure:

```
Payload URL:    https://autodev.fly.dev/webhooks/github
Content type:   application/json
Secret:         (see .env.local - GITHUB_WEBHOOK_SECRET)
```

### Step 3: Select Events

Check these events:
- ✅ **Issues** - When issues are opened, labeled, etc.
- ✅ **Check runs** - When CI/tests complete

### Step 4: Save

Click "Add webhook" - you're done!

---

## 🧪 Test Your Deployment

### Test 1: Health Check

```bash
curl https://autodev.fly.dev/api/health
```

Expected response:
```json
{"status":"ok","timestamp":"2025-12-10T..."}
```

### Test 2: List Tasks

```bash
curl https://autodev.fly.dev/api/tasks
```

### Test 3: Create a Real Issue

1. Go to: https://github.com/limaronaldo/autodev-test/issues/new
2. Create issue: "Add hello world function"
3. Add label: **`auto-dev`**
4. Watch AutoDev create a PR!

---

## 📋 Configured Secrets

Your app has these secrets configured in Fly.io:

```
✅ GITHUB_TOKEN           - For creating PRs and branches
✅ ANTHROPIC_API_KEY      - For Claude AI agents
✅ DATABASE_URL           - Neon PostgreSQL connection
✅ GITHUB_WEBHOOK_SECRET  - Webhook security
✅ LINEAR_API_KEY         - Optional Linear integration
✅ ALLOWED_REPOS          - limaronaldo/autodev-test
```

---

## 🛠️ Common Commands

### Deploy Updates

```bash
cd /Users/ronaldo/Projects/DEVMAX/autodev
flyctl deploy -a autodev
```

### View Logs

```bash
flyctl logs -a autodev
```

### Check Status

```bash
flyctl status -a autodev
```

### Open Dashboard

```bash
flyctl dashboard -a autodev
```

### SSH into Machine

```bash
flyctl ssh console -a autodev
```

### Update Secrets

```bash
flyctl secrets set KEY=value -a autodev
```

---

## 📊 Monitoring

### View in Real-Time

```bash
flyctl logs -a autodev
```

### Check Metrics

Visit: https://fly.io/apps/autodev/monitoring

### Health Checks

The app runs health checks every 30 seconds:
- URL: `/api/health`
- Expected: 200 OK with `{"status":"ok"}`

---

## 🔄 Scaling

### Add More Memory

```bash
flyctl scale memory 1024 -a autodev
```

### Add More Machines

```bash
flyctl scale count 3 -a autodev
```

### Change Region

```bash
flyctl regions add iad -a autodev  # Add US East
```

---

## 🐛 Troubleshooting

### App Not Responding

```bash
# Check status
flyctl status -a autodev

# Restart app
flyctl apps restart autodev

# View logs
flyctl logs -a autodev
```

### Secrets Not Working

```bash
# List secrets
flyctl secrets list -a autodev

# Update secret
flyctl secrets set GITHUB_TOKEN=new_value -a autodev
```

### Database Connection Issues

```bash
# Check DATABASE_URL is correct
flyctl secrets list -a autodev

# Test connection from SSH
flyctl ssh console -a autodev
psql $DATABASE_URL -c "SELECT 1;"
```

### Webhook Not Receiving Events

1. Check webhook is configured in GitHub
2. Check webhook secret matches
3. View failed deliveries in GitHub settings
4. Check logs: `flyctl logs -a autodev`

---

## 📈 Usage Monitoring

### Check Task Status

```bash
curl https://autodev.fly.dev/api/tasks | python3 -m json.tool
```

### Database Queries

```bash
# Connect to database
psql $DATABASE_URL

# Check recent tasks
SELECT id, status, github_issue_number, github_issue_title 
FROM tasks 
ORDER BY created_at DESC 
LIMIT 10;

# Check task events
SELECT COUNT(*) FROM task_events;
```

---

## 💰 Cost Information

**Current Setup:**
- **Compute:** 2 shared-cpu-1x machines (512 MB RAM each)
- **Region:** gru (São Paulo)
- **Database:** Neon Free Tier (external)

**Estimated Cost:** ~$5-10/month for compute

**Free allowances:**
- First 3 shared machines free
- 160GB bandwidth/month free

---

## 🚨 Emergency Procedures

### App Down - Quick Recovery

```bash
# 1. Check status
flyctl status -a autodev

# 2. View logs
flyctl logs -a autodev

# 3. Restart
flyctl apps restart autodev

# 4. If still down, redeploy
flyctl deploy -a autodev
```

### Roll Back to Previous Version

```bash
# List releases
flyctl releases -a autodev

# Rollback to previous
flyctl releases rollback -a autodev
```

---

## 📚 Next Steps

### 1. Test with Real Issue

Create an issue in your repo and label it `auto-dev`

### 2. Monitor First PR

```bash
flyctl logs -a autodev  # Watch it work
```

### 3. Configure More Repos

```bash
# Add more repos (comma-separated)
flyctl secrets set ALLOWED_REPOS="repo1,repo2,repo3" -a autodev
```

### 4. Set Up Alerts

Configure in: https://fly.io/apps/autodev/monitoring

---

## 🎓 Learning Resources

- **Fly.io Docs:** https://fly.io/docs/
- **AutoDev Docs:** See CLAUDE.md, TESTING.md
- **GitHub Webhooks:** https://docs.github.com/webhooks

---

## ✅ Deployment Checklist

- [x] App deployed to Fly.io
- [x] All secrets configured
- [x] Health checks passing
- [x] Database connected
- [x] Server listening on 0.0.0.0:3000
- [ ] GitHub webhook configured (do this now!)
- [ ] Test with real issue
- [ ] Monitor first PR creation

---

## 📞 Support

**AutoDev Issues:** Check TESTING.md for troubleshooting

**Fly.io Support:** https://community.fly.io/

**GitHub Webhook Issues:** Check delivery logs in repo settings

---

**🎉 Congratulations! AutoDev is live in production!**

Your webhook URL: `https://autodev.fly.dev/webhooks/github`

Now go configure it in GitHub and watch the magic happen! ✨
