# NovaesWeb CRM AI — reconstrução fiel da tela de login

**Referência**: imagem aprovada na conversa: `tela_de_login_crm_ai_novaesweb.png`, 941 × 1672 px (orientação vertical). Imagem é referência de design, **não foi usada como fundo clicável**.

**Status:** código implementado na branch `feat/omniroute-provider-integration`; NÃO há deploy feito por esta entrega. Recursos conectados ao servidor existente; autenticação real depende de credenciais de ambiente e usuário com permissões.

## 1. Inventário visual

- Fundo escuro vinho/violeta com gradientes radiais e arcos de neon parcialmente fora da tela (CSS nativo).
- Marca alinhada ao centro: quadrado com gradiente lilás-escuro e **N** em branco, texto **NovaesWeb** e pílula **CRM AI** (HTML/CSS).
- Card glass roxo semitransparente com brilho magenta, borda fina, sombra e cantos muito arredondados (CSS).
- Ícone de cadeado dentro de bloco arredondado no topo (Lucide SVG).
- Título central **Entrar no CRM** e explicação idêntica à imagem.
- Formulário vertical com label E-mail, ícone de envelope, placeholder, senha com cadeado, ícone de visualizar, link de recuperação e CTA com gradiente e seta.
- Rodapé dentro do card, separado por divisor fino, com escudo e informação de acesso restrito.
- Nenhum elemento fictício de dados, menu, empresa ou credencial exposto antes do login.

## 2. Wireframe e medidas estimadas na referência original

| Bloco | Posição/tamanho de referência aproximados (941 × 1672) | Implementação |
| --- | --- | --- |
| Fundo | 100% da viewport | Gradientes CSS, pseudo-ornamentos isolados |
| Logotipo + texto | x 195–750, y 138–225 (555 × 87) | Flex centrado, escala fluida |
| Card | x 64–865, y 316–1414 (801 × 1098) | largura máxima 800 px, padding responsivo, glass |
| Ícone cadeado | centro x 464, y 370–490 (~100 × 120) | SVG + glow |
| Título | y 515–565 (~54 px) | H1 32–53 px fluido |
| Descrição | y 597–661 | texto central com largura máxima |
| Campo e-mail | x 120–808, y 754–841 (~688 × 87) | label real + input com SVG |
| Campo senha | x 120–808, y 922–1006 | input real com type alternável |
| Recuperação | y 1045 | botão com solicitação de e-mail via Supabase |
| CTA | x 120–808, y 1115–1215 | submit real, loading e ícone |
| Rodapé escudo | x 130–800, y 1260–1380 | separador + aviso de controle de acesso |

As medidas vieram de inspeção visual aproximada e **não são uma comparação de pixels**. Proporções CSS se adaptam quando viewport real é de 360–390 px: card horizontal quase inteiro, fontes de 12–34 px, campo 58 px, CTA 61 px, sem precisar minimizar o desktop.

## 3. Componentes e comportamento

- `src/components/crm-login.tsx`: interface HTML semântica com campos, labels associadas, autocompletar, botão de mostrar/ocultar senha, loading, mensagens e troca para recuperação.
- `src/components/crm-login.module.css`: cores, brilho, curvatura, breakpoints, estados de foco e `prefers-reduced-motion`.
- `src/components/operator-portal.tsx`: renderiza a nova tela quando sem sessão e **preserva o CRM existente** depois de `POST /api/crm/operator/session`.
- `src/app/api/crm/auth/recover/route.ts`: usa `POST /auth/v1/recover`, mensagem não revela existência de usuário, não expõe chave.
- `src/app/reset-password/page.tsx`: lê token de recuperação do fragmento do link, o apaga da barra de endereços e pede confirmação de senha.
- `src/app/api/crm/auth/reset/route.ts`: valida token Supabase e atualiza a senha pelo endpoint autenticado.
- `tests/crm-login-reference.spec.ts`: cenários de formulário, erro, senha, recuperação, isolamento de conta e larguras 1920/1366/941/768/390/360.

## 4. Para funcionar de ponta a ponta

1. Projeto Vercel novo precisa de `CRM_SUPABASE_URL` e `CRM_SUPABASE_PUBLISHABLE_KEY` do **mesmo** projeto CRM. São configurações de servidor; não usar chave `service_role` em cliente.
2. Supabase Auth: usuários precisam estar registrados e e-mail confirmado; autenticação pública de novos cadastros deve permanecer desabilitada.
3. Na configuração Supabase Auth → URL Configuration, definir **Site URL** oficial e adicionar `https://DOMINIO-OFICIAL/reset-password` à allowlist de Redirect URLs. SMTP/e-mails de recuperação devem estar operacionais. Sem isso, o botão envia pedido mas o link não consegue retornar ao site.
4. A sessão é HttpOnly e o backend limita dados por `crm_tenant_memberships` + RLS. Usuário sem empresa vinculada vê apenas mensagem de sem vínculo.
5. Acesso ao `/admin` depende de registro `platform_staff` válido e ativo. **Nunca criar/promover Master com base apenas em e-mail semelhante**. Confirmar proprietário de forma segura antes.
6. `CRM_SUPABASE_SERVICE_ROLE_KEY` só se necessário nos fluxos administrativos protegidos; nunca expor nem usar para o formulário do login.
7. Nem WhatsApp, nem IA, nem OmniRoute são ativados por esta mudança.

## 5. Validação e limites

- **Implementado:** estrutura fiel em JSX/CSS, componentes funcionais, conexão com API existente, endpoints de recuperação, testes Playwright escritos.
- **Ainda não comprovado:** screenshot de browser com dimensões 941×1672 da **versão nova**; comparação pixel a pixel; testes E2E contra usuário real; SMTP; resultado CI. Não declarar 100% de fidelidade.
- **Sem deployment:** alterações estão apenas na branch de desenvolvimento. Fazer verificação integrada e publicar **uma vez** depois de homologar e após orçamento Vercel estar disponível.
- **Possível diferença visual:** tipografia Inter depende de fontes disponíveis no navegador; gradientes e bordas por CSS podem variar ligeiramente da ilustração gerada por IA.
