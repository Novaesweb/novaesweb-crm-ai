# Supabase keepalive do NovaesWeb CRM AI

Supabase: `mpteambmrlflllfqtkmq` (sa-east-1). Nenhuma tabela ou permissão é alterada.

A rota `/api/internal/supabase-keepalive` faz uma leitura mínima da tabela existente `crm_tenants` usando chave **privada somente no backend**, sem registrar resultados. Uma requisição sem Bearer token correto é rejeitada.

## Ambiente Vercel Production necessário
- `NEXT_PUBLIC_SUPABASE_URL=https://mpteambmrlflllfqtkmq.supabase.co`
- `SUPABASE_SECRET_KEY` = secret key Supabase (NUNCA `anon`/publishable neste endpoint, e NUNCA no frontend)
- `CRON_SECRET` = string aleatória de no mínimo 32 caracteres, guardada como variável criptografada.

## Agenda
`vercel.json`: uma execução diária às 10:17 UTC (07:17 Brasília).
Vercel Hobby aceita **somente uma execução por dia por cron**. Para manter duas chamadas diárias sem pagar Vercel Pro, precisa de outro agendador externo validado separadamente.

## Habilitar
1. Configurar as três variáveis de produção na Vercel.
2. Verificar build e rota em preview, se seguro.
3. Fazer deploy de produção com autorização.
4. Verificar Settings > Cron Jobs e Logs com retorno `ok: true`.
5. Sem garantias absolutas de evitar pausas do Supabase Free.

Sem as variáveis configuradas, a rota responde `503 not_configured` e não consulta o banco.
