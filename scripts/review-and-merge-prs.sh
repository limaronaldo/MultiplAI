#!/bin/bash

# Interactive PR Review and Merge Script
# Usage: ./scripts/review-and-merge-prs.sh

set -e

REPO="limaronaldo/MultiplAI"
COLOR_GREEN='\033[0;32m'
COLOR_BLUE='\033[0;34m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
COLOR_RESET='\033[0m'

echo -e "${COLOR_BLUE}╔════════════════════════════════════════════════╗${COLOR_RESET}"
echo -e "${COLOR_BLUE}║   MultiplAI PR Interactive Review & Merge     ║${COLOR_RESET}"
echo -e "${COLOR_BLUE}╚════════════════════════════════════════════════╝${COLOR_RESET}"
echo ""

# Function to review and merge a PR
review_and_merge() {
  local PR_NUMBER=$1
  local PR_TITLE=$2
  local CATEGORY=$3
  local FILES=$4

  echo ""
  echo -e "${COLOR_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"
  echo -e "${COLOR_GREEN}📋 PR #${PR_NUMBER}${COLOR_RESET}: ${PR_TITLE}"
  echo -e "${COLOR_BLUE}Category:${COLOR_RESET} ${CATEGORY}"
  echo -e "${COLOR_BLUE}Files:${COLOR_RESET} ${FILES}"
  echo -e "${COLOR_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"

  # Show PR details
  gh pr view $PR_NUMBER --repo $REPO

  echo ""
  echo -e "${COLOR_BLUE}Actions:${COLOR_RESET}"
  echo "  [v] View diff in browser"
  echo "  [m] Merge and continue"
  echo "  [s] Skip this PR"
  echo "  [q] Quit script"
  echo ""

  while true; do
    read -p "Choose action (v/m/s/q): " action

    case $action in
      v|V)
        echo -e "${COLOR_GREEN}Opening PR in browser...${COLOR_RESET}"
        gh pr view $PR_NUMBER --repo $REPO --web
        ;;
      m|M)
        echo -e "${COLOR_GREEN}Merging PR #${PR_NUMBER}...${COLOR_RESET}"
        gh pr merge $PR_NUMBER --repo $REPO --squash --delete-branch || {
          echo -e "${COLOR_RED}❌ Failed to merge PR #${PR_NUMBER}${COLOR_RESET}"
          echo "This might be due to conflicts or branch protection."
          read -p "Continue to next PR? (y/n): " continue_choice
          if [[ $continue_choice != "y" ]]; then
            exit 1
          fi
        }
        echo -e "${COLOR_GREEN}✅ Successfully merged PR #${PR_NUMBER}${COLOR_RESET}"
        return 0
        ;;
      s|S)
        echo -e "${COLOR_YELLOW}⏭️  Skipping PR #${PR_NUMBER}${COLOR_RESET}"
        return 0
        ;;
      q|Q)
        echo -e "${COLOR_YELLOW}👋 Exiting script${COLOR_RESET}"
        exit 0
        ;;
      *)
        echo -e "${COLOR_RED}Invalid option. Please choose v, m, s, or q.${COLOR_RESET}"
        ;;
    esac
  done
}

# Phase 1: Quick Wins (8 PRs)
echo -e "${COLOR_GREEN}═══════════════════════════════════════════════${COLOR_RESET}"
echo -e "${COLOR_GREEN}  PHASE 1: Quick Wins (Low Risk, Easy Review)  ${COLOR_RESET}"
echo -e "${COLOR_GREEN}═══════════════════════════════════════════════${COLOR_RESET}"

review_and_merge 20 "Add getVersion function" "Quick Win" "src/lib/version.ts"
review_and_merge 35 "Add batch label config" "Quick Win" ".env.example"
review_and_merge 184 "Create Button Component" "Quick Win" "components/ui/Button.tsx"
review_and_merge 185 "Create Input/Select Components" "Quick Win" "components/ui/Input.tsx, Select.tsx"
review_and_merge 187 "Create KPICards Component" "Quick Win" "components/dashboard/KPICards.tsx"
review_and_merge 253 "SlideOut Panel Component" "Quick Win" "components/ui/SlideOutPanel.tsx"
review_and_merge 254 "SSE Client Hook" "Quick Win" "hooks/useLogStream.ts"
review_and_merge 186 "Create useMediaQuery Hook" "Quick Win" "hooks/useMediaQuery.ts"

echo -e "${COLOR_GREEN}✅ Phase 1 Complete!${COLOR_RESET}"
read -p "Continue to Phase 2? (y/n): " continue_phase2
if [[ $continue_phase2 != "y" ]]; then
  exit 0
fi

# Phase 2: LangGraph Service Setup (9 PRs)
echo ""
echo -e "${COLOR_GREEN}═══════════════════════════════════════════════${COLOR_RESET}"
echo -e "${COLOR_GREEN}  PHASE 2: LangGraph Service (Sequential)     ${COLOR_RESET}"
echo -e "${COLOR_GREEN}═══════════════════════════════════════════════${COLOR_RESET}"

echo -e "${COLOR_YELLOW}⚠️  Note: Closing duplicate PRs #34 and #40${COLOR_RESET}"
gh pr close 34 --repo $REPO --comment "Duplicate of #21" || true
gh pr close 40 --repo $REPO --comment "Duplicate of #36" || true

review_and_merge 21 "[#6 Part 1/4] listIssuesByLabel" "LangGraph" "src/integrations/github.ts"
review_and_merge 36 "[#7 Part 1/4] pyproject.toml" "LangGraph" "langgraph_service/pyproject.toml"
review_and_merge 37 "[#7 Part 2/4] Pydantic schemas" "LangGraph" "langgraph_service/src/multiplai/schemas.py"
review_and_merge 38 "[#7 Part 3/4] Config.py" "LangGraph" "langgraph_service/src/multiplai/config.py"
review_and_merge 249 "[#8 Part 1/5] load_context node" "LangGraph" "nodes/load_context.py"
review_and_merge 248 "[#8 Part 2/5] plan_issue node" "LangGraph" "nodes/plan_issue.py"
review_and_merge 251 "[#8 Part 3/5] execute_issue node" "LangGraph" "nodes/execute_issue.py"
review_and_merge 250 "[#8 Part 5/5] graph.py + tests" "LangGraph" "graph.py, tests/"

echo -e "${COLOR_GREEN}✅ Phase 2 Complete!${COLOR_RESET}"
read -p "Continue to Phase 3? (y/n): " continue_phase3
if [[ $continue_phase3 != "y" ]]; then
  exit 0
fi

# Phase 3: Dashboard Data Layer (3 PRs - CAREFUL!)
echo ""
echo -e "${COLOR_GREEN}═══════════════════════════════════════════════${COLOR_RESET}"
echo -e "${COLOR_GREEN}  PHASE 3: Dashboard Data Layer (Dependencies) ${COLOR_RESET}"
echo -e "${COLOR_GREEN}═══════════════════════════════════════════════${COLOR_RESET}"

echo -e "${COLOR_YELLOW}⚠️  Note: Review PR #281 carefully - it's 12 files!${COLOR_RESET}"

review_and_merge 182 "API Client - Fetch Functions" "Dashboard" "src/services/apiClient.ts"
review_and_merge 281 "React Hooks (12 files!)" "Dashboard" "src/hooks/*.ts (12 files)"
review_and_merge 256 "TaskList Component" "Dashboard" "components/tasks/TaskList.tsx"

echo -e "${COLOR_GREEN}✅ Phase 3 Complete!${COLOR_RESET}"
read -p "Continue to Phase 4? (y/n): " continue_phase4
if [[ $continue_phase4 != "y" ]]; then
  exit 0
fi

# Phase 4: Advanced Features (6 PRs - TEST EACH)
echo ""
echo -e "${COLOR_GREEN}═══════════════════════════════════════════════${COLOR_RESET}"
echo -e "${COLOR_GREEN}  PHASE 4: Advanced Features (Complex)        ${COLOR_RESET}"
echo -e "${COLOR_GREEN}═══════════════════════════════════════════════${COLOR_RESET}"

echo -e "${COLOR_YELLOW}⚠️  These are complex features - test after merging!${COLOR_RESET}"

review_and_merge 175 "Dependency Graph Builder" "Advanced" "issue-breakdown/dependency-graph.ts"
review_and_merge 176 "IssueBreakdownAgent" "Advanced" "issue-breakdown-agent.ts"
review_and_merge 247 "RAG CodeChunk types" "Advanced" "services/rag/types.ts"
review_and_merge 304 "ReflectionAgent (M)" "Advanced" "agents/reflection.ts"
review_and_merge 305 "MCP analyze tool" "Advanced" "mcp/tools/analyze.ts"
review_and_merge 306 "MCP memory tool (M)" "Advanced" "mcp/tools/memory.ts"

echo -e "${COLOR_GREEN}✅ Phase 4 Complete!${COLOR_RESET}"
read -p "Continue to Phase 5? (y/n): " continue_phase5
if [[ $continue_phase5 != "y" ]]; then
  exit 0
fi

# Phase 5: Settings & Config (1 PR)
echo ""
echo -e "${COLOR_GREEN}═══════════════════════════════════════════════${COLOR_RESET}"
echo -e "${COLOR_GREEN}  PHASE 5: Settings & Config                  ${COLOR_RESET}"
echo -e "${COLOR_GREEN}═══════════════════════════════════════════════${COLOR_RESET}"

review_and_merge 188 "Repository Config Display" "Settings" "settings/RepositoryConfig.tsx"

echo ""
echo -e "${COLOR_GREEN}╔════════════════════════════════════════════════╗${COLOR_RESET}"
echo -e "${COLOR_GREEN}║           🎉 ALL PHASES COMPLETE! 🎉          ║${COLOR_RESET}"
echo -e "${COLOR_GREEN}╚════════════════════════════════════════════════╝${COLOR_RESET}"
echo ""
echo -e "${COLOR_BLUE}Summary:${COLOR_RESET}"
echo "  • Phase 1: Quick Wins - 8 PRs"
echo "  • Phase 2: LangGraph Service - 8 PRs"
echo "  • Phase 3: Dashboard Data Layer - 3 PRs"
echo "  • Phase 4: Advanced Features - 6 PRs"
echo "  • Phase 5: Settings - 1 PR"
echo ""
echo -e "${COLOR_GREEN}Total: 26 PRs reviewed and merged!${COLOR_RESET}"
echo ""
