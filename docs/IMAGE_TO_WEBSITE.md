# Reconstrução do dashboard a partir da imagem

## Referência
Imagem enviada na conversa: **Dashboard CRM AI em Neon Roxo(1).png**; proporção aproximada 16:9, dashboard desktop em tema escuro com acentos roxos. A imagem é a fonte visual; componentes e textos foram reconstruídos como HTML, CSS e React.

## Inventário visual
- Barra lateral escura (~17% da largura desktop): logo roxo, Dashboard, Atendimentos, Contatos, Agentes de IA, Conexões WhatsApp, Campanhas, Automações, Relatórios, Configurações e cartão Painel Master.
- Cabeçalho: título, subtítulo, seletor de empresa, notificações e usuário.
- Cinco indicadores superiores (~12% da altura): conversas, atendimentos, respostas de IA, tempo médio e resolução.
- Área principal em três colunas: caixa de entrada (~28%), conversa (~39%), detalhes do contato/agente/tarefas (~31%), com espaçamento estreito.
- Identidade: fundo #090a16, painéis #111321, bordas translúcidas violeta, CTA gradiente roxo (#7920dd → #a642fa), acentos verde/azul, cantos arredondados, tipografia sans-serif.

## Wireframe
```
+----------------+-------------------------------------------------------------+
| Marca          | Título              Empresa      Sino       Usuário         |
|                +-------------------------------------------------------------+
| Dashboard      | KPI 1     KPI 2     KPI 3     KPI 4     KPI 5             |
| Atendimentos   +------------------+-----------------------+------------------+
| Contatos       | Caixa entrada    | Contato da conversa   | Abas detalhes    |
| Agentes IA     | Busca            +-----------------------+------------------+
| WhatsApp       | Filtros          | Mensagens             | Dados contato    |
| Campanhas      | Conversa A       |                       +------------------+
| Automações     | Conversa B       |                       | Agente de IA     |
| Relatórios     | ...              |                       +------------------+
| Configurações  |                  +-----------------------+ Tarefas          |
| Painel Master  |                  | Editor de mensagem    |                  |
+----------------+------------------+-----------------------+------------------+
```

## Responsividade planejada
- **>= 1501px:** três colunas, navegação fixa.
- **1231–1500px:** sidebar e cartões mais compactos.
- **901–1230px:** duas colunas de atendimento; detalhes abaixo.
- **681–900px:** menu lateral em gaveta.
- **<= 680px:** KPIs em duas colunas; caixa de entrada, conversa e detalhes empilhados. Sem desktop miniaturizado.
- **<= 385px:** ícones estatísticos escondidos para preservar legibilidade.

## Elementos e implementação
- Layout, cards, bolhas, bordas, degradês: CSS/HTML.
- Ícones: Lucide React como SVG.
- Marca: lettering estilizado em HTML/CSS, **não é reprodução exata de eventual logotipo vetorial**.
- Avatares: iniciais em gradientes CSS (não foram usadas imagens de pessoas da referência).
- Campos, filtros, tarefas, navegação, troca de conversa e envio local: controles React.
- Sem anexos, áudio, WhatsApp, IA, autenticação ou banco operacionais; essas ações exibem estados informativos.
- Estatísticas e conversas: dados de exemplo, visivelmente indicados.

## Executar no computador
```bash
npm install
npm run dev
```
Abrir http://localhost:3000. Criar e versionar `package-lock.json` após instalação antes de qualquer deploy.

## Validação pendente
Não foi possível executar Next.js, usar Playwright ou capturar screenshots reais neste ambiente de edição via GitHub. **Não há comprovação de fidelidade pixel-perfect nem de testes automatizados.** Rodar `npm run build`, `npm run lint` e capturar screenshots em 1648×928, 1920, 1366, 768, 390 e 360 px no computador. Comparar lado a lado e corrigir.

## Diferenças conhecidas da referência
1. Avatares fotográficos substituídos por iniciais (nenhuma foto original foi fornecida separadamente).
2. Marca estilizada, não asset oficial em vetor.
3. Alguns textos/valores demonstrativos foram adaptados para não insinuar promoções comerciais ou integrações reais.
4. Interações reais de WhatsApp, envio, IA e Supabase ainda não existem.

## Segurança
Código apenas demonstrativo, sem chaves ou dados reais. Não publicar dados pessoais reais no repositório. A branch não executa migrations nem altera infraestrutura existente.
