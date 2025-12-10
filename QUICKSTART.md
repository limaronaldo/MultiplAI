# AutoDev Quick Start Guide

Get AutoDev running in 5 minutes! 🚀

---

## Prerequisites

- [Bun](https://bun.sh) installed
- GitHub account with a test repository
- Anthropic API key
- Neon PostgreSQL database (free tier works)

---

## 1. Clone and Install (1 min)

```bash
git clone <your-repo-url> autodev
cd autodev
bun install
```

---

## 2. Configure Environment (2 min)

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# GitHub - Get token from: https://github.com/settings/tokens
GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Anthropic - Get key from: https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx

# Neon - Create free DB: https://console.neon.tech/
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# Linear (optional) - Get from: https://linear.app/settings/api
LINEAR_API_KEY=lin_api_xxxxxxxxxxxx

# Your GitHub repo (format: owner/repo)
ALLOWED_REPOS=your-username/your-test-repo
```

---

## 3. Setup Database (30 sec)

```bash
bun run db:migrate
```

Expected output:
```
✅ Created tasks table
✅ Created task_events table
✅ Created patches table
✅ Created indexes
✅ Migrations complete!
```

---

## 4. Test Everything (1 min)

```bash
# Verify setup
bun run test-setup.ts
```

Expected output:
```
✅ Database connected!
✅ GitHub client initialized
✅ Planner Agent working!
```

---

## 5. Start Server (30 sec)

```bash
bun run dev
```

Server starts at: `http://localhost:3000`

Test health check:
```bash
curl http://localhost:3000/api/health
# {"status":"ok","timestamp":"..."}
```

---

## 6. Test with Mock Webhook

In another terminal:

```bash
bun run test-webhook.ts
```

Expected:
```
✅ Webhook accepted!
Response: {
  "ok": true,
  "message": "Task created and processing started",
  "taskId": "..."
}
```

Check task status:
```bash
curl http://localhost:3000/api/tasks
```

---

## 7. (Optional) Test with Real GitHub Issue

### Setup GitHub Webhook

1. Go to your repo: `https://github.com/your-username/your-test-repo/settings/hooks`
2. Click **Add webhook**
3. Configure:
   - **Payload URL**: `http://your-ngrok-url/webhooks/github` (see below)
   - **Content type**: `application/json`
   - **Secret**: Copy from `.env` (`GITHUB_WEBHOOK_SECRET`)
   - **Events**: Select `Issues` and `Check runs`
4. Click **Add webhook**

### Expose Local Server (for testing)

```bash
# Install ngrok: https://ngrok.com/
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Use this as your webhook URL
```

### Create Test Issue

1. Go to: `https://github.com/your-username/your-test-repo/issues/new`
2. Create issue:
   ```
   Title: Add hello world function
   Body: Create a simple function that returns "Hello, World!"
   ```
3. Add label: `auto-dev`

### Watch the Magic! ✨

AutoDev will:
1. Receive webhook → Create task
2. Plan the implementation
3. Generate code as diff
4. Create branch: `auto/1-add-hello-world-function`
5. Apply diff to branch
6. Open PR
7. Run tests (via GitHub Actions)
8. Review code
9. Add comment to PR

---

## Common Commands

### Development
```bash
bun run dev          # Start with auto-reload
bun run start        # Production mode
bun run typecheck    # Check TypeScript
```

### Testing
```bash
bun run test-setup.ts    # Verify setup
bun run test-e2e.ts      # End-to-end workflow
bun run test-webhook.ts  # Test webhook
```

### Database
```bash
bun run db:migrate                    # Run migrations
psql $DATABASE_URL                    # Connect to DB
psql $DATABASE_URL -c "SELECT COUNT(*) FROM tasks;"
```

### API
```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/tasks
curl http://localhost:3000/api/tasks/{id}
```

---

## Deploy to Production (Fly.io)

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Create app
fly apps create autodev --region gru

# Set secrets
fly secrets set GITHUB_TOKEN=xxx
fly secrets set ANTHROPIC_API_KEY=xxx
fly secrets set DATABASE_URL=xxx
fly secrets set LINEAR_API_KEY=xxx
fly secrets set GITHUB_WEBHOOK_SECRET=xxx

# Deploy
fly deploy

# Get app URL
fly info
# Use this URL for GitHub webhook
```

Update GitHub webhook URL to: `https://autodev.fly.dev/webhooks/github`

---

## Troubleshooting

### "Database connection failed"
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1;"

# Re-run migrations
bun run db:migrate
```

### "GitHub API error"
```bash
# Test token
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user

# Check rate limit
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/rate_limit
```

### "Webhook not received"
- Check ngrok is running: `ngrok http 3000`
- Verify webhook URL in GitHub settings
- Check webhook delivery logs in GitHub
- Verify secret matches `.env`

### "Agent returns error"
- Check Anthropic API key is valid
- Verify you have API credits
- Check logs for detailed error

---

## What's Next?

1. **Review CLAUDE.md** - Complete codebase documentation
2. **Review TESTING.md** - Comprehensive testing guide
3. **Review TEST_RESULTS.md** - Latest test results
4. **Review DESIGN.md** - Architecture and design decisions

---

## Getting Help

- **Documentation**: See `CLAUDE.md` for complete guide
- **Testing**: See `TESTING.md` for all test scenarios
- **Issues**: Check `TEST_RESULTS.md` for known issues

---

## Example Issue Templates

### Simple Function
```
Title: Add utility function to capitalize strings
Body: Create a function that capitalizes the first letter of each word
Label: auto-dev
```

### Bug Fix
```
Title: Fix null pointer in date formatter
Body: The formatDate function crashes when given null input
Label: auto-dev
```

### Documentation
```
Title: Add JSDoc comments to utility functions
Body: Add comprehensive JSDoc comments to all functions in src/utils/
Label: auto-dev
```

---

**Time to first PR: ~5 minutes** ⚡

Ready to automate your development workflow? Let's go! 🚀
