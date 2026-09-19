# KeepGuard Backoffice (front-keepguard-core) - System Design

## 1. Propósito e Domínio
- **Responsabilidade Principal:** SPA administrativa do KeepGuard Core para gestão de identidade, sessões/dispositivos, consentimentos LGPD, billing, agentes de coleta, conhecimento, gateway LLM e desk de mercado/investimentos — tudo consumindo BFFs (`bff-auth`, `bff-core`, `bff-invest`).
- **Público/Uso:** Painel administrativo / console operacional multi-tenant (usuários USER, MANAGER, ADMIN e SYSTEM), com rotas protegidas por papéis JWT e authorities granulares (`session:read`, `collector:read`, `billing:read`, etc.).

## 2. Tech Stack Local
- **Core:** React 19.2, Vite 8.2, TypeScript ~6.0 (`type: module`), Node 22 no build Docker; lint com Oxlint.
- **UI & Estilização:** CSS customizado via variáveis em `src/index.css` (design system inspirado em hPanel / Hostinger), temas light/dark via `data-theme`; ícones **Lucide React**; fontes DM Sans / Inter / JetBrains Mono (Google Fonts). **Não** usa Tailwind, Framer Motion, Emotion nem styled-components.
- **Roteamento:** React Router DOM 7 (`BrowserRouter` em `main.tsx`; mapa canônico em `src/navigation/routes.ts` + `AppRoutes.tsx`).
- **Integrações/Libs principais:** `fetch` nativo encapsulado em `customFetch` (`src/services/api.ts`); `qrcode` (PIX/QR); store de tokens fora do React (`tokenStore.ts`); Context API (`Auth`, `Theme`, `Toast`). Sem Zustand, Axios ou Supabase JS.

## 3. Topologia e Componentização
- **Padrão de Pastas:**
  - `src/pages/` — páginas finas (`AuthPage`, `DashboardPage` exportando páginas por domínio).
  - `src/navigation/` — layout autenticado (`AppLayout`), rotas (`AppRoutes`), guardas (`RequireAccess`), constantes `PATHS`/`ROUTES`.
  - `src/components/` — UI por domínio: `auth/`, `register/`, `layout/` (Header/Sidebar), `dashboard/` (maior superfície), `common/`, `templates/`.
  - `src/services/` — fachadas HTTP por domínio (`authService`, `billingService`, `analystService`, `agentService`, `guardianService`, `knowledgeService`, `llmGatewayService`, `oauthClientService`, `consentService`, `termsSyncService`, `auditService`, etc.) + `api.ts` / `tokenStore.ts`.
  - `src/context/` — estado global de sessão, tema e toasts.
  - `src/types/`, `src/utils/` (roles/RBAC, device, list query), `src/hooks/`, `src/data/` (catálogos estáticos).
- **Gerenciamento de Estado:**
  - **Sessão:** `AuthContext` + `tokenStore` (módulo singleton: access/refresh in-memory; hidratação via `sessionStorage`; perfil em `localStorage` sob `keepguard_user`).
  - **UI:** `ThemeContext` (`keepguard-theme`), `ToastContext`, estado local de views/modais.
  - Refresh JWT proativo (skew 60s), single-flight em 401, idle threshold 5 min; `accessToken` no Context só muda em login/logout (evita re-render em cada refresh).

## 4. Integrações de API e I/O
- **Comunicação com Backend:**
  - Três bases: `VITE_BFF_AUTH_URL` (default local `:8381`), `VITE_BFF_CORE_URL` (`:8382`), `VITE_BFF_INVEST_URL` (`:8383`); em produção/`keepguard.com.br` → `https://api.keepguard.com.br`.
  - Modo Docker: URLs relativas `/bff-auth`, `/bff-core`, `/bff-invest` (nginx faz proxy same-origin).
  - Dev Vite: proxies `/bff-*-proxy` → localhost 8381–8383.
  - `customFetch` injeta headers: `Authorization: Bearer`, `X-Tenant-Id`, `X-Client-Id` (`keepguard-web`), `X-Correlation-ID`, device/session (`X-Device-*`, `X-Session-Id`), IP público; `credentials: 'include'`; em invest também `X-Company-Id`.
- **Autenticação:**
  - Login/refresh/logout/validate e device challenge via BFF Auth (`/api/v1/auth/*`).
  - Tokens: **RN-FE-01** — nunca persistir JWT em `localStorage`; memória + `sessionStorage` (sobrevive F5 na aba); bootstrap silencioso pode usar cookie HttpOnly via refresh.
  - Evento `keepguard_auth_unauthorized` encerra sessão na UI; consentimentos de termos checados no open da app (`termsSyncService`).

## 5. Infraestrutura e Deploy
- **Build/Bundler:** `tsc -b && vite build` (Rollup via Vite); modos `.env` / `.env.development` / `.env.production` / `.env.docker`; health local `/healthz` no plugin Vite.
- **Containerização:** Dockerfile multi-stage (`node:22-alpine` → `nginx:1.27-alpine`); `nginx.conf` com SPA `try_files`, gzip, headers de segurança, proxy `/bff-auth|core|invest`, `/healthz`; entrypoints `40-k8s-upstreams.sh` e `45-tenant-id.sh` (rewrite do tenant UUID no bundle). Helm chart `front-keepguard-core` (ingress `app-core.keepguard.com.br`, 2 replicas). Scripts: `script-deploy-github-front-keepguard-core.sh` (GHCR) e `script-deploy-k8s-prod.sh` (rollout no namespace `keepguard`).
- **Invariantes Locais:**
  - Escopo exclusivo deste front: não acoplar a outros SPAs do monorepo.
  - RBAC na rota via `RequireAccess` + helpers em `utils/roles.ts` (roles + authorities do JWT).
  - Client id fixo `keepguard-web`; tenant default configurável (`VITE_DEFAULT_TENANT_ID` / env do pod).
  - Tokens JWT fora do `localStorage`; preferir `getAccessToken()` na hora da chamada HTTP.
  - Lint: Oxlint (não ESLint); tipagem estrita no `tsconfig.app.json` (ES2023, `jsx: react-jsx`).
  - Home canônica pós-login: `/mercado` (redirect de `/`); rotas legadas (`?tab=`, `/assinatura`) redirecionam para paths canônicos.
