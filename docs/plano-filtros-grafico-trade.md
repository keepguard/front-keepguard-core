# Plano — Filtros do gráfico Trade (timeframe, período, intervalo personalizado)

_Rascunho de plano, não implementado. Alinhado em 2026-09-28 entre arquitetura, UX, custo e engenharia._

## 0. Estado real levantado antes deste plano

- Git limpo e sincronizado com `origin/develop` nos 4 repositórios que este plano toca:
  `keepguard-core/frontend/backoffice`, `investbot/backend/bff/bff-invest`,
  `investbot/backend/srv/srv-mt5-market-data`, `investbot/backend/srv/srv-mt5-collector`.
  Nada de outra sessão entraria num deploy hoje.
- Componente único, sem separação por controle: os 3 filtros vivem dentro de
  `TradeCandleChart.tsx` (`<section className="tchart-toolbar">`, linhas 279-315).
- **Causa técnica confirmada do bug do "Aplicar"** (item 3 do pedido): o efeito que busca
  candles depende de `customFrom`/`customTo` mesmo quando o período ativo não é `CUSTOM`.
  Editar a data dispara um fetch usando o range fixo antigo (ignorando o que foi digitado);
  quando esse fetch responde, um segundo efeito (linhas 215-222) reescreve os campos de volta
  com a janela do range fixo — por isso a data digitada "volta sozinha". Não é limitação de
  `min`/`max` do input (não existe nenhum hoje).
- `srv-mt5-market-data` já aceita `timeframe` livre em `GET /ativos/:ativo/candles` (default
  `M10`), mas só `M1` e `M10` existem como linha bruta na tabela `candle`.
- `bff-invest` **não expõe** `timeframe` como query param: `GetTradeAssetCandles` chama
  `CandleHistory(..., "", ...)` com timeframe hardcoded vazio — o client de saída já sabe
  repassar (`mt5/trade.go`), só falta o handler ler o query param.
- M1 só está confirmado coletando em produção desde 2026-09-28, só no `mt5-real` (ver
  `investbot/PROGRESS.md`). Não verificado se `mt5-sim` também coleta M1.

## 1. Arquitetura — onde agregar M5/M30/H1

**Decisão: agregação on-the-fly via SQL no `srv-mt5-market-data`, a partir das linhas `M1` brutas.** Sem serviço novo, sem escrita nova, sem migração.

| Opção | Quando serviria | Custo/risco |
|---|---|---|
| **A — Agregação on-the-fly no srv-mt5-market-data (recomendada)** | Sempre que o timeframe pedido não for `M1`/`M10` | Query um pouco mais complexa; sem novo writer, sem novo storage |
| B — Pré-agregar e gravar M5/M30/H1 como linhas novas | Se o volume de leitura agregada ficasse alto o suficiente pra doer | Quebra a invariante "fronteira de escrita rígida" (só o coletor Python grava `candle` hoje); precisa de job novo, dono novo, staleness a gerenciar |
| C — Agregar no bff-invest ou no frontend | Nunca, para este caso | bff-invest não tem regra de domínio hoje (só proxy/entitlement) — vazaria domínio pro edge; frontend agregando significaria mandar M1 bruto pra períodos longos (1A de M1 ≈ 175 mil linhas por ativo) |

Fluxo: Frontend → `bff-invest GET /trade/assets/{ticker}/candles?timeframe=M30&from=&to=` (novo query param, contrato novo) → `srv-mt5-market-data GET /ativos/:ativo/candles?timeframe=M30&desde=&ate=` (contrato já existe) → repositório: `M1`/`M10` = SELECT direto; qualquer outro timeframe = agregação SQL a partir de `M1` (bucket por `date_bin`, OHLC + soma de volume).

**Invariantes que não podem quebrar:** só o `srv-mt5-collector` grava `candle`/`cotacao` (a agregação é leitura pura); `srv-mt5-market-data` continua sem chamar outro serviço HTTP.

**Risco a vigiar:** timeframe agregado (M5, M30, H1, custom) não tem histórico antes de 2026-09-28 — período longo (1A, 6M) com timeframe fino vai voltar vazio pra trás dessa data, e isso é esperado, não é bug.

## 2. Custo — vale agregar sem cache?

**Recomendação: construir a agregação on-the-fly agora, sem cache nem materialização.** Nesse volume (produto B2B interno, dezenas de usuários, não milhares) o ganho de engenharia de um cache não se paga ainda.

| Premissa | Valor |
|---|---|
| Linhas M1 por ativo/ano (só pregão, 8h/dia) | ~175 mil |
| Linhas M1 lidas numa agregação H1 de 1 mês (1 ativo) | ~176 (índice por `ativo+timeframe+ts` já limita a leitura à janela pedida) |
| Concorrência do Postgres | Pool compartilhado com o resto do domínio investbot, `max_conns: 5` |
| Unidade de custo | Por requisição de gráfico, não por tenant — não é superfície cobrada/medida hoje |

**O que quebraria essa recomendação:** uso saltar de dezenas para milhares de usuários simultâneos (não é o caso); ou M1 acumular anos de histórico e uma agregação de "1A" passar a escanear milhões de linhas. **Medir depois:** tempo de resposta do endpoint de candles quando M1 tiver 6+ meses acumulados — se passar de ~200-300ms, aí sim vale reconsiderar view materializada.

## 3. UX — os 3 controles

- **Tempo gráfico** vira `<select>` (reaproveita a classe `.tchart-select` já usada no seletor de ativo): `M1, M5, M10, M30, H1, Personalizado`. "Personalizado" revela um campo de texto ao lado, validado contra `M1-M59` / `H1-H24`, com erro inline se inválido.
- **Período**: pills `1D, 5D, 1M, 3M, 6M, 1A, Personalizado` (troca "Tudo" por "Personalizado" — item 5).
- **Intervalo personalizado**: os 2 inputs de data e o próprio funcionamento do filtro:
  - Desabilitados (visual + atributo `disabled`) sempre que o período ativo **não** é "Personalizado" — sem apagar o que está digitado (item 5).
  - Clicar em "Personalizado" habilita os inputs e filtra imediatamente pelas datas que já estiverem lá.
  - `max` = agora, nos dois inputs (não existe hoje) — evita escolher data futura, que nunca vai ter dado.
  - "Aplicar" só fica ativo/tem efeito quando o período é "Personalizado"; valida `de <= até` antes de disparar o fetch, com erro inline em vez de falhar silenciosamente.
- **Botão "Limpar"** (novo, item 6): volta Tempo gráfico, Período e Intervalo personalizado ao padrão (ver seção 4). Não mexe em ativo selecionado nem em Indicadores (são filtros à parte).
- Acessibilidade: mantém o padrão já usado (`aria-pressed`, `aria-label`); adiciona `aria-disabled` espelhando o `disabled` real nos inputs/Aplicar, e `aria-describedby`/`role="alert"` ligando a mensagem de erro ao campo problemático.
- Estrutura: mantém tudo em `TradeCandleChart.tsx` (não justifica extrair arquivo novo por enquanto), só separando os 3 grupos em funções internas pra ficar legível.

## 4. Default para "usuário trade" (item 4)

**Proposto: Tempo gráfico `M10` + Período `1D`.**
- `M10` é o timeframe que já é default no resto do sistema (`srv-mt5-market-data`, snapshot do Trade) e é a consulta mais barata (linha bruta, sem agregação) — bom default operacional.
- `1D` dá a um trade ativo a visão da sessão do dia ao abrir a tela, em vez do `5D` atual (que hoje é o default sem motivo de negócio documentado).
- Este é o valor que o botão "Limpar" restaura.

**Este ponto é uma proposta, não uma decisão fechada — confirmar antes de implementar.**

## 5. Plano de execução por arquivo

### Fase 1 — Backend (`investbot`)

**`srv-mt5-market-data`:**
- `internal/domain/marketdata/timeframe.go` (novo): `ParseTimeframe(raw string) (minutes int, normalized string, err error)` — aceita `M1`-`M59`, `H1`-`H24`, default `M10` se vazio; rejeita o resto.
- `internal/application/marketdata/list_candles_usecase.go`: decide raw (`M1`/`M10`) vs. agregado.
- `internal/application/port/out/marketdata_repository.go`: novo método `ListCandlesAggregated(ctx, ativo string, bucketMinutes int, desde, ate *time.Time, limit int)` — só leitura, mesma fronteira de hoje.
- `internal/adapters/out/postgres/marketdata/repository/marketdata_repository.go`: query agregando `timeframe='M1'` por bucket (`date_bin`), OHLC via `first_value`/`last_value` + `MIN`/`MAX`/`SUM`.
- Testes: tabela pra `ParseTimeframe` (`M1`, `M10`, `M5`, `M0`, `M60`, `H25`, `""`, minúsculo); teste de agregação com M1 semeado cobrindo borda de bucket; regressão confirmando que `M10` continua indo pelo caminho raw sem mudança de resultado.
- `docs/architecture/system-design.md`: nota em "Arquitetura Interna"/"Invariantes" — timeframes não-brutos são computados por agregação de leitura a partir de `M1`, sem novo writer.

**`bff-invest`:**
- `internal/adapters/in/http/handlers/trade_handlers.go`, `GetTradeAssetCandles`: ler `timeframe` do query param, validar no próprio edge (mesmo padrão já usado pra `ticker` com `tickerRE`), `400 INVALID_TIMEFRAME` se inválido, repassar pro `CandleHistory` (já aceita o parâmetro, só estava recebendo `""`).
- Sem mudança em `port/out/trade.go` nem em `adapters/out/http/mt5/trade.go` (já prontos).
- Testes: `trade_integration_test.go` — `?timeframe=M30` ecoa na resposta; `?timeframe=X9` → 400; sem o param → default inalterado (regressão).
- `docs/architecture/system-design.md`: documentar o novo query param `timeframe` em `GET /trade/assets/{ticker}/candles`.

### Fase 2 — Frontend (`keepguard-core`)

**`tradeService.ts`:** `getTradeCandleHistory` ganha `opts.timeframe?: string`, incluído no `URLSearchParams` quando presente.

**`TradeCandleChart.tsx`:**
- Troca a constante `TIMEFRAME='M10'` por estado (`timeframe`, default `M10`) + lista de opções + estado do campo customizado.
- `RANGES`: remove `ALL` ("Tudo"), adiciona `6M` e `CUSTOM` ("Personalizado") como pill de verdade.
- Separa **rascunho** (`customDraft: {from, to}`) do **aplicado** (`customApplied: {from, to}`) — corrige o bug de raiz: o efeito de fetch passa a depender só de `customApplied`, nunca de `customDraft`.
- Remove o efeito que reescreve os campos a partir de `bars` (linhas 215-222) — conflita com a regra nova de "não altera a data ao trocar de período".
- "Personalizado" (pill de período): ativa o modo e copia rascunho → aplicado na hora, filtrando pelo que já estiver nos campos.
- "Aplicar": valida `de <= até`, copia rascunho → aplicado, só tem efeito com período = Personalizado.
- Inputs: `disabled` fora do modo Personalizado, `max` = agora.
- Botão "Limpar": novo, restaura tudo pro default da seção 4.
- Testes: preciso confirmar se o projeto já tem Vitest/RTL configurado antes de prometer testes de componente — não verificado ainda.

### O que fica de fora, de propósito

- `srv-mt5-collector` não muda — a coleta já traz `M1`, só falta usar o que já existe.
- Sem cache/materialização de agregação (ver seção 2) — só entra se a medição pós-deploy mostrar necessidade.
- Sem mudança em Indicadores (EMA/VWAP/Volume) nem no seletor de ativo.
- Sem novo componente de arquivo — os 3 controles continuam em `TradeCandleChart.tsx`.

## 6. Decisões confirmadas pelo usuário (2026-09-28)

1. Default: **`M10` + `1D`** — confirmado, já é o valor restaurado pelo "Limpar".
2. Ordem de entrega: **implementar tudo (backend + frontend) antes de qualquer deploy**, confirmando com o usuário antes de rodar o script de cada serviço no final (em vez de deploy em 2 fases separadas).
3. Não verificado se `mt5-sim` também coleta `M1` (só `mt5-real` está confirmado) — não bloqueou a implementação; só afeta testar a feature contra o ambiente de dev antes do deploy.

## 7. Status da implementação

- **Backend concluído e testado**: `srv-mt5-market-data` (`ParseTimeframe`/`CandlesAggregated`, `go test ./...` verde) e `bff-invest` (`timeframe` exposto e validado em `GetTradeAssetCandles`, `go test ./...` verde). `system-design.md` dos dois atualizado.
- **Frontend concluído**: `TradeCandleChart.tsx`, `tradeService.ts` e `index.css` do `keepguard-core/frontend/backoffice`. `tsc -b` e `oxlint` limpos (mesmos 2 avisos pré-existentes de `set-state-in-effect`, nenhum novo); `npm run build` gera o bundle sem erro.
- **Não testado em navegador com dado real**: o ambiente de dev do frontend aponta pro `bff-invest` em `localhost:8383`, que depende de todo o stack (Postgres, Redis, `ms-company`, `ms-billing`, `srv-mt5-market-data`) rodando localmente — fora do fluxo padrão deste workspace (só produção, sem Docker local). A verificação real do fluxo (combos, Aplicar, Limpar, agregação M5/M30/H1 com dado de verdade) só acontece depois do deploy.
- **Nada commitado ainda** nos 3 repositórios — aguardando confirmação de deploy.
