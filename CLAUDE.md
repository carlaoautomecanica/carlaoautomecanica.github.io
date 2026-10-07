# App da Carlão Auto Mecânica

App de controle da oficina mecânica do sogro do dono deste repositório. Quem usa no dia a dia é uma pessoa com pouca familiaridade com tecnologia, principalmente pelo celular. Responda sempre em **português do Brasil**, em linguagem simples.

## Como funciona
- Site estático, sem build: `index.html`, `style.css`, `app.js` (JS puro, sem framework), `config.js`.
- Publicado pelo **GitHub Pages** a partir da branch `main`: https://gabrielgarcia095-source.github.io/Oficina/. Um push no `main` publica em 1 ou 2 minutos.
- Dados no **Supabase** (URL e chave pública em `config.js`). Tabelas `servicos` e `equipe` (veja `supabase.sql`).
  - Só os e-mails da tabela `equipe` veem os dados (RLS). Um login precisa existir em Authentication → Users **e** estar na `equipe`, escrito igual.
  - A rede do ambiente do Claude bloqueia o Supabase e o github.io. Para testar, use o modo de teste.
- Sem `SUPABASE_URL` e `SUPABASE_ANON_KEY` no `config.js`, o app roda em **modo de teste** (dados no `localStorage`). Para testar com Playwright, intercepte o `config.js` e esvazie essas chaves.
- O PDF usa jsPDF, carregado do cdnjs só quando é preciso.

## Regras
- **Sempre que mudar `style.css`, `app.js`, `config.js` ou `logo.jpg`, aumente o `?v=` no `index.html`.** Sem isso, os celulares continuam usando a versão antiga guardada.
- Mantenha a interface simples: botões grandes, poucas telas, sem jargão.
- Nunca coloque e-mails, senhas ou chaves secretas no repositório, porque ele é público. A chave publishable do Supabase pode ficar, porque é pública por natureza.
- Mudanças no banco: escreva o SQL e peça para o usuário rodar no SQL Editor do Supabase.

## Funções atuais
Início (painel e carros na oficina), Buscar (histórico por placa ou cliente), Novo serviço, ficha com situação, WhatsApp, PDF de orçamento e recibo e pagamento, Resumo do mês e Hora da revisão (a marcação de "já chamado" fica no `localStorage` do aparelho).

## Pendências e ideias
- A chave Pix ainda não foi informada (`PIX` no `config.js`).
- Ideias para depois: fotos do carro (exige bucket no Supabase Storage), mão de obra separada das peças.
