# 📋 AutoDev Command Reference

Quick reference for all available commands.

---

## 🚀 Getting Started

| Command | What It Does | When to Use |
|---------|-------------|-------------|
| `bun run setup` | Interactive setup wizard | First time setup |
| `bun run menu` | Open control panel | Anytime you need help |

---

## 🎮 Daily Commands

| Command | What It Does |
|---------|-------------|
| `bun run dev` | Start server (auto-reload) |
| `bun run start` | Start server (production) |
| `bun run menu` | Interactive menu |
| `bun run status` | Quick status check |
| `bun run tasks` | List all tasks |

---

## 🧪 Testing

| Command | What It Does | Duration |
|---------|-------------|----------|
| `bun run test:setup` | Verify setup | 30 sec |
| `bun run test:e2e` | Full workflow test | 1 min |
| `bun run test:webhook` | Test webhook | 5 sec |
| `bun run test:all` | Run all tests | 2 min |

---

## 🗄️ Database

| Command | What It Does |
|---------|-------------|
| `bun run db:migrate` | Create/update tables |
| `bun run clean` | Delete test tasks |
| `psql $DATABASE_URL` | Connect to database |

---

## 🔍 Debugging

| Command | What It Does |
|---------|-------------|
| `bun run menu` → 2 | View system status |
| `bun run menu` → 6 | View logs |
| `bun run typecheck` | Check TypeScript |

---

## 📚 Documentation

| Command | What It Does |
|---------|-------------|
| `cat START_HERE.md` | Beginner guide |
| `cat QUICKSTART.md` | 5-minute setup |
| `cat CLAUDE.md` | Full dev guide |
| `cat TESTING.md` | Testing guide |
| `cat COMMANDS.md` | This file |

---

## 🚨 Emergency

| Problem | Solution |
|---------|----------|
| Server won't start | `lsof -i :3000` then `kill -9 <PID>` |
| Database error | `bun run db:migrate` |
| Stuck task | `bun run clean` |
| Lost? | `bun run menu` |

---

## 💡 Pro Tips

### Check Everything is Working
```bash
bun run status
```

### Start Fresh
```bash
bun run clean      # Delete test data
bun run db:migrate # Reset database
bun run dev        # Start server
```

### Monitor Tasks
```bash
# Option 1: Interactive
bun run menu → 3

# Option 2: API
curl http://localhost:3000/api/tasks

# Option 3: Database
psql $DATABASE_URL -c "SELECT * FROM tasks ORDER BY created_at DESC LIMIT 5;"
```

---

## 🎯 Common Workflows

### First Time Setup
```bash
bun run setup
# Follow the wizard
```

### Daily Development
```bash
bun run menu
# Use option 1 to start server
# Use option 3 to view tasks
```

### Testing Before Deployment
```bash
bun run test:all
```

### Deploy to Production
```bash
fly deploy
```

---

## 🔑 Environment Variables

Quick reference - see `.env.example` for full list:

| Variable | Required | Where to Get |
|----------|----------|-------------|
| `GITHUB_TOKEN` | ✅ Yes | https://github.com/settings/tokens |
| `ANTHROPIC_API_KEY` | ✅ Yes | https://console.anthropic.com/ |
| `DATABASE_URL` | ✅ Yes | https://console.neon.tech/ |
| `LINEAR_API_KEY` | ❌ No | https://linear.app/settings/api |
| `ALLOWED_REPOS` | ✅ Yes | `owner/repo` format |

---

**Lost?** Just run: `bun run menu`
