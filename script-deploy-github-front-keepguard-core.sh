#!/bin/bash
# =============================================================================
# 🚀 MINI MANUAL DE USO — script-deploy-github-front-keepguard-core.sh
# =============================================================================
#
#   1. Apenas commit e push na branch atual (ex: develop):
#      $ ./script-deploy-github-front-keepguard-core.sh
#
#   2. Commit, push na branch atual + Merge para 'main':
#      $ ./script-deploy-github-front-keepguard-core.sh merge main
#
#   3. PRODUÇÃO (Commit + Push + Merge para 'main' + Deploy K8s via GitHub Actions):
#      $ ./script-deploy-github-front-keepguard-core.sh prod
#
#   4. Opcional: Subir container no Docker Compose local:
#      $ ./script-deploy-github-front-keepguard-core.sh up
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="front-keepguard-core"
DOCKER_COMPOSE_DIR="${SCRIPT_DIR}/../../docker"
DOCKER_COMPOSE_FILE="${DOCKER_COMPOSE_DIR}/docker-compose.yml"
REGISTRY="ghcr.io/keepguard"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

MERGE_TARGET=""
DEPLOY_DOCKER=false
TRIGGER_PROD=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        up)
            DEPLOY_DOCKER=true
            shift
            ;;
        prod)
            MERGE_TARGET="main"
            TRIGGER_PROD=true
            shift
            ;;
        merge)
            MERGE_TARGET="${2:-main}"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

cd "${SCRIPT_DIR}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log_error "Diretório não é um repositório git."
    exit 1
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
log_step "1/3 Verificando repositório Git na branch '${CURRENT_BRANCH}'..."
git add -A
if ! git diff --cached --quiet; then
    log_info "Criando commit com alterações pendentes..."
    git commit -m "feat(${SERVICE_NAME}): update ${SERVICE_NAME} $(date +'%Y-%m-%d %H:%M')"
    log_info "Fazendo push para branch '${CURRENT_BRANCH}'..."
    git push origin "${CURRENT_BRANCH}"
else
    log_info "Nenhuma alteração pendente na branch '${CURRENT_BRANCH}'."
    git push origin "${CURRENT_BRANCH}" || true
fi

LOCAL_SHA=$(git rev-parse --short HEAD)

if [ -n "$MERGE_TARGET" ] && [ "$MERGE_TARGET" != "$CURRENT_BRANCH" ]; then
    log_step "2/3 Promovendo branch '${CURRENT_BRANCH}' para '${MERGE_TARGET}'..."
    git checkout "${MERGE_TARGET}"
    git pull origin "${MERGE_TARGET}" --rebase || true
    git merge "${CURRENT_BRANCH}" -m "chore(merge): merge branch '${CURRENT_BRANCH}' into ${MERGE_TARGET}"
    git push origin "${MERGE_TARGET}"
    BUILD_SHA=$(git rev-parse --short HEAD)
    log_info "Retornando checkout com segurança para '${CURRENT_BRANCH}'..."
    git checkout "${CURRENT_BRANCH}"
else
    BUILD_SHA="${LOCAL_SHA}"
fi

echo
log_info "============================================"
log_info "  Status ${SERVICE_NAME}"
log_info "============================================"
log_info "Branch de Trabalho : ${CURRENT_BRANCH}"
log_info "Commit SHA         : ${BUILD_SHA}"
log_info "Deploy Produção    : ${TRIGGER_PROD}"
log_info "Deploy Local (up)  : ${DEPLOY_DOCKER}"
log_info "============================================"
echo

if [ "$DEPLOY_DOCKER" = true ]; then
    log_step "Construindo imagem localmente para o Docker Compose..."
    if command -v docker >/dev/null 2>&1; then
        DOCKER_BUILDKIT=1 docker build --build-arg BUILD_MODE=docker -f Dockerfile -t "${REGISTRY}/${SERVICE_NAME}:local" .
        if [ -d "${DOCKER_COMPOSE_DIR}" ] && [ -f "${DOCKER_COMPOSE_FILE}" ]; then
            cd "${DOCKER_COMPOSE_DIR}"
            docker compose up -d --force-recreate "${SERVICE_NAME}" || true
            log_success "Container ${SERVICE_NAME} recriado localmente!"
        fi
    else
        log_warn "Docker não encontrado/ativo para subir localmente."
    fi
fi

if [ "$TRIGGER_PROD" = true ]; then
    # O push na main dispara o build no GitHub (só imagem). Aqui: espera o build do commit, aplica a imagem no cluster
    # por ssh e grava a tag no helm/values.yaml. Build falhou ou não apareceu = para com erro, nada vai para produção.
    command -v gh >/dev/null 2>&1 || { log_error "gh (GitHub CLI) é necessário para acompanhar o build."; exit 1; }
    GITHUB_REPO="keepguard/${SERVICE_NAME}"
    FULL_SHA=$(git rev-parse "${MERGE_TARGET:-main}")
    SHORT_SHA="${FULL_SHA:0:7}"
    log_step "3/3 Aguardando o build da imagem ${SHORT_SHA} no GitHub Actions..."
    RUN_ID=""
    for _ in $(seq 1 45); do
        RUN_ID=$(gh run list -R "${GITHUB_REPO}" --branch main --limit 5 --json databaseId,headSha \
            --jq ".[] | select(.headSha == \"${FULL_SHA}\") | .databaseId" | head -1)
        [ -n "${RUN_ID}" ] && break
        sleep 2
    done
    [ -n "${RUN_ID}" ] || { log_error "Não achei o build de ${SHORT_SHA}: https://github.com/${GITHUB_REPO}/actions"; exit 1; }
    if ! gh run watch "${RUN_ID}" -R "${GITHUB_REPO}" --exit-status --interval 15; then
        log_error "O build FALHOU. Nada foi para produção."
        gh run view "${RUN_ID}" -R "${GITHUB_REPO}" --log-failed | tail -30 || true
        exit 1
    fi
    IMAGEM="${REGISTRY}/${SERVICE_NAME}:${SHORT_SHA}"
    log_info "Aplicando ${IMAGEM} no cluster..."
    ssh -o BatchMode=yes root@31.97.175.92 "kubectl -n keepguard set image deployment/${SERVICE_NAME} ${SERVICE_NAME}=${IMAGEM} && kubectl -n keepguard rollout status deployment/${SERVICE_NAME} --timeout=300s" || {
        log_error "Rollout falhou. Desfazendo..."
        ssh -o BatchMode=yes root@31.97.175.92 "kubectl -n keepguard rollout undo deployment/${SERVICE_NAME} && kubectl -n keepguard rollout status deployment/${SERVICE_NAME} --timeout=300s" || true
        exit 1
    }
    git checkout -q "${CURRENT_BRANCH}"
    sed -i '' -E "s|^([[:space:]]*tag:).*|\1 \"${SHORT_SHA}\"|" helm/values.yaml
    if ! git diff --quiet -- helm/values.yaml; then
        git commit -q -m "chore(helm): ${SERVICE_NAME} ${SHORT_SHA}" -- helm/values.yaml
        git push -q origin "${CURRENT_BRANCH}"
    fi
    log_success "Produção rodando ${IMAGEM}."
fi

log_success "============================================"
log_success "  Operação concluída com sucesso!"
log_success "============================================"
