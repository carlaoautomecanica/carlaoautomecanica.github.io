# Carlão Auto Mecânica: controle da oficina

Site simples para o celular e o computador. Ele mostra os carros que estão na oficina, o histórico de cada placa, os orçamentos enviados pelo WhatsApp e o que falta receber.

## Como funciona

A barra de baixo tem quatro abas: **Início · Buscar · ＋ Novo · Resumo**.

- **Início:** números do dia (carros na oficina, carros prontos, total a receber), os carros que estão na oficina agora, com os prontos primeiro, e quem já levou o carro, mas ainda deve.
- **Buscar:** placa ou nome do cliente. Mostra o dono, quantas vezes o carro veio, quanto já gastou e o histórico completo.
- **Novo serviço:** placa, carro, cliente, WhatsApp e serviços e peças. Os dados do cliente aparecem preenchidos se a placa já existir, e o campo de serviço sugere os nomes usados antes.
- **Ficha do serviço:** um toque muda a situação. Também tem botões para:
  - enviar o **orçamento** ou o **aviso de pronto** pelo WhatsApp;
  - gerar **orçamento e recibo em PDF**;
  - registrar o pagamento, total ou parcial.
- **Resumo:** quanto faturou e recebeu no mês, quantos carros vieram e os serviços mais feitos.
- **Hora da revisão:** clientes que não voltam há mais de 6 meses, com a mensagem pronta para o WhatsApp.

Telefone, endereço e Pix da oficina, que aparecem no PDF e nas mensagens, ficam no arquivo `config.js`.

Enquanto o Supabase não estiver configurado, o site funciona em **modo de teste**. Nesse modo, os dados ficam salvos só no navegador em que ele está aberto.

## Configuração (uma vez só, cerca de 15 minutos)

### 1. Banco de dados (Supabase, gratuito)
1. Crie uma conta em https://supabase.com e clique em **New project** (pode usar qualquer nome e qualquer senha; a região mais próxima é *South America (São Paulo)*).
2. Abra o arquivo `supabase.sql` deste repositório e troque os e-mails do final pelos e-mails de quem vai usar o sistema.
3. No Supabase, vá em **SQL Editor → New query**, cole o conteúdo de `supabase.sql` e clique em **Run**.
4. Vá em **Authentication → Users → Add user → Create new user** e crie um login (e-mail e senha) para cada pessoa. Marque **Auto Confirm User**.
5. Vá em **Project Settings → API** e copie a **Project URL** e a chave **anon public**.
6. Cole as duas no arquivo `config.js`.

> Só os e-mails listados na tabela `equipe` conseguem ver os dados. Para incluir alguém depois, rode no SQL Editor:
> `insert into equipe (email) values ('novo@email.com');` e crie o login dessa pessoa no passo 4.

### 2. Publicar o site (GitHub Pages, gratuito)
1. No GitHub, abra o repositório e vá em **Settings → Pages → Build and deployment**, escolha **Deploy from a branch**, depois **main** e a pasta **/ (root)**, e clique em **Save**.
2. Depois de 1 ou 2 minutos, o site estará em **https://gabrielgarcia095-source.github.io/Oficina/**.

### 3. Colocar no celular do seu sogro
- Abra o link no celular dele e faça o login.
- **Android (Chrome):** menu ⋮ → **Adicionar à tela inicial**.
- **iPhone (Safari):** botão Compartilhar → **Adicionar à Tela de Início**.

O login fica salvo, então ele só precisa tocar no ícone.

## Arquivos
| Arquivo | O que é |
|---|---|
| `index.html`, `style.css`, `app.js` | O site |
| `config.js` | Nome da oficina e chaves do Supabase |
| `supabase.sql` | Criação do banco e permissões |
| `manifest.json`, `icon*` | Ícone e instalação no celular |
