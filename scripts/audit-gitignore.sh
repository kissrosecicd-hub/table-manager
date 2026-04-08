#!/usr/bin/env bash
# audit-gitignore.sh — Проверка .gitignore + поиск опасных файлов
# Запуск: bash scripts/audit-gitignore.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

HAS_GIT=false
[[ -d .git ]] && HAS_GIT=true

echo -e "${CYAN}=== Gitignore Audit ===${NC}"
echo -e "Project: ${PROJECT_ROOT}"
if $HAS_GIT; then
  echo -e "Git repo: ${GREEN}да${NC}"
else
  echo -e "Git repo: ${YELLOW}нет (фоллбэк на pattern matching)${NC}"
fi
echo

# ──────────────────────────────────────────────
# 1. Проверка .gitignore существует
# ──────────────────────────────────────────────
if [[ ! -f .gitignore ]]; then
  echo -e "${RED}✗ .gitignore НЕ НАЙДЕН${NC}"
  exit 1
fi
echo -e "${GREEN}✓ .gitignore найден${NC}"

# ──────────────────────────────────────────────
# Хелпер: проверяет что файл игнорируется
# ──────────────────────────────────────────────
is_ignored() {
  local file="$1"
  if $HAS_GIT; then
    git check-ignore -q "$file" 2>/dev/null
  else
    # Фоллбэк: проверяем что путь матчится паттерном .gitignore
    local basename
    basename=$(basename "$file")
    local dir
    dir=$(dirname "$file" | sed 's|^\./||')

    # Точное совпадение имени
    if grep -qF "$basename" .gitignore 2>/dev/null; then
      return 0
    fi
    # Паттерн директории (dir/)
    if grep -qF "${dir}/" .gitignore 2>/dev/null; then
      return 0
    fi
    # Глоб паттерн (*.ext)
    local ext="${basename##*.}"
    if [[ "$ext" != "$basename" ]] && grep -q "*.${ext}" .gitignore 2>/dev/null; then
      return 0
    fi
    # data/* паттерны
    if [[ "$dir" == data/* ]] && grep -q "data/\*" .gitignore 2>/dev/null; then
      return 0
    fi
    return 1
  fi
}

# ──────────────────────────────────────────────
# 2. Файлы, которые git РЕАЛЬНО игнорирует
# ──────────────────────────────────────────────
echo -e "\n${CYAN}─── Игнорируемые файлы ───${NC}"
IGNORED_COUNT=0
NOT_IGNORED=()

while IFS= read -r -d '' file; do
  if is_ignored "$file"; then
    echo -e "${GREEN}  ✓ ${file}${NC}"
    ((IGNORED_COUNT++)) || true
  else
    echo -e "${RED}  ✗ ${file} (НЕ игнорируется!)${NC}"
    NOT_IGNORED+=("$file")
  fi
done < <(find . -maxdepth 3 \
  \( -path "./node_modules" \
  -o -path "./.next" \
  -o -path "./test-results" \
  -o -path "./playwright-report" \
  -o -path "./.temp" \
  -o -name "*.tsbuildinfo" \
  -o -name ".env" \
  -o -name ".env.local" \
  -o -name "*.db" \
  -o -name "*.sqlite" \
  -o -name "*.db-wal" \
  -o -name "*.db-shm" \
  -o -name "store.json" \
  \) \
  -print0 2>/dev/null)

if [[ $IGNORED_COUNT -eq 0 ]] && [[ ${#NOT_IGNORED[@]} -eq 0 ]]; then
  echo -e "${YELLOW}  Нет файлов требующих игнорирования (чистый проект)${NC}"
else
  echo -e "${GREEN}  Итого: ${IGNORED_COUNT}/${#NOT_IGNORED[@]} игнорируется${NC}"
fi

# ──────────────────────────────────────────────
# 3. ОПАСНО: Файлы которые МОГУТ попасть в коммит
# ──────────────────────────────────────────────
echo -e "\n${CYAN}─── ОПАСНЫЕ ФАЙЛЫ (проверка попадания в коммит) ───${NC}"

DANGER_FILES=()

# Секреты и конфиги
for pattern in ".env" ".env.local" ".env.*.local" "*.pem" "*.key" "*.secret" ".credentials" ".npmrc" ".pypirc"; do
  while IFS= read -r -d '' file; do
    if ! is_ignored "$file"; then
      DANGER_FILES+=("$file")
    fi
  done < <(find . -maxdepth 2 -name "$pattern" -not -path "*/node_modules/*" -not -path "*/.git/*" -print0 2>/dev/null)
done

# Базы данных
for ext in "*.db" "*.sqlite" "*.sqlite3" "*.db-wal" "*.db-shm"; do
  while IFS= read -r -d '' file; do
    if ! is_ignored "$file"; then
      DANGER_FILES+=("$file")
    fi
  done < <(find . -maxdepth 3 -name "$ext" -not -path "*/node_modules/*" -not -path "*/.git/*" -print0 2>/dev/null)
done

# Локальные данные (data/*.json, data/*.csv)
while IFS= read -r -d '' file; do
  if ! is_ignored "$file"; then
    DANGER_FILES+=("$file")
  fi
done < <(find . -maxdepth 3 -path "*/data/*" \( -name "*.json" -o -name "*.csv" \) -not -path "*/node_modules/*" -not -path "*/.git/*" -print0 2>/dev/null)

if [[ ${#DANGER_FILES[@]} -eq 0 ]]; then
  echo -e "${GREEN}  ✓ Все опасные файлы покрыты .gitignore${NC}"
else
  echo -e "${RED}  ✗ Файлы МОГУТ попасть в коммит (нет в .gitignore):${NC}"
  for f in "${DANGER_FILES[@]}"; do
    echo -e "${RED}    ✗ ${f}${NC}"
  done
fi

# ──────────────────────────────────────────────
# 4. Скан на секреты в НЕ-игнорируемых файлах
# ──────────────────────────────────────────────
echo -e "\n${CYAN}─── Скан на секреты ───${NC}"

SECRETS_FOUND=0

SECRET_PATTERNS=(
  "password\s*=\s*['\"][^'\"]+['\"]"
  "api_key\s*=\s*['\"][^'\"]+['\"]"
  "secret\s*=\s*['\"][^'\"]+['\"]"
  "token\s*=\s*['\"][^'\"]+['\"]"
  "PRIVATE KEY"
  "BEGIN RSA"
  "aws_secret_access_key"
  "sk-[a-zA-Z0-9]{20,}"
)

while IFS= read -r -d '' file; do
  [[ "$file" == *node_modules* ]] && continue
  [[ "$file" == *.next* ]] && continue
  [[ "$file" == *.git* ]] && continue
  [[ "$file" == *package-lock.json ]] && continue
  [[ "$file" == *tsconfig.tsbuildinfo ]] && continue
  [[ "$file" == *.env ]] && continue  # .env файлы должны быть в .gitignore

  for pattern in "${SECRET_PATTERNS[@]}"; do
    if grep -Pq "$pattern" "$file" 2>/dev/null; then
      match=$(grep -Pn "$pattern" "$file" 2>/dev/null | head -1)
      echo -e "${RED}  ✗ ${file}:${NC}"
      echo -e "${RED}      ${match}${NC}"
      ((SECRETS_FOUND++)) || true
    fi
  done
done < <(find . -maxdepth 3 -type f \( -name "*.js" -o -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" -o -name "*.json" -o -name "*.yaml" -o -name "*.yml" -o -name "*.md" \) -not -path "*/node_modules/*" -not -path "*/.git/*" -print0 2>/dev/null)

if [[ $SECRETS_FOUND -eq 0 ]]; then
  echo -e "${GREEN}  ✓ Секреты в коде не найдены${NC}"
else
  echo -e "${RED}  Найдено ${SECRETS_FOUND} потенциальных утечек секретов${NC}"
fi

# ──────────────────────────────────────────────
# 5. Рекомендации: что ещё можно добавить
# ──────────────────────────────────────────────
echo -e "\n${CYAN}─── Рекомендации по .gitignore ───${NC}"

GITIGNORE_CONTENT=$(cat .gitignore 2>/dev/null || echo "")

RECOMMENDATIONS=()

if ! echo "$GITIGNORE_CONTENT" | grep -q "node_modules"; then
  RECOMMENDATIONS+=("Добавить node_modules/")
fi
if ! echo "$GITIGNORE_CONTENT" | grep -q "\.next"; then
  RECOMMENDATIONS+=("Добавить .next/")
fi
if ! echo "$GITIGNORE_CONTENT" | grep -q "\.env$"; then
  RECOMMENDATIONS+=("Добавить .env (секреты)")
fi
if ! echo "$GITIGNORE_CONTENT" | grep -q "tsbuildinfo"; then
  RECOMMENDATIONS+=("Добавить *.tsbuildinfo")
fi
if ! echo "$GITIGNORE_CONTENT" | grep -q "test-results"; then
  RECOMMENDATIONS+=("Добавить test-results/")
fi
if ! echo "$GITIGNORE_CONTENT" | grep -q "coverage"; then
  RECOMMENDATIONS+=("Добавить coverage/ (если будет тестирование)")
fi
if ! echo "$GITIGNORE_CONTENT" | grep -q "\.idea"; then
  RECOMMENDATIONS+=("Добавить .idea/ (JetBrains IDE)")
fi

if [[ ${#RECOMMENDATIONS[@]} -eq 0 ]]; then
  echo -e "${GREEN}  ✓ .gitignore покрывает основные паттерны${NC}"
else
  for rec in "${RECOMMENDATIONS[@]}"; do
    echo -e "${YELLOW}  ⚠ ${rec}${NC}"
  done
fi

# ──────────────────────────────────────────────
# Итого
# ──────────────────────────────────────────────
echo -e "\n${CYAN}=== Итого ===${NC}"
echo -e "Игнорируется:  ${GREEN}${IGNORED_COUNT}${NC}"
echo -e "НЕ игнорируется: ${#NOT_IGNORED[@]}"
echo -e "Опасных файлов:  ${#DANGER_FILES[@]}"
echo -e "Утечек секретов: ${SECRETS_FOUND}"
echo -e "Рекомендаций:    ${#RECOMMENDATIONS[@]}"

if [[ ${#DANGER_FILES[@]} -gt 0 ]] || [[ ${#NOT_IGNORED[@]} -gt 0 ]] || [[ $SECRETS_FOUND -gt 0 ]]; then
  echo -e "\n${RED}⚠ ТРЕБУЕТСЯ ДЕЙСТВИЕ: Обновите .gitignore${NC}"
  exit 1
else
  echo -e "\n${GREEN}✓ .gitignore в порядке${NC}"
  exit 0
fi
