# KeepGuard - Frontend Web Application

Aplicação frontend SPA construída com **React 19**, **TypeScript** e **Vite**, integrada com o ecossistema de microsserviços e BFFs do KeepGuard.

---

## 📋 Pré-requisitos

- **Node.js**: `v20+` ou superior
- **NPM**: `v10+` ou superior

Para instalar as dependências do projeto:
```bash
cd frontend/backoffice
npm install
```

---

## 🚀 Ambientes e Comandos de Execução

Você pode executar o frontend apontando tanto para os serviços locais (Docker / Localhost) quanto para o cluster em nuvem (Produção / Kubernetes).

### 1. 🏠 Execução Local (Docker Compose Localhost)
Utiliza os BFFs rodando localmente nas portas `8381` (BFF-Auth) e `8382` (BFF-Core):

```bash
npm run dev
```
> **Endpoints utilizados:**
> - `BFF Auth`: `http://localhost:8381`
> - `BFF Core`: `http://localhost:8382`
> - `Tenant Padrão`: `f7fc7350-b9fc-4e54-9c58-ac9385b23ae3`

---

### 2. 🛠️ Execução de Desenvolvimento / Staging (Dev)
Caso você tenha um arquivo `.env.development` com parâmetros específicos de desenvolvimento:

```bash
npm run dev -- --mode development
```

---

### 3. ☁️ Execução Local apontando para Produção (Hostinger K8s)
Roda a aplicação local com **Hot-Reloading**, mas consumindo diretamente as APIs reais que estão rodando no Kubernetes da Hostinger sob HTTPS:

```bash
npm run dev:prod
```
> **Endpoints utilizados:**
> - `BFF Auth & Core`: `https://api.keepguard.com.br`
> - `Tenant Padrão`: `f7fc7350-b9fc-4e54-9c58-ac9385b23ae3`

---

## 📦 Build e Produção

### Gerar os arquivos estáticos compilados (Build)
Para compilar a aplicação com verificação de tipagem TypeScript e minificação do Vite:

```bash
npm run build
```
Os arquivos otimizados serão gerados na pasta `dist/`.

### Pré-visualizar o Build de Produção
Para testar localmente os arquivos gerados em `dist/` usando o servidor embutido do Vite:

```bash
npm run preview
```

---

## 🧪 Qualidade e Linter

Para rodar o linter ultrarrápido (**Oxlint**):
```bash
npm run lint
```

---

## 🔧 Variáveis de Ambiente

As configurações de ambiente são controladas pelos arquivos `.env`:

| Variável | Descrição | Exemplo Local | Exemplo Produção |
| :--- | :--- | :--- | :--- |
| `VITE_BFF_AUTH_URL` | URL base do BFF de Autenticação | `http://localhost:8381` | `https://api.keepguard.com.br` |
| `VITE_BFF_CORE_URL` | URL base do BFF Core (Cadastros/LGPD) | `http://localhost:8382` | `https://api.keepguard.com.br` |
| `VITE_DEFAULT_TENANT_ID` | UUID do Tenant padrão | `f7fc7350-b9fc-4e54-9c58-ac9385b23ae3` | `f7fc7350-b9fc-4e54-9c58-ac9385b23ae3` |
