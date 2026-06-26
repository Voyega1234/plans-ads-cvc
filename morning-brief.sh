#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────
# GG Automation — Morning Brief
# รัน: bash morning-brief.sh
# ตั้ง cron ให้รันทุกวัน 9:00 AM:  0 9 * * * /path/to/morning-brief.sh
# ────────────────────────────────────────────────────────────────────────────

set -euo pipefail

API_URL="${GG_API_URL:-http://localhost:3010}"
APPROVE_URL="${API_URL}/morning-brief"
DATE=$(date '+%Y-%m-%d %H:%M')

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  ⚡ GG Automation — Morning Brief${RESET}"
echo -e "${DIM}  ${DATE}${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ── Fetch brief from API ─────────────────────────────────────────────────────
echo -e "${DIM}  กำลังโหลด Morning Brief...${RESET}"

RESPONSE=$(curl -sf "${API_URL}/api/morning-brief" 2>/dev/null || echo "ERROR")

if [ "$RESPONSE" = "ERROR" ] || [ -z "$RESPONSE" ]; then
  echo -e "${RED}  ❌ ไม่สามารถเชื่อมต่อ ${API_URL} ได้${RESET}"
  echo -e "${DIM}  ตรวจสอบว่า GG Automation รันอยู่: npm run dev --prefix /path/to/plans-ads${RESET}"
  exit 1
fi

# ── Parse JSON (requires jq) ─────────────────────────────────────────────────
if ! command -v jq &>/dev/null; then
  echo -e "${YELLOW}  ⚠️  ไม่พบ jq — แสดง raw JSON:${RESET}"
  echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
  exit 0
fi

CRITICAL=$(echo "$RESPONSE" | jq -r '.criticalCount')
WARNING=$(echo "$RESPONSE"  | jq -r '.warningCount')
OK=$(echo "$RESPONSE"       | jq -r '.okCount')
SUMMARY=$(echo "$RESPONSE"  | jq -r '.aiSummary')
SOURCE=$(echo "$RESPONSE"   | jq -r '.source')

# ── Summary banner ───────────────────────────────────────────────────────────
echo -e "  ${RED}${BOLD}Critical: ${CRITICAL}${RESET}   ${YELLOW}${BOLD}Warning: ${WARNING}${RESET}   ${GREEN}${BOLD}OK: ${OK}${RESET}"
echo ""
echo -e "  ${BOLD}AI Summary:${RESET}"
echo -e "  ${SUMMARY}"
echo ""

# ── Recommendations ──────────────────────────────────────────────────────────
RECS=$(echo "$RESPONSE" | jq -r '.recommendations[]' 2>/dev/null)
if [ -n "$RECS" ]; then
  echo -e "  ${BOLD}แนะนำวันนี้:${RESET}"
  while IFS= read -r rec; do
    echo -e "  ${BLUE}›${RESET} ${rec}"
  done <<< "$RECS"
  echo ""
fi

# ── Alerts ──────────────────────────────────────────────────────────────────
ALERTS=$(echo "$RESPONSE" | jq -c '.alerts[]' 2>/dev/null)

if [ -z "$ALERTS" ]; then
  echo -e "${GREEN}  ✓ ไม่มี alerts วันนี้ — ทุก campaigns ปกติดี${RESET}"
  echo ""
else
  echo -e "  ${BOLD}━━━ Alerts ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""

  while IFS= read -r alert; do
    LEVEL=$(echo "$alert"    | jq -r '.level')
    CAMPAIGN=$(echo "$alert" | jq -r '.campaignName')
    TITLE=$(echo "$alert"    | jq -r '.title')
    DETAIL=$(echo "$alert"   | jq -r '.detail')
    ACTION=$(echo "$alert"   | jq -r '.action')
    METRIC=$(echo "$alert"   | jq -r '.metric // ""')
    PLAN_ID=$(echo "$alert"  | jq -r '.mediaPlanId // ""')

    if [ "$LEVEL" = "critical" ]; then
      ICON="${RED}●${RESET}"
      COLOR="${RED}"
    elif [ "$LEVEL" = "warning" ]; then
      ICON="${YELLOW}●${RESET}"
      COLOR="${YELLOW}"
    else
      ICON="${GREEN}●${RESET}"
      COLOR="${GREEN}"
    fi

    LEVEL_UPPER=$(echo "$LEVEL" | tr '[:lower:]' '[:upper:]')
    echo -e "  ${ICON} ${COLOR}${BOLD}[${LEVEL_UPPER}]${RESET} ${BOLD}${CAMPAIGN}${RESET}"
    echo -e "      ${TITLE}"
    echo -e "      ${DIM}${DETAIL}${RESET}"
    [ -n "$METRIC" ] && echo -e "      Metric: ${METRIC}"
    echo -e "      ${BLUE}→ ${ACTION}${RESET}"
    [ -n "$PLAN_ID" ] && echo -e "      ${DIM}Review: ${API_URL}/review/${PLAN_ID}${RESET}"
    echo ""
  done <<< "$ALERTS"
fi

# ── Footer ───────────────────────────────────────────────────────────────────
echo -e "  ${DIM}${SOURCE}${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ── Approve prompt ───────────────────────────────────────────────────────────
if [ "$CRITICAL" -gt 0 ]; then
  echo -e "${RED}  ⚠️  มี ${CRITICAL} critical issues — กรุณาแก้ไขก่อน approve${RESET}"
  echo ""
fi

if [ "${1:-}" != "--no-prompt" ]; then
  echo -e "  เปิด Morning Brief ใน browser? (y/n)"
  read -r OPEN_BROWSER
  if [ "$OPEN_BROWSER" = "y" ] || [ "$OPEN_BROWSER" = "Y" ]; then
    if command -v open &>/dev/null; then
      open "${APPROVE_URL}"
    elif command -v xdg-open &>/dev/null; then
      xdg-open "${APPROVE_URL}"
    fi
    echo -e "${GREEN}  ✓ เปิดแล้ว${RESET}"
  fi
fi

echo ""
echo -e "${DIM}  รัน: bash morning-brief.sh --no-prompt  เพื่อข้ามขั้นตอน approve${RESET}"
echo ""
