#!/bin/sh
# Gera o location /bff-invest/ conforme INVESTBOT_PAUSADO (padrao: true).
#  - true : responde 503 JSON sem conectar (nao ha pod do bff-invest) e o nginx sobe sem o Service.
#  - false: proxy normal; o nome e resolvido na chamada (nao no start), entao um Service ausente
#           nunca impede o nginx de subir. Religar = INVESTBOT_PAUSADO=false no Deployment.
set -e
OUT=/etc/nginx/investbot-location.conf
if [ "${INVESTBOT_PAUSADO:-true}" = "true" ]; then
  cat > "$OUT" <<'CONF'
location /bff-invest/ {
    default_type application/json;
    add_header Cache-Control "no-store" always;
    add_header Retry-After "300" always;
    return 503 '{"error":"investbot_indisponivel","message":"InvestBot indisponivel no momento."}';
}
CONF
else
  DNS=$(awk '/^nameserver/ && $2 !~ /:/ {print $2; exit}' /etc/resolv.conf)
  cat > "$OUT" <<CONF
location /bff-invest/ {
    resolver ${DNS:-127.0.0.11} valid=30s ipv6=off;
    set \$bff_invest bff-invest:8383;
    rewrite ^/bff-invest/(.*)\$ /\$1 break;
    proxy_pass http://\$bff_invest;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$ip_cliente;
    proxy_set_header X-Forwarded-For \$ip_cliente;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header CF-Connecting-IP "";
    proxy_set_header True-Client-IP "";
    proxy_connect_timeout 30s;
    proxy_read_timeout 120s;
}
CONF
fi
