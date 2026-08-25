#!/bin/bash

# =============================================================================
# Script de Deploy Automatizado para Frontend React (front-keepguard-core)
# =============================================================================
# Uso:
#   ./script-deploy-github-front-keepguard-core.sh up       # Incrementa versão + Build + Push + Deploy K8s
#   ./script-deploy-github-front-keepguard-core.sh 1.0.0 up # Versão explícita + Deploy K8s
#   ./script-deploy-github-front-keepguard-core.sh          # Incrementa versão + Build + Push apenas
# =============================================================================

set -e

SERVICE_NAME="front-keepguard-core"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_JSON="${SCRIPT_DIR}/package.json"

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

DEPLOY_K8S=false
TARGET_VERSION=""
KEEP_CURRENT_VERSION=false

for arg in "$@"; do
    if [ "$arg" = "up" ]; then
        DEPLOY_K8S=true
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
log_info "Versão:       ${VERSION}"
log_info "Deploy K8s:   ${DEPLOY_K8S}"
log_info "Imagem Tag:   ${IMAGE_TAG}"
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

# 3. Commit e Push no Git
log_step "3/4 Commit e push das alterações no Git..."
git add -A
if ! git diff --cached --quiet; then
    git commit -m "Release ${VERSION}" || true
    git push origin main || true
    log_success "Commit e push concluídos (Release ${VERSION})"
fi

# 4. Deploy no Kubernetes se 'up' foi passado
if [ "$DEPLOY_K8S" = true ]; then
    log_step "4/4 Aplicando manifestos e executando rollout no Kubernetes..."
    # Atualiza a tag no deployment.yaml do Helm
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|image: ghcr.io/keepguard/front-keepguard-core:.*|image: ${IMAGE_TAG}|g" "${SCRIPT_DIR}/helm/templates/deployment.yaml"
    else
        sed -i "s|image: ghcr.io/keepguard/front-keepguard-core:.*|image: ${IMAGE_TAG}|g" "${SCRIPT_DIR}/helm/templates/deployment.yaml"
    fi

    # Aplica os manifestos na VPS remota
    ssh root@31.97.175.92 "kubectl apply -f - << 'EOF'
$(cat "${SCRIPT_DIR}/helm/templates/deployment.yaml")
---
$(cat "${SCRIPT_DIR}/helm/templates/service.yaml")
---
$(cat "${SCRIPT_DIR}/helm/templates/ingress.yaml")
EOF"

    ssh root@31.97.175.92 "kubectl rollout restart deployment/front-keepguard-core -n keepguard"
    log_success "Rollout disparado no Kubernetes!"
fi

log_success "============================================"
log_success "  Deploy de ${SERVICE_NAME} finalizado!"
log_success "  URL: https://app-core.keepguard.com.br"
log_success "============================================"
