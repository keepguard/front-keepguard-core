# Stage 1: Build da aplicação React/Vite
FROM node:22-alpine AS builder

WORKDIR /app

# Copia arquivos de dependência
COPY package.json package-lock.json ./
RUN npm ci

# Copia código-fonte e arquivos de configuração
COPY . .

# Build com variáveis de produção embutidas
RUN npm run build

# Stage 2: Servidor Web Nginx Alpine de alta performance
FROM nginx:1.27-alpine

# Remove configuração padrão do Nginx
RUN rm -rf /etc/nginx/conf.d/default.conf

# Copia configuração customizada do Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os arquivos estáticos gerados no build
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
