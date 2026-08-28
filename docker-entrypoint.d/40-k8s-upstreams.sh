#!/bin/sh
# No Docker Compose os hostnames curtos resolvem (127.0.0.11 + search).
# No k8s o resolver do nginx NÃO usa search de /etc/resolv.conf — precisa FQDN
# e, nos BFFs, o Service real é *-service.
set -e

CONF="/etc/nginx/conf.d/default.conf"

if [ -z "${KUBERNETES_SERVICE_HOST:-}" ]; then
  exit 0
fi

NS="${KEEPGUARD_NAMESPACE:-keepguard}"
SUFFIX="${NS}.svc.cluster.local"

sed -i \
  -e "s|bff-auth:8381|bff-auth-service.${SUFFIX}:8381|g" \
  -e "s|bff-core:8382|bff-core-service.${SUFFIX}:8382|g" \
  -e "s|ms-auth:8081|ms-auth.${SUFFIX}:8081|g" \
  -e "s|ms-communication:8082|ms-communication.${SUFFIX}:8082|g" \
  -e "s|ms-company:8083|ms-company.${SUFFIX}:8083|g" \
  -e "s|ms-user:8085|ms-user.${SUFFIX}:8085|g" \
  -e "s|ms-user-consents:8086|ms-user-consents.${SUFFIX}:8086|g" \
  -e "s|srv-email-sender:8601|srv-email-sender.${SUFFIX}:8601|g" \
  -e "s|srv-token-manager:8700|srv-token-manager.${SUFFIX}:8700|g" \
  -e "s|srv-sms-sender:8610|srv-sms-sender.${SUFFIX}:8610|g" \
  -e "s|mock-sms-gateway:8089|mock-sms-gateway.${SUFFIX}:8089|g" \
  -e "s|minio:9000|minio.${SUFFIX}:9000|g" \
  -e "s|rabbitmq:15672|rabbitmq-service.${SUFFIX}:15672|g" \
  -e "s|prometheus:9090|prometheus.${SUFFIX}:9090|g" \
  -e "s|grafana:3000|grafana.${SUFFIX}:3000|g" \
  "$CONF"
