#!/bin/bash

# AutoDev - Run All Tests
# This script runs all test suites and displays results

set -e

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                     AUTODEV - RUNNING ALL TESTS                          ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
PASSED=0
FAILED=0

# Test 1: Setup Verification
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 1: Setup Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if bun run scripts/test/test-setup.ts; then
    echo -e "${GREEN}✅ Setup Verification PASSED${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ Setup Verification FAILED${NC}"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 2: End-to-End Test
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 2: End-to-End Workflow"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if bun run scripts/test/test-e2e.ts; then
    echo -e "${GREEN}✅ End-to-End Test PASSED${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ End-to-End Test FAILED${NC}"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 3: Type Checking
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 3: TypeScript Type Checking"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if bun run typecheck; then
    echo -e "${GREEN}✅ Type Checking PASSED${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ Type Checking FAILED${NC}"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 4: Database Connection
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 4: Database Connection"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM tasks;" > /dev/null 2>&1; then
    TASK_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM tasks;" | xargs)
    echo -e "${GREEN}✅ Database Connection PASSED${NC} (${TASK_COUNT} tasks in database)"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ Database Connection FAILED${NC}"
    FAILED=$((FAILED + 1))
fi
echo ""

# Summary
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                          TEST SUMMARY                                    ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "Tests Passed: ${GREEN}${PASSED}${NC}"
echo -e "Tests Failed: ${RED}${FAILED}${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║            ✅ ALL TESTS PASSED - SYSTEM READY                     ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "🚀 Next Steps:"
    echo "  1. Start server: bun run dev"
    echo "  2. Test webhook: bun run scripts/test/test-webhook.ts"
    echo "  3. Deploy to Fly.io: fly deploy"
    echo ""
    exit 0
else
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║            ❌ SOME TESTS FAILED - CHECK LOGS ABOVE                ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    exit 1
fi
