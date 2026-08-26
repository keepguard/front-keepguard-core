#!/bin/bash

# =============================================================================
# Script de Deploy Automatizado para Frontend React (front-keepguard-core)
# =============================================================================
# Uso:
#   ./script-deploy-github-front-keepguard-core.sh up       # Incrementa versão + Build + Push + Deploy Docker
#   ./script-deploy-github-front-keepguard-core.sh 1.0.1 up # Versão explícita + Deploy Docker
#   ./script-deploy-github-front-keepguard-core.sh          # Incrementa versão + Build + Push apenas
#   ./script-deploy-github-front-keepguard-core.sh --current up # Mantém versão atual + Deploy Docker
# =============================================================================

set -e

SERVICE_NAME="front-keepguard-core"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PACKAGE_JSON="${SCRIPT_DIR}/package.json"
DOCKER_COMPOSE_FILE="${PROJECT_ROOT}/docker/docker-compose.yml"

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

get_current_version() {
    node -p "require('${PACKAGE_JSON}').version" 2>/dev/null || echo "1.0.0"
}

increment_version() {
    local version=$1
    local major minor patch
    IFS='.' read -r major minor patch <<< "$version"
    patch=$((patch + 1))
    echo "${major}.${minor}.${patch}"
}

update_package_version() {
    local new_version=$1
    log_info "Atualizando package.json para versão: ${new_version}"
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('${PACKAGE_JSON}', 'utf8'));
        pkg.version = '${new_version}';
        fs.writeFileSync('${PACKAGE_JSON}', JSON.stringify(pkg, null, 2) + '\n');
    "
    log_success "package.json atualizado para: ${new_version}"
}

commit_and_push_release() {
    local release_version=$1
    local repo_dir=${2:-"${SCRIPT_DIR}"}

    log_step "Commit e push das alterações (Release ${release_version})..."

    if ! git -C "${repo_dir}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        log_warning "Diretório não é um repositório git: ${repo_dir}. Pulando commit/push."
        return 0
    fi

    pushd "${repo_dir}" > /dev/null

    git add -A
    if git diff --cached --quiet; then
        log_info "Nenhuma alteração pendente para commit."
        popd > /dev/null
        return 0
    fi

    if ! git commit -m "$(cat <<EOF
Release ${release_version}

EOF
)"; then
        log_error "Falha ao criar commit do release ${release_version}"
        popd > /dev/null
        return 1
    fi

    if ! git push; then
        log_error "Falha ao fazer push do release ${release_version}"
        popd > /dev/null
        return 1
    fi

    log_success "Commit e push concluídos (Release ${release_version})"
    popd > /dev/null
    return 0
}

DEPLOY_DOCKER=false
TARGET_VERSION=""
KEEP_CURRENT_VERSION=false

for arg in "$@"; do
    if [ "$arg" = "up" ]; then
        DEPLOY_DOCKER=true
    elif [ "$arg" = "--current" ]; then
        KEEP_CURRENT_VERSION=true
    elif [[ "$arg" =~ ^[0-9]+\.[0-9]+ ]]; then
        TARGET_VERSION="$arg"
    fi
done

CURRENT_VERSION=$(get_current_version)
if [ -n "$TARGET_VERSION" ]; then
    VERSION="$TARGET_VERSION"
    update_package_version "$VERSION"
elif [ "$KEEP_CURRENT_VERSION" = true ]; then
    VERSION="$CURRENT_VERSION"
else
    VERSION=$(increment_version "$CURRENT_VERSION")
    update_package_version "$VERSION"
fi

REGISTRY="ghcr.io/keepguard"
IMAGE_TAG="${REGISTRY}/${SERVICE_NAME}:${VERSION}"
IMAGE_LATEST="${REGISTRY}/${SERVICE_NAME}:latest"

log_info "============================================"
log_info "  Deploy ${SERVICE_NAME}"
log_info "============================================"
log_info "Versão:        ${VERSION}"
log_info "Deploy Docker: ${DEPLOY_DOCKER}"
log_info "Imagem Tag:    ${IMAGE_TAG}"
log_info "============================================"

# 1. Build Docker Image
log_step "1/4 Construindo imagem Docker multi-stage (linux/amd64)..."
cd "${SCRIPT_DIR}"
docker build --platform linux/amd64 -t "${IMAGE_TAG}" -t "${IMAGE_LATEST}" .
log_success "Imagem Docker construída com sucesso: ${IMAGE_TAG}"

# 2. Push para GitHub Container Registry
log_step "2/4 Fazendo push para GitHub Container Registry..."
docker push "${IMAGE_TAG}"
docker push "${IMAGE_LATEST}"
log_success "Push concluído com sucesso"

# 3. Atualização e Deploy Docker Compose Local se 'up' foi passado
if [ -f "$DOCKER_COMPOSE_FILE" ]; then
    log_step "3/4 Atualizando docker-compose.yml..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|image: ${REGISTRY}/${SERVICE_NAME}:.*|image: ${IMAGE_TAG}|g" "${DOCKER_COMPOSE_FILE}"
    else
        sed -i "s|image: ${REGISTRY}/${SERVICE_NAME}:.*|image: ${IMAGE_TAG}|g" "${DOCKER_COMPOSE_FILE}"
    fi
    log_success "docker-compose.yml atualizado para ${IMAGE_TAG}"
fi

if [ "$DEPLOY_DOCKER" = true ]; then
    log_info "Iniciando container no Docker Compose (pull & recreate)..."
    cd "${PROJECT_ROOT}/docker"
    docker compose pull "${SERVICE_NAME}" || true
    docker compose up -d "${SERVICE_NAME}"
    log_success "Container ${SERVICE_NAME} recriado com sucesso no Docker!"
fi

# 4. Commit e push no repositório
commit_and_push_release "${VERSION}" "${SCRIPT_DIR}"

log_success "============================================"
log_success "  Deploy de ${SERVICE_NAME} finalizado com sucesso!"
log_success "  Porta Local: http://localhost:5173"
log_success "============================================"
