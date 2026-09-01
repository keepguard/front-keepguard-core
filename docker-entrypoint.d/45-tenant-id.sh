#!/bin/sh
# Substitui o tenant UUID compilado no bundle Vite pelo DEFAULT_TENANT_ID do pod.
set -e
OLD="${FRONT_TENANT_ID_IN_BUNDLE:-f7fc7350-b9fc-4e54-9c58-ac9385b23ae3}"
NEW="${DEFAULT_TENANT_ID:-$OLD}"
if [ "$NEW" = "$OLD" ]; then
  exit 0
fi
echo "front: reescrevendo tenant ${OLD} -> ${NEW}"
find /usr/share/nginx/html -type f \( -name '*.js' -o -name '*.html' \) \
  -exec sed -i "s/${OLD}/${NEW}/g" {} +
