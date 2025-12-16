# 🚀 START HERE - Your First 2 Minutes with AutoDev

Welcome! This guide gets you started **fast**.

---

## ⚡ Super Quick Start (Choose One)

### Option A: Interactive Setup (Recommended for Beginners)

```bash
bun run setup
```

This wizard will:
- ✅ Check your environment
- ✅ Install dependencies  
- ✅ Ask for your API keys (GitHub, Anthropic, Database)
- ✅ Test everything works
- ✅ Start the server

**That's it!** Just answer the questions.

---

### Option B: Interactive Menu (If Already Setup)

```bash
bun run menu
```

Opens a friendly menu where you can:
- Start/stop the server
- View tasks
- Run tests
- Check status
- View documentation

---

### Option C: Manual Setup (For Advanced Users)

```bash
# 1. Install
bun install

# 2. Setup environment
cp .env.example .env
# Edit .env with your keys

# 3. Setup database
bun run db:migrate

# 4. Start
bun run dev
```

---

## 📋 What You Need

Before starting, get these ready:

| What | Where to Get It | Why |
|------|----------------|-----|
| **GitHub Token** | https://github.com/settings/tokens | To create PRs |
| **Anthropic API Key** | https://console.anthropic.com/ | For AI agents (Claude) |
| **Neon Database** | https://console.neon.tech/ | To store tasks (free tier OK) |
| **GitHub Repo** | Create test repo | Where AutoDev will work |

**Optional:**
- **Linear API Key** - For issue tracking (https://linear.app/settings/api)

---

## 🎯 How It Works (Simple Explanation)

```
You create GitHub issue
        ↓
Label it: "auto-dev"
        ↓
AutoDev sees it (via webhook)
        ↓
AI plans the solution
        ↓
AI writes the code
        ↓
AI reviews the code
        ↓
AutoDev opens PR
        ↓
You review & merge!
```

**Time: ~35 seconds from issue to PR**

---

## 🤔 Which Command Do I Use?

### Setting Up (First Time)
```bash
bun run setup          # Interactive setup wizard
```

### Daily Use
```bash
bun run menu           # Open control panel
bun run dev            # Start server
bun run status         # Check if everything's running
bun run tasks          # See all tasks
```

### Testing
```bash
bun run test:setup     # Quick test (30 seconds)
bun run test:e2e       # Full workflow test (1 minute)
bun run test:webhook   # Test webhook (needs server running)
```

### When Things Go Wrong
```bash
bun run menu           # Use option 2 "View Status"
bun run db:migrate     # Reset database
bun run clean          # Delete test tasks
```

---

## 🆘 I'm Stuck - Quick Fixes

### "Setup fails"
→ Check you have Bun installed: `bun --version`
→ If not: `curl -fsSL https://bun.sh/install | bash`

### "Database error"
→ Check your DATABASE_URL in .env
→ Make sure Neon database is created
→ Run: `bun run db:migrate`

### "Server won't start"
→ Check port 3000 is free: `lsof -i :3000`
→ Kill if needed: `kill -9 $(lsof -t -i:3000)`

### "API key doesn't work"
→ Verify in .env file exists
→ Check keys are correct (no spaces)
→ GitHub token needs "repo" permission

### "Nothing happens when I label issue"
→ Is server running? `bun run status`
→ Is webhook configured in GitHub?
→ Check logs: View in menu option 6

---

## 📚 Next Steps

After setup, try this:

### 1. Test Locally
```bash
# Terminal 1
bun run dev

# Terminal 2
bun run test:webhook
```

### 2. Create Real Issue
1. Go to your GitHub repo
2. Create new issue
3. Add label: `auto-dev`
4. Watch server logs!

### 3. Configure Webhook
- Repo → Settings → Webhooks
- URL: `http://localhost:3000/webhooks/github` (for testing)
- Content type: `application/json`
- Events: Issues, Check runs

### 4. Deploy to Production
```bash
fly deploy
```

---

## 📖 Want to Learn More?

| Document | When to Read |
|----------|-------------|
| **START_HERE.md** | ← You are here! |
| **QUICKSTART.md** | Detailed 5-min setup |
| **CLAUDE.md** | Full development guide |
| **TESTING.md** | All about testing |
| **README.md** | Project overview |

---

## 💡 Pro Tips

1. **Start with the menu**: `bun run menu` - It's the easiest way
2. **Test locally first**: Use `test:webhook` before real issues
3. **Small issues only**: AutoDev works best on XS/S tasks
4. **Check the DoD**: After planning, review if it understood correctly
5. **Use the dashboard**: Menu option 3 shows all tasks

---

## 🎉 Success Looks Like This

When everything works:

```bash
$ bun run status
✅ Server: Running
✅ Database: Connected (2 tasks)
✅ Configuration: Complete

$ bun run tasks
#1 - Add README documentation
  Status: PR_CREATED
  PR: https://github.com/you/repo/pull/5
```

---

## 🚨 Common First-Time Mistakes

❌ **Forgetting to start server before testing webhook**
✅ Always: `bun run dev` first, then `bun run test:webhook`

❌ **Wrong GitHub repo format**
✅ Use: `owner/repo` not `https://github.com/owner/repo`

❌ **Testing on large issues**
✅ Start with simple: "Add hello world function"

❌ **Not configuring webhook in GitHub**
✅ Server won't get notified without it

---

## 🎮 Interactive Mode is Your Friend

Confused? Just run:

```bash
bun run menu
```

It shows you everything in a simple menu:
- ✅ Status check
- ✅ Start server
- ✅ View tasks
- ✅ Run tests
- ✅ View docs

**You never need to remember commands!**

---

## 📞 Still Stuck?

1. Check **TROUBLESHOOTING** section in TESTING.md
2. Run `bun run menu` → option 2 (View Status)
3. Check logs: `bun run menu` → option 6 (View Logs)

---

**Ready?** 

```bash
bun run setup
```

Let's go! 🚀
