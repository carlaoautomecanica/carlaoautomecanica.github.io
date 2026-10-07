(function () {
  "use strict";

  const CFG = window.CONFIG || {};
  const NOME = CFG.NOME_OFICINA || "Minha Oficina";
  const MODO_TESTE = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY;

  const STATUS = [
    { id: "orcamento", nome: "Orçamento" },
    { id: "andamento", nome: "Em andamento" },
    { id: "aguardando_peca", nome: "Esperando peça" },
    { id: "pronto", nome: "Pronto" },
    { id: "entregue", nome: "Entregue" },
  ];
  const nomeStatus = (id) => (STATUS.find((s) => s.id === id) || STATUS[0]).nome;

  const app = document.getElementById("app");
  document.getElementById("marca").textContent = NOME;
  document.title = NOME;

  // ---------- Utilidades ----------

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  const normPlaca = (p) => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  const fmtPlaca = (p) => {
    const n = normPlaca(p);
    return n.length === 7 ? n.slice(0, 3) + "-" + n.slice(3) : n;
  };

  const brl = (v) =>
    (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Aceita "120", "120,50", "1.200,50", "R$ 80"
  const numero = (txt) => {
    let s = String(txt ?? "").replace(/[^\d,.-]/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  const total = (s) => (s.itens || []).reduce((t, i) => t + (Number(i.valor) || 0), 0);
  const falta = (s) => Math.max(0, total(s) - (Number(s.pago) || 0));

  const dataBR = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");

  const linkWhats = (telefone, texto) => {
    let d = String(telefone || "").replace(/\D/g, "");
    if (d && (d.length === 10 || d.length === 11)) d = "55" + d;
    return "https://wa.me/" + d + "?text=" + encodeURIComponent(texto);
  };

  const novoId = () =>
    (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  // ---------- Armazenamento ----------
  // Mesma interface para o modo de teste (navegador) e para o Supabase.

  const bancoLocal = {
    chave: "oficina_servicos",
    ler() {
      try { return JSON.parse(localStorage.getItem(this.chave)) || []; } catch { return []; }
    },
    gravar(lista) { localStorage.setItem(this.chave, JSON.stringify(lista)); },
    async listar() { return this.ler(); },
    async salvar(s) {
      const lista = this.ler();
      const i = lista.findIndex((x) => x.id === s.id);
      if (i >= 0) lista[i] = s; else lista.push(s);
      this.gravar(lista);
      return s;
    },
    async apagar(id) { this.gravar(this.ler().filter((x) => x.id !== id)); },
  };

  let sb = null;
  const bancoNuvem = {
    async listar() {
      const { data, error } = await sb
        .from("servicos").select("*")
        .order("updated_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data;
    },
    async salvar(s) {
      const { data, error } = await sb.from("servicos").upsert(s).select().single();
      if (error) throw error;
      return data;
    },
    async apagar(id) {
      const { error } = await sb.from("servicos").delete().eq("id", id);
      if (error) throw error;
    },
  };

  const banco = MODO_TESTE ? bancoLocal : bancoNuvem;

  // Cache em memória: a oficina tem poucos milhares de fichas, cabe tudo.
  let servicos = null;
  async function carregar(forcar) {
    if (!servicos || forcar) servicos = await banco.listar();
    return servicos;
  }
  async function salvar(s) {
    s.updated_at = new Date().toISOString();
    const salvo = await banco.salvar(s);
    const i = servicos.findIndex((x) => x.id === salvo.id);
    if (i >= 0) servicos[i] = salvo; else servicos.unshift(salvo);
    return salvo;
  }
  const porId = (id) => (servicos || []).find((s) => s.id === id);
  const recentes = (lista) =>
    [...lista].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));

  // ---------- Pedaços de tela ----------

  const avisoTeste = () =>
    MODO_TESTE
      ? `<div class="aviso">⚠️ <b>Modo de teste:</b> os dados ficam salvos só neste aparelho. Configure o Supabase para sincronizar.</div>`
      : "";

  const formBusca = (valor = "") => `
    <form class="busca" id="form-busca">
      <input name="q" class="placa" placeholder="Placa ou nome" value="${esc(valor)}" autocomplete="off">
      <button class="btn" type="submit">🔍</button>
    </form>`;

  const cartao = (s) => `
    <a class="cartao st-${esc(s.status)}" href="#/servico/${esc(s.id)}">
      <div class="linha1">
        <span class="placa-txt">${esc(fmtPlaca(s.placa))}</span>
        <span class="selo st-${esc(s.status)}">${esc(nomeStatus(s.status))}</span>
      </div>
      <div>${esc(s.carro || "")}${s.cliente ? " · " + esc(s.cliente) : ""}</div>
      <div class="sub">${esc(resumoItens(s))}</div>
    </a>`;

  const resumoItens = (s) => {
    const nomes = (s.itens || []).map((i) => i.descricao).filter(Boolean);
    const txt = nomes.slice(0, 3).join(", ") + (nomes.length > 3 ? "…" : "");
    return (txt ? txt + " · " : "") + brl(total(s));
  };

  function ligarBusca() {
    const f = document.getElementById("form-busca");
    if (!f) return;
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = f.q.value.trim();
      location.hash = "#/buscar/" + encodeURIComponent(q);
    });
  }

  // ---------- Telas ----------

  async function telaInicio() {
    const lista = await carregar();
    const naOficina = recentes(lista.filter((s) => s.status !== "entregue"));
    const devendo = recentes(lista.filter((s) => s.status === "entregue" && falta(s) > 0));
    const aReceber = lista.filter((s) => s.status !== "orcamento").reduce((t, s) => t + falta(s), 0);

    app.innerHTML = `
      ${avisoTeste()}
      <a class="btn grande verde" href="#/novo">＋ Novo serviço</a>
      ${formBusca()}
      <h1>Na oficina agora (${naOficina.length})</h1>
      <div class="lista">
        ${naOficina.map(cartao).join("") || `<p class="vazio">Nenhum carro na oficina.</p>`}
      </div>
      ${devendo.length ? `
        <h2>💰 Já entregues, mas falta receber</h2>
        <div class="lista">${devendo.map(cartao).join("")}</div>` : ""}
      <div class="resumo">
        <span>Total a receber</span>
        <span class="valor">${brl(aReceber)}</span>
      </div>
      ${rodape()}`;
    ligarBusca();
    ligarRodape();
  }

  async function telaBusca(q) {
    const lista = await carregar();
    const placa = normPlaca(q);
    const nome = q.trim().toLowerCase();
    const achados = recentes(
      lista.filter(
        (s) =>
          (placa && normPlaca(s.placa).includes(placa)) ||
          (nome && String(s.cliente || "").toLowerCase().includes(nome))
      )
    );
    const primeiro = achados[0];

    app.innerHTML = `
      ${formBusca(q)}
      ${primeiro && normPlaca(primeiro.placa) === placa ? `
        <div class="ficha-topo">
          <div class="placa-txt">${esc(fmtPlaca(primeiro.placa))}</div>
          <div class="info">${esc(primeiro.carro || "")}</div>
          <div class="info"><b>Dono:</b> ${esc(primeiro.cliente || "—")}</div>
          <div class="info"><b>Telefone:</b> ${esc(primeiro.telefone || "—")}</div>
          <div class="info"><b>Vezes na oficina:</b> ${achados.length}</div>
        </div>
        <div class="botoes"><a class="btn verde" href="#/novo/${esc(placa)}">＋ Novo serviço para este carro</a></div>` : ""}
      <h1>${achados.length ? "Histórico" : "Nada encontrado"}</h1>
      <div class="lista">
        ${achados.map((s) => cartao(s).replace('<div class="sub">', `<div class="sub">${dataBR(s.created_at)} · `)).join("")}
      </div>
      ${!achados.length && placa ? `<div class="botoes"><a class="btn verde" href="#/novo/${esc(placa)}">＋ Cadastrar ${esc(fmtPlaca(placa))}</a></div>` : ""}
      <div class="botoes"><a class="btn claro" href="#/">← Voltar</a></div>`;
    ligarBusca();
  }

  async function telaServico(id) {
    await carregar();
    const s = porId(id);
    if (!s) { app.innerHTML = `<p class="vazio">Serviço não encontrado.</p><a class="btn claro" href="#/">← Voltar</a>`; return; }

    const t = total(s), f = falta(s), pago = Number(s.pago) || 0;
    app.innerHTML = `
      <div class="ficha-topo">
        <div class="placa-txt">${esc(fmtPlaca(s.placa))}</div>
        <div class="info">${esc(s.carro || "")}${s.km ? " · " + esc(s.km) + " km" : ""}</div>
        <div class="info"><b>Cliente:</b> ${esc(s.cliente || "—")}</div>
        <div class="info"><b>Telefone:</b> ${esc(s.telefone || "—")}</div>
        <div class="info"><b>Entrada:</b> ${dataBR(s.created_at)}</div>
      </div>

      <h2>Situação</h2>
      <div class="status-grade">
        ${STATUS.map((st) => `
          <button data-status="${st.id}" class="st-${st.id} ${s.status === st.id ? "ativo" : ""}">${st.nome}</button>`).join("")}
      </div>

      <h2>Serviços e peças</h2>
      <div class="tabela">
        ${(s.itens || []).map((i) => `<div class="lin"><span>${esc(i.descricao)}</span><span>${brl(i.valor)}</span></div>`).join("")}
        <div class="lin total-lin"><span>Total</span><span>${brl(t)}</span></div>
      </div>
      ${s.observacoes ? `<p><b>Obs.:</b> ${esc(s.observacoes)}</p>` : ""}

      ${s.telefone ? `
        <div class="botoes">
          <a class="btn whats" target="_blank" rel="noopener" href="${esc(linkWhats(s.telefone, msgOrcamento(s)))}">📲 Enviar orçamento no WhatsApp</a>
          <a class="btn whats" target="_blank" rel="noopener" href="${esc(linkWhats(s.telefone, msgPronto(s)))}">📲 Avisar que está pronto</a>
        </div>` : ""}

      <h2>Pagamento</h2>
      <div class="pagamento">
        ${t === 0 ? `<span class="sub">Sem valor lançado.</span>` :
          f === 0 ? `<span class="pg-ok">✅ Pago (${brl(pago)})</span>` :
          `<span class="pg-falta">Falta receber ${brl(f)}</span>${pago ? `<div class="sub">Já recebeu ${brl(pago)}</div>` : ""}`}
        ${t > 0 && f > 0 ? `
          <div class="botoes dois">
            <button class="btn verde" id="pg-tudo">Recebeu tudo</button>
            <button class="btn claro" id="pg-parte">Recebeu uma parte</button>
          </div>` : ""}
        ${pago > 0 ? `<div class="botoes"><button class="btn claro pequeno" id="pg-zerar">Desfazer pagamento</button></div>` : ""}
      </div>

      <div class="botoes" style="margin-top:28px">
        <a class="btn claro" href="#/editar/${esc(s.id)}">✏️ Editar ficha</a>
        <a class="btn claro" href="#/buscar/${esc(normPlaca(s.placa))}">📋 Histórico deste carro</a>
        <a class="btn claro" href="#/">← Voltar</a>
      </div>
      <div class="rodape"><button id="apagar">Apagar esta ficha</button></div>`;

    app.querySelectorAll("[data-status]").forEach((b) =>
      b.addEventListener("click", () => atualizar(s, { status: b.dataset.status }))
    );
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fn); };
    on("pg-tudo", () => atualizar(s, { pago: t }));
    on("pg-parte", () => {
      const v = prompt("Quanto recebeu agora? (R$)");
      if (v === null) return;
      const n = numero(v);
      if (n > 0) atualizar(s, { pago: pago + n });
    });
    on("pg-zerar", () => { if (confirm("Marcar como não pago?")) atualizar(s, { pago: 0 }); });
    on("apagar", async () => {
      if (!confirm("Apagar esta ficha para sempre?")) return;
      await tentar(async () => {
        await banco.apagar(s.id);
        servicos = servicos.filter((x) => x.id !== s.id);
        location.hash = "#/";
      });
    });
  }

  async function atualizar(s, mudancas) {
    await tentar(async () => {
      await salvar({ ...s, ...mudancas });
      render();
    });
  }

  const msgOrcamento = (s) => {
    const linhas = (s.itens || []).map((i) => `• ${i.descricao}: ${brl(i.valor)}`).join("\n");
    return `*${NOME}*\nOrçamento – ${s.carro || "veículo"} (${fmtPlaca(s.placa)})\n\n${linhas}\n\n*Total: ${brl(total(s))}*\n\nQualquer dúvida é só chamar!`;
  };
  const msgPronto = (s) => {
    const nome = String(s.cliente || "").split(" ")[0];
    const f = falta(s);
    return `Olá${nome ? ", " + nome : ""}! Seu ${s.carro || "carro"} (${fmtPlaca(s.placa)}) já está pronto. ` +
      (f > 0 ? `Valor: ${brl(f)}. ` : "") + `Pode vir buscar!\n\n${NOME}`;
  };

  async function telaFormulario(id, placaInicial) {
    await carregar();
    const existente = id ? porId(id) : null;
    if (id && !existente) { location.hash = "#/"; return; }

    const s = existente
      ? { ...existente, itens: [...(existente.itens || [])] }
      : { placa: placaInicial || "", carro: "", cliente: "", telefone: "", km: "", itens: [], observacoes: "", status: "orcamento", pago: 0 };
    if (!s.itens.length) s.itens.push({ descricao: "", valor: "" });

    app.innerHTML = `
      <h1>${existente ? "Editar ficha" : "Novo serviço"}</h1>
      <form id="form">
        <label for="placa">Placa</label>
        <input id="placa" name="placa" class="placa" value="${esc(fmtPlaca(s.placa))}" required autocomplete="off" placeholder="ABC-1D23">
        <div class="dica" id="dica-placa"></div>

        <label for="carro">Carro</label>
        <input id="carro" name="carro" value="${esc(s.carro)}" placeholder="Ex.: Gol 2015 prata">

        <label for="cliente">Nome do cliente</label>
        <input id="cliente" name="cliente" value="${esc(s.cliente)}" autocomplete="off">

        <label for="telefone">WhatsApp do cliente</label>
        <input id="telefone" name="telefone" type="tel" inputmode="tel" value="${esc(s.telefone)}" placeholder="(11) 98765-4321">

        <label for="km">Quilometragem (opcional)</label>
        <input id="km" name="km" inputmode="numeric" value="${esc(s.km)}">

        <label>Serviços e peças</label>
        <div id="itens"></div>
        <button type="button" class="btn claro" id="mais-item">＋ Adicionar linha</button>
        <div class="total" id="total"></div>

        <label for="observacoes">Observações</label>
        <textarea id="observacoes" name="observacoes">${esc(s.observacoes)}</textarea>

        <div class="botoes" style="margin-top:24px">
          <button class="btn grande verde" type="submit">💾 Salvar</button>
          <a class="btn claro" href="${existente ? "#/servico/" + esc(s.id) : "#/"}">Cancelar</a>
        </div>
        <div class="erro" id="erro"></div>
      </form>`;

    const form = document.getElementById("form");
    const caixaItens = document.getElementById("itens");

    const desenharItens = () => {
      caixaItens.innerHTML = s.itens.map((i, n) => `
        <div class="item">
          <input data-n="${n}" data-campo="descricao" value="${esc(i.descricao)}" placeholder="Ex.: Troca de óleo">
          <input data-n="${n}" data-campo="valor" value="${esc(i.valor)}" inputmode="decimal" placeholder="R$">
          <button type="button" data-tirar="${n}" aria-label="Remover">×</button>
        </div>`).join("");
      atualizarTotal();
    };
    const atualizarTotal = () => {
      const t = s.itens.reduce((a, i) => a + numero(i.valor), 0);
      document.getElementById("total").textContent = "Total: " + brl(t);
    };

    caixaItens.addEventListener("input", (e) => {
      const n = e.target.dataset.n;
      if (n === undefined) return;
      s.itens[n][e.target.dataset.campo] = e.target.value;
      atualizarTotal();
    });
    caixaItens.addEventListener("click", (e) => {
      const n = e.target.dataset.tirar;
      if (n === undefined) return;
      s.itens.splice(Number(n), 1);
      if (!s.itens.length) s.itens.push({ descricao: "", valor: "" });
      desenharItens();
    });
    document.getElementById("mais-item").addEventListener("click", () => {
      s.itens.push({ descricao: "", valor: "" });
      desenharItens();
      caixaItens.querySelector(`[data-n="${s.itens.length - 1}"]`).focus();
    });
    desenharItens();

    // Carro já conhecido: preenche cliente/carro/telefone automaticamente.
    const preencherPelaPlaca = () => {
      const p = normPlaca(form.placa.value);
      const dica = document.getElementById("dica-placa");
      const anterior = p.length >= 7 && recentes(servicos).find((x) => normPlaca(x.placa) === p && x.id !== s.id);
      if (!anterior) { dica.textContent = ""; return; }
      dica.textContent = "✓ Carro já cadastrado — dados preenchidos.";
      for (const c of ["carro", "cliente", "telefone"]) if (!form[c].value) form[c].value = anterior[c] || "";
    };
    form.placa.addEventListener("input", preencherPelaPlaca);
    if (!existente) preencherPelaPlaca();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const placa = normPlaca(form.placa.value);
      if (!placa) { document.getElementById("erro").textContent = "Informe a placa."; return; }
      const agora = new Date().toISOString();
      const dados = {
        ...s,
        id: s.id || novoId(),
        created_at: s.created_at || agora,
        placa,
        carro: form.carro.value.trim(),
        cliente: form.cliente.value.trim(),
        telefone: form.telefone.value.trim(),
        km: form.km.value.trim(),
        observacoes: form.observacoes.value.trim(),
        itens: s.itens
          .filter((i) => String(i.descricao).trim() || numero(i.valor))
          .map((i) => ({ descricao: String(i.descricao).trim(), valor: numero(i.valor) })),
      };
      await tentar(async () => {
        const salvo = await salvar(dados);
        location.hash = "#/servico/" + salvo.id;
      });
    });
  }

  // ---------- Login (só no modo nuvem) ----------

  function telaLogin() {
    app.innerHTML = `
      <h1>Entrar</h1>
      <form id="login">
        <label for="email">E-mail</label>
        <input id="email" name="email" type="email" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required>
        <label for="senha">Senha</label>
        <input id="senha" name="senha" type="password" autocomplete="current-password" required>
        <div class="botoes" style="margin-top:24px"><button class="btn grande" type="submit">Entrar</button></div>
        <div class="erro" id="erro"></div>
      </form>`;
    const f = document.getElementById("login");
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim().toLowerCase(), password: f.senha.value });
      if (error) {
        const msg = /invalid login/i.test(error.message) ? "E-mail ou senha incorretos."
          : /not confirmed/i.test(error.message) ? "Este e-mail ainda não foi confirmado no Supabase."
          : "Não foi possível entrar.";
        document.getElementById("erro").textContent = msg + " (" + error.message + ")";
        return;
      }
      render();
    });
  }

  const rodape = () =>
    MODO_TESTE ? "" : `<div class="rodape"><button id="sair">Sair da conta</button></div>`;
  function ligarRodape() {
    const b = document.getElementById("sair");
    if (b) b.addEventListener("click", async () => { await sb.auth.signOut(); servicos = null; render(); });
  }

  async function tentar(fn) {
    try {
      await fn();
    } catch (err) {
      console.error(err);
      alert("Não foi possível salvar. Verifique a internet e tente de novo.\n\n" + (err.message || err));
    }
  }

  // ---------- Navegação ----------

  async function render() {
    window.scrollTo(0, 0);
    if (!MODO_TESTE) {
      const { data } = await sb.auth.getSession();
      if (!data.session) return telaLogin();
    }
    const partes = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    try {
      switch (partes[0]) {
        case "novo": return await telaFormulario(null, partes[1]);
        case "editar": return await telaFormulario(partes[1]);
        case "servico": return await telaServico(partes[1]);
        case "buscar": return await telaBusca(partes[1] || "");
        default: return await telaInicio();
      }
    } catch (err) {
      console.error(err);
      app.innerHTML = `<p class="erro">Não foi possível carregar os dados. Verifique a internet.</p>
        <div class="botoes"><button class="btn" onclick="location.reload()">Tentar de novo</button></div>`;
    }
  }

  if (!MODO_TESTE) {
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  }
  window.addEventListener("hashchange", render);
  // Ao voltar para o app (ex.: depois de mandar WhatsApp), busca dados novos.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !servicos) return;
    if (/^#\/(novo|editar)/.test(location.hash)) return; // não apagar formulário em edição
    servicos = null;
    render();
  });
  render();
})();
