(function () {
  "use strict";

  const CFG = window.CONFIG || {};
  const NOME = CFG.NOME_OFICINA || "Minha Oficina";
  const MESES_REVISAO = Number(CFG.MESES_REVISAO) || 6;
  const MODO_TESTE = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY;
  const JSPDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

  const STATUS = [
    { id: "pronto", nome: "Pronto" },
    { id: "andamento", nome: "Em andamento" },
    { id: "aguardando_peca", nome: "Esperando peça" },
    { id: "orcamento", nome: "Orçamento" },
    { id: "entregue", nome: "Entregue" },
  ];
  const nomeStatus = (id) => (STATUS.find((s) => s.id === id) || STATUS[3]).nome;
  const ordemStatus = (id) => STATUS.findIndex((s) => s.id === id);

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

  // 11987654321 -> (11) 98765-4321
  const fmtTelefone = (t) => {
    const d = String(t || "").replace(/\D/g, "");
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return String(t || "");
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
  const mesesDesde = (iso) => (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  const primeiroNome = (s) => String(s.cliente || "").trim().split(" ")[0];

  const linkWhats = (telefone, texto) => {
    let d = String(telefone || "").replace(/\D/g, "");
    if (d && (d.length === 10 || d.length === 11)) d = "55" + d;
    return "https://wa.me/" + d + "?text=" + encodeURIComponent(texto);
  };

  const novoId = () =>
    (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  const numeroDoc = (s) => String(s.id || "").replace(/-/g, "").slice(0, 6).toUpperCase();

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("mostra");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("mostra"), 2200);
  }

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
    async temAcesso() { return true; },
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
    async temAcesso() {
      const { data, error } = await sb.from("equipe").select("email").limit(1);
      if (error) throw error;
      return data.length > 0;
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

  // Último serviço de cada placa (para histórico e revisões).
  function ultimoPorPlaca(lista) {
    const mapa = new Map();
    for (const s of lista) {
      const p = normPlaca(s.placa);
      const atual = mapa.get(p);
      if (!atual || String(s.created_at) > String(atual.created_at)) mapa.set(p, s);
    }
    return [...mapa.values()];
  }

  // Quando cada cliente foi chamado para revisão (guardado neste aparelho).
  const lembretes = () => {
    try { return JSON.parse(localStorage.getItem("oficina_lembretes")) || {}; } catch { return {}; }
  };
  const marcarLembrete = (placa) => {
    try {
      const l = lembretes();
      l[normPlaca(placa)] = new Date().toISOString();
      localStorage.setItem("oficina_lembretes", JSON.stringify(l));
    } catch {}
  };

  // Clientes que não voltam há MESES_REVISAO meses e ainda não foram chamados no último mês.
  function paraRevisao(lista) {
    return ultimoPorPlaca(lista)
      .filter((s) =>
        s.status === "entregue" && s.telefone &&
        mesesDesde(s.created_at) >= MESES_REVISAO &&
        !(lembretes()[normPlaca(s.placa)] && mesesDesde(lembretes()[normPlaca(s.placa)]) < 1))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }

  // ---------- Pedaços de tela ----------

  const avisoTeste = () =>
    MODO_TESTE
      ? `<div class="aviso">⚠️ <b>Modo de teste:</b> os dados ficam salvos só neste aparelho.</div>`
      : "";

  const formBusca = (valor = "", foco = false) => `
    <form class="busca" id="form-busca">
      <input name="q" class="placa" placeholder="Placa ou nome do cliente" value="${esc(valor)}" autocomplete="off" ${foco ? "autofocus" : ""}>
      <button class="btn" type="submit" aria-label="Buscar">🔍</button>
    </form>`;

  const resumoItens = (s) => {
    const nomes = (s.itens || []).map((i) => i.descricao).filter(Boolean);
    const txt = nomes.slice(0, 3).join(", ") + (nomes.length > 3 ? "…" : "");
    return (txt ? txt + " · " : "") + brl(total(s));
  };

  const cartao = (s, comData) => `
    <a class="cartao st-${esc(s.status)}" href="#/servico/${esc(s.id)}">
      <div class="linha1">
        <span class="placa-txt">${esc(fmtPlaca(s.placa))}</span>
        <span class="selo st-${esc(s.status)}">${esc(nomeStatus(s.status))}</span>
      </div>
      <div style="margin-top:6px">${esc(s.carro || "")}${s.cliente ? " · " + esc(s.cliente) : ""}</div>
      <div class="sub">${comData ? dataBR(s.created_at) + " · " : ""}${esc(resumoItens(s))}${falta(s) > 0 && s.status === "entregue" ? " · <b style='color:var(--perigo)'>deve " + brl(falta(s)) + "</b>" : ""}</div>
    </a>`;

  function ligarBusca() {
    const f = document.getElementById("form-busca");
    if (!f) return;
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      location.hash = "#/buscar/" + encodeURIComponent(f.q.value.trim());
    });
  }

  // ---------- Telas ----------

  async function telaInicio() {
    const lista = await carregar();
    const naOficina = lista
      .filter((s) => s.status !== "entregue")
      .sort((a, b) => ordemStatus(a.status) - ordemStatus(b.status) ||
        String(b.updated_at).localeCompare(String(a.updated_at)));
    const prontos = naOficina.filter((s) => s.status === "pronto").length;
    const devendo = recentes(lista.filter((s) => s.status === "entregue" && falta(s) > 0));
    const aReceber = lista.filter((s) => s.status !== "orcamento").reduce((t, s) => t + falta(s), 0);
    const revisoes = paraRevisao(lista).length;

    app.innerHTML = `
      ${avisoTeste()}
      <div class="painel">
        <div class="numero azul"><div class="valor">${naOficina.length}</div><div class="rotulo">na oficina</div></div>
        <div class="numero verde"><div class="valor">${prontos}</div><div class="rotulo">prontos</div></div>
        <div class="numero vermelho"><div class="valor dinheiro">${brl(aReceber)}</div><div class="rotulo">a receber</div></div>
      </div>
      ${revisoes ? `
        <a class="faixa" href="#/revisoes">
          <span class="icone">🔔</span>
          <span class="texto">${revisoes} cliente${revisoes > 1 ? "s" : ""} na hora da revisão</span>
          <span class="seta">›</span>
        </a>` : ""}
      ${formBusca()}
      <h1>Na oficina agora</h1>
      <div class="lista">
        ${naOficina.map((s) => cartao(s)).join("") || `
          <p class="vazio">Nenhum carro na oficina.<br>Toque em <b>＋ Novo</b> quando chegar um.</p>`}
      </div>
      ${devendo.length ? `
        <h2>💰 Entregues, mas falta receber</h2>
        <div class="lista">${devendo.map((s) => cartao(s, true)).join("")}</div>` : ""}
      ${rodape()}`;
    ligarBusca();
    ligarRodape();
  }

  async function telaBusca(q) {
    const lista = await carregar();
    const placa = normPlaca(q);
    const nome = q.trim().toLowerCase();

    if (!q.trim()) {
      const ultimos = recentes(ultimoPorPlaca(lista)).slice(0, 15);
      app.innerHTML = `
        <h1>Buscar</h1>
        ${formBusca("", true)}
        <h2>Últimos carros atendidos</h2>
        <div class="lista">${ultimos.map((s) => cartao(s, true)).join("") || `<p class="vazio">Nenhum carro cadastrado ainda.</p>`}</div>`;
      ligarBusca();
      return;
    }

    const achados = recentes(
      lista.filter(
        (s) =>
          (placa && normPlaca(s.placa).includes(placa)) ||
          (nome && String(s.cliente || "").toLowerCase().includes(nome))
      )
    );
    const doCarro = achados.filter((s) => normPlaca(s.placa) === placa);
    const primeiro = doCarro[0];
    const gastoTotal = doCarro.reduce((t, s) => t + total(s), 0);

    app.innerHTML = `
      ${formBusca(q)}
      ${primeiro ? `
        <div class="ficha-topo">
          <span class="placa-txt">${esc(fmtPlaca(primeiro.placa))}</span>
          <div class="info">${esc(primeiro.carro || "")}</div>
          <div class="info"><b>Dono:</b> ${esc(primeiro.cliente || "—")}</div>
          <div class="info"><b>Telefone:</b> ${esc(fmtTelefone(primeiro.telefone) || "—")}</div>
          <div class="info"><b>Vezes na oficina:</b> ${doCarro.length} · <b>Total gasto:</b> ${brl(gastoTotal)}</div>
        </div>
        <div class="botoes"><a class="btn amarelo" href="#/novo/${esc(placa)}">＋ Novo serviço para este carro</a></div>` : ""}
      <h1>${achados.length ? "Histórico" : "Nada encontrado"}</h1>
      <div class="lista">${achados.map((s) => cartao(s, true)).join("")}</div>
      ${!achados.length && placa ? `<div class="botoes"><a class="btn amarelo" href="#/novo/${esc(placa)}">＋ Cadastrar ${esc(fmtPlaca(placa))}</a></div>` : ""}`;
    ligarBusca();
  }

  async function telaServico(id) {
    await carregar();
    const s = porId(id);
    if (!s) { app.innerHTML = `<p class="vazio">Serviço não encontrado.</p><a class="btn claro" href="#/">← Início</a>`; return; }
    carregarJsPDF().catch(() => {}); // adianta o download para o PDF sair rápido

    const t = total(s), f = falta(s), pago = Number(s.pago) || 0;
    app.innerHTML = `
      <div class="ficha-topo">
        <span class="placa-txt">${esc(fmtPlaca(s.placa))}</span>
        <div class="info" style="font-weight:700">${esc(s.carro || "")}${s.km ? " · " + esc(s.km) + " km" : ""}</div>
        <div class="info"><b>Cliente:</b> ${esc(s.cliente || "—")}</div>
        <div class="info"><b>Telefone:</b> ${esc(fmtTelefone(s.telefone) || "—")}</div>
        <div class="info"><b>Entrada:</b> ${dataBR(s.created_at)} · <b>Nº</b> ${esc(numeroDoc(s))}</div>
      </div>

      <h2>Situação</h2>
      <div class="status-grade">
        ${["orcamento", "andamento", "aguardando_peca", "pronto", "entregue"].map((st) => `
          <button data-status="${st}" class="st-${st} ${s.status === st ? "ativo" : ""}">${nomeStatus(st)}</button>`).join("")}
      </div>

      <h2>Serviços e peças</h2>
      <div class="tabela">
        ${(s.itens || []).map((i) => `<div class="lin"><span>${esc(i.descricao)}</span><span>${brl(i.valor)}</span></div>`).join("")}
        <div class="lin total-lin"><span>Total</span><span>${brl(t)}</span></div>
      </div>
      ${s.observacoes ? `<p><b>Obs.:</b> ${esc(s.observacoes)}</p>` : ""}

      <h2>Enviar para o cliente</h2>
      <div class="botoes">
        ${s.telefone ? `
          <a class="btn whats" target="_blank" rel="noopener" href="${esc(linkWhats(s.telefone, msgOrcamento(s)))}">📲 Orçamento no WhatsApp</a>
          <a class="btn whats" target="_blank" rel="noopener" href="${esc(linkWhats(s.telefone, msgPronto(s)))}">📲 Avisar que está pronto</a>` : ""}
        <div class="botoes dois" style="margin:0">
          <button class="btn claro" id="pdf-orcamento">📄 Orçamento PDF</button>
          <button class="btn claro" id="pdf-recibo" ${pago > 0 ? "" : "disabled title='Registre um pagamento primeiro'"}>🧾 Recibo PDF</button>
        </div>
      </div>

      <h2>Pagamento</h2>
      <div class="caixa">
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
      </div>
      <div class="rodape"><button id="apagar">Apagar esta ficha</button></div>`;

    app.querySelectorAll("[data-status]").forEach((b) =>
      b.addEventListener("click", () => atualizar(s, { status: b.dataset.status }, "Situação: " + nomeStatus(b.dataset.status)))
    );
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fn); };
    on("pg-tudo", () => atualizar(s, { pago: t }, "Pagamento registrado ✓"));
    on("pg-parte", () => {
      const v = prompt("Quanto recebeu agora? (R$)");
      if (v === null) return;
      const n = numero(v);
      if (n > 0) atualizar(s, { pago: pago + n }, "Recebido " + brl(n) + " ✓");
    });
    on("pg-zerar", () => { if (confirm("Marcar como não pago?")) atualizar(s, { pago: 0 }, "Pagamento desfeito"); });
    on("pdf-orcamento", (e) => compartilharPDF(s, "orcamento", e.currentTarget));
    on("pdf-recibo", (e) => compartilharPDF(s, "recibo", e.currentTarget));
    on("apagar", async () => {
      if (!confirm("Apagar esta ficha para sempre?")) return;
      await tentar(async () => {
        await banco.apagar(s.id);
        servicos = servicos.filter((x) => x.id !== s.id);
        toast("Ficha apagada");
        location.hash = "#/";
      });
    });

  }

  async function atualizar(s, mudancas, msg) {
    await tentar(async () => {
      await salvar({ ...s, ...mudancas });
      if (msg) toast(msg);
      render(true);
    });
  }

  const msgOrcamento = (s) => {
    const linhas = (s.itens || []).map((i) => `• ${i.descricao}: ${brl(i.valor)}`).join("\n");
    return `*${NOME}*\nOrçamento – ${s.carro || "veículo"} (${fmtPlaca(s.placa)})\n\n${linhas}\n\n*Total: ${brl(total(s))}*` +
      (CFG.PIX ? `\n\nPix: ${CFG.PIX}` : "") + `\n\nQualquer dúvida é só chamar!`;
  };
  const msgPronto = (s) => {
    const nome = primeiroNome(s);
    const f = falta(s);
    return `Olá${nome ? ", " + nome : ""}! Seu ${s.carro || "carro"} (${fmtPlaca(s.placa)}) já está pronto. ` +
      (f > 0 ? `Valor: ${brl(f)}. ` : "") + `Pode vir buscar!` +
      (CFG.PIX && f > 0 ? `\nPix: ${CFG.PIX}` : "") + `\n\n${NOME}`;
  };
  const msgRevisao = (s) => {
    const nome = primeiroNome(s);
    const meses = Math.floor(mesesDesde(s.created_at));
    return `Olá${nome ? ", " + nome : ""}! Aqui é da ${NOME}. ` +
      `Já faz ${meses} meses desde o último serviço no seu ${s.carro || "carro"} (${fmtPlaca(s.placa)}). ` +
      `Que tal agendar uma revisão? É só responder aqui. 🔧`;
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
          <button class="btn grande amarelo" type="submit">💾 Salvar</button>
          <a class="btn claro" href="${existente ? "#/servico/" + esc(s.id) : "#/"}">Cancelar</a>
        </div>
        <div class="erro" id="erro"></div>
      </form>`;

    const form = document.getElementById("form");
    const caixaItens = document.getElementById("itens");

    const atualizarTotal = () => {
      const t = s.itens.reduce((a, i) => a + numero(i.valor), 0);
      document.getElementById("total").textContent = "Total: " + brl(t);
    };
    const desenharItens = () => {
      caixaItens.innerHTML = s.itens.map((i, n) => `
        <div class="item">
          <input data-n="${n}" data-campo="descricao" value="${esc(i.descricao)}" placeholder="Ex.: Troca de óleo" list="sugestoes">
          <input data-n="${n}" data-campo="valor" value="${esc(i.valor)}" inputmode="decimal" placeholder="R$">
          <button type="button" data-tirar="${n}" aria-label="Remover">×</button>
        </div>`).join("") + `<datalist id="sugestoes">${sugestoes().map((d) => `<option value="${esc(d)}">`).join("")}</datalist>`;
      atualizarTotal();
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
        toast("Salvo ✓");
        location.hash = "#/servico/" + salvo.id;
      });
    });
  }

  // Serviços já usados antes, para o campo sugerir enquanto digita.
  function sugestoes() {
    const vistos = new Map();
    for (const s of servicos || [])
      for (const i of s.itens || []) {
        const d = String(i.descricao || "").trim();
        if (d) vistos.set(d.toLowerCase(), d);
      }
    return [...vistos.values()].slice(0, 200);
  }

  async function telaResumo(mesTxt) {
    const lista = await carregar();
    const hoje = new Date();
    const [ano, mes] = /^\d{4}-\d{2}$/.test(mesTxt || "")
      ? mesTxt.split("-").map(Number)
      : [hoje.getFullYear(), hoje.getMonth() + 1];
    const chave = (a, m) => `${a}-${String(m).padStart(2, "0")}`;
    const anterior = mes === 1 ? chave(ano - 1, 12) : chave(ano, mes - 1);
    const proximo = mes === 12 ? chave(ano + 1, 1) : chave(ano, mes + 1);
    const nomeMes = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
      .replace(/^./, (c) => c.toUpperCase());

    const doMes = lista.filter((s) => {
      const d = new Date(s.created_at);
      return d.getFullYear() === ano && d.getMonth() + 1 === mes;
    });
    const fechados = doMes.filter((s) => s.status !== "orcamento");
    const faturado = fechados.reduce((t, s) => t + total(s), 0);
    const recebido = fechados.reduce((t, s) => t + (Number(s.pago) || 0), 0);
    const carros = new Set(fechados.map((s) => normPlaca(s.placa))).size;
    const orcAbertos = doMes.filter((s) => s.status === "orcamento").length;
    const ticket = fechados.length ? faturado / fechados.length : 0;

    const contagem = new Map();
    for (const s of fechados)
      for (const i of s.itens || []) {
        const d = String(i.descricao || "").trim();
        if (!d) continue;
        const k = d.toLowerCase();
        const atual = contagem.get(k) || { nome: d, vezes: 0, valor: 0 };
        atual.vezes++;
        atual.valor += Number(i.valor) || 0;
        contagem.set(k, atual);
      }
    const maisFeitos = [...contagem.values()].sort((a, b) => b.vezes - a.vezes || b.valor - a.valor).slice(0, 8);
    const revisoes = paraRevisao(lista).length;

    app.innerHTML = `
      <div class="mes">
        <a class="btn claro pequeno" href="#/resumo/${anterior}" aria-label="Mês anterior">‹</a>
        <h1>${esc(nomeMes)}</h1>
        <a class="btn claro pequeno" href="#/resumo/${proximo}" aria-label="Próximo mês">›</a>
      </div>
      <div class="painel dois">
        <div class="numero amarelo"><div class="valor dinheiro">${brl(faturado)}</div><div class="rotulo">faturado</div></div>
        <div class="numero verde"><div class="valor dinheiro">${brl(recebido)}</div><div class="rotulo">recebido</div></div>
        <div class="numero vermelho"><div class="valor dinheiro">${brl(Math.max(0, faturado - recebido))}</div><div class="rotulo">falta receber</div></div>
        <div class="numero azul"><div class="valor">${carros}</div><div class="rotulo">carros atendidos</div></div>
      </div>
      <div class="caixa sub">
        Média por serviço: <b>${brl(ticket)}</b><br>
        Orçamentos ainda não aprovados: <b>${orcAbertos}</b>
      </div>

      <h2>Serviços mais feitos</h2>
      <div class="tabela ranking">
        ${maisFeitos.map((m) => `<div class="lin"><span>${esc(m.nome)}</span><span class="qtd">${m.vezes}×</span></div>`).join("") ||
          `<div class="lin"><span class="sub">Nenhum serviço neste mês.</span></div>`}
      </div>

      <h2>Clientes</h2>
      <a class="faixa" href="#/revisoes">
        <span class="icone">🔔</span>
        <span class="texto">Hora da revisão${revisoes ? ` (${revisoes})` : ""}</span>
        <span class="seta">›</span>
      </a>
      <p class="sub">O resumo conta os serviços pela data de entrada, sem os orçamentos ainda não aprovados.</p>
      ${rodape()}`;
    ligarRodape();
  }

  async function telaRevisoes() {
    const lista = paraRevisao(await carregar());
    app.innerHTML = `
      <h1>🔔 Hora da revisão</h1>
      <p class="sub">Clientes que não voltam há mais de ${MESES_REVISAO} meses. Mande uma mensagem para trazer o carro de volta.
        Depois de chamado, o cliente some da lista por 1 mês.</p>
      <div class="lista">
        ${lista.map((s) => `
          <div class="cartao st-entregue">
            <div class="linha1">
              <span class="placa-txt">${esc(fmtPlaca(s.placa))}</span>
              <span class="sub">há ${Math.floor(mesesDesde(s.created_at))} meses</span>
            </div>
            <div style="margin-top:6px">${esc(s.carro || "")}${s.cliente ? " · " + esc(s.cliente) : ""}</div>
            <div class="sub">Último: ${esc(resumoItens(s))}</div>
            <div class="botoes" style="margin-bottom:0">
              <a class="btn whats" data-chamar="${esc(s.id)}" target="_blank" rel="noopener" href="${esc(linkWhats(s.telefone, msgRevisao(s)))}">📲 Chamar no WhatsApp</a>
            </div>
          </div>`).join("") || `<p class="vazio">Nenhum cliente para chamar agora. 👍</p>`}
      </div>`;

    app.querySelectorAll("[data-chamar]").forEach((a) =>
      a.addEventListener("click", () => {
        marcarLembrete(porId(a.dataset.chamar).placa);
        setTimeout(() => render(true), 500);
      })
    );
  }

  // ---------- PDF (orçamento e recibo) ----------

  let jspdfPromessa;
  function carregarJsPDF() {
    if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
    jspdfPromessa = jspdfPromessa || new Promise((ok, erro) => {
      const sc = document.createElement("script");
      sc.src = JSPDF_URL;
      sc.onload = () => ok(window.jspdf.jsPDF);
      sc.onerror = () => { jspdfPromessa = null; erro(new Error("Sem internet para gerar o PDF.")); };
      document.head.appendChild(sc);
    });
    return jspdfPromessa;
  }

  function montarPDF(jsPDF, s, tipo) {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = 210, M = 16, D = W - M;
    const recibo = tipo === "recibo";
    const t = total(s), pago = Number(s.pago) || 0, f = falta(s);

    // Cabeçalho
    doc.setFillColor(28, 31, 38); doc.rect(0, 0, W, 30, "F");
    doc.setFillColor(250, 204, 21); doc.rect(0, 30, W, 1.6, "F");
    doc.setTextColor(250, 204, 21); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    doc.text(NOME, M, 15);
    doc.setTextColor(220, 223, 228); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    const contato = [CFG.ENDERECO_OFICINA, CFG.TELEFONE_OFICINA].filter(Boolean).join("   |   ");
    if (contato) doc.text(contato, M, 23);

    // Título
    let y = 46;
    doc.setTextColor(20, 22, 27); doc.setFont("helvetica", "bold"); doc.setFontSize(17);
    doc.text(recibo ? "RECIBO" : "ORÇAMENTO", M, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`Nº ${numeroDoc(s)}    Data: ${new Date().toLocaleDateString("pt-BR")}`, D, y, { align: "right" });

    // Cliente e veículo
    y += 7;
    doc.setDrawColor(214, 217, 223); doc.setFillColor(242, 243, 245);
    doc.roundedRect(M, y, D - M, 24, 2, 2, "FD");
    const campo = (rotulo, valor, x, yy) => {
      doc.setFont("helvetica", "bold"); doc.setTextColor(107, 114, 128); doc.text(rotulo, x, yy);
      const largura = doc.getTextWidth(rotulo);
      doc.setFont("helvetica", "normal"); doc.setTextColor(20, 22, 27);
      doc.text(String(valor || "-"), x + largura + 2, yy);
    };
    doc.setFontSize(10.5);
    campo("Cliente:", s.cliente, M + 4, y + 9);
    campo("Telefone:", fmtTelefone(s.telefone), M + 104, y + 9);
    campo("Veículo:", s.carro, M + 4, y + 18);
    campo("Placa:", fmtPlaca(s.placa) + (s.km ? `    Km: ${s.km}` : ""), M + 104, y + 18);

    // Itens
    y += 34;
    doc.setFillColor(28, 31, 38); doc.rect(M, y - 6, D - M, 9, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
    doc.text("Descrição", M + 3, y); doc.text("Valor", D - 3, y, { align: "right" });
    y += 9;
    doc.setFont("helvetica", "normal"); doc.setTextColor(20, 22, 27);
    (s.itens || []).forEach((i, n) => {
      const linhas = doc.splitTextToSize(String(i.descricao || "-"), D - M - 45);
      const alt = linhas.length * 5.5 + 3;
      if (y + alt > 265) { doc.addPage(); y = 20; }
      if (n % 2) { doc.setFillColor(247, 248, 250); doc.rect(M, y - 5.5, D - M, alt, "F"); }
      doc.text(linhas, M + 3, y);
      doc.text(brl(i.valor), D - 3, y, { align: "right" });
      y += alt;
    });

    // Totais
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setDrawColor(20, 22, 27); doc.line(M + 95, y - 2, D, y - 2);
    y += 5;
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text("Total", M + 97, y); doc.text(brl(t), D - 3, y, { align: "right" });
    if (recibo) {
      doc.setFontSize(11); doc.setFont("helvetica", "normal");
      y += 7; doc.text("Pago", M + 97, y); doc.text(brl(pago), D - 3, y, { align: "right" });
      if (f > 0) {
        y += 7; doc.setTextColor(220, 38, 38);
        doc.text("Falta", M + 97, y); doc.text(brl(f), D - 3, y, { align: "right" });
        doc.setTextColor(20, 22, 27);
      }
    }

    // Texto final
    y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
    const textos = [];
    if (recibo) textos.push(`Recebemos de ${s.cliente || "____________________"} a importância de ${brl(pago)} referente aos serviços descritos acima.`);
    if (s.observacoes) textos.push("Observações: " + s.observacoes);
    if (CFG.PIX && (!recibo || f > 0)) textos.push("Pagamento via Pix: " + CFG.PIX);
    if (!recibo) textos.push("Orçamento válido por 7 dias.");
    for (const tx of textos) {
      const linhas = doc.splitTextToSize(tx, D - M);
      if (y + linhas.length * 5.5 > 280) { doc.addPage(); y = 20; }
      doc.text(linhas, M, y);
      y += linhas.length * 5.5 + 3;
    }

    if (recibo) {
      y = Math.max(y + 20, 250);
      if (y > 280) { doc.addPage(); y = 40; }
      doc.setDrawColor(150); doc.line(W / 2 - 45, y, W / 2 + 45, y);
      doc.setFontSize(10); doc.text(NOME, W / 2, y + 5, { align: "center" });
    }
    return doc;
  }

  async function compartilharPDF(s, tipo, botao) {
    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = "Gerando…";
    try {
      const jsPDF = await carregarJsPDF();
      const doc = montarPDF(jsPDF, s, tipo);
      const nomeArq = `${tipo === "recibo" ? "Recibo" : "Orcamento"}-${normPlaca(s.placa)}.pdf`;
      const arquivo = new File([doc.output("blob")], nomeArq, { type: "application/pdf" });
      // No celular abre o menu de compartilhar (WhatsApp etc.); no computador baixa o arquivo.
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], title: nomeArq });
          return;
        } catch (err) {
          if (err.name === "AbortError") return;
        }
      }
      doc.save(nomeArq);
    } catch (err) {
      avisarErro(err);
    } finally {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
  }

  // ---------- Login e acesso ----------

  function telaLogin() {
    document.body.classList.add("sem-barra");
    app.innerHTML = `
      <div class="login">
        <img src="icon.svg" alt="">
        <h1>${esc(NOME)}</h1>
        <div class="sub">Controle da oficina</div>
        <form id="login">
          <label for="email">E-mail</label>
          <input id="email" name="email" type="email" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required>
          <label for="senha">Senha</label>
          <input id="senha" name="senha" type="password" autocomplete="current-password" required>
          <div class="botoes" style="margin-top:24px"><button class="btn grande amarelo" type="submit">Entrar</button></div>
          <div class="erro" id="erro"></div>
        </form>
      </div>`;
    const f = document.getElementById("login");
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const botao = f.querySelector("button");
      botao.disabled = true;
      const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim().toLowerCase(), password: f.senha.value });
      botao.disabled = false;
      if (error) {
        const msg = /invalid login/i.test(error.message) ? "E-mail ou senha incorretos."
          : /not confirmed/i.test(error.message) ? "Este e-mail ainda não foi confirmado no Supabase."
          : "Não foi possível entrar.";
        document.getElementById("erro").textContent = msg + " (" + error.message + ")";
        return;
      }
      acessoOk = null;
      render();
    });
  }

  function telaSemAcesso(email) {
    document.body.classList.add("sem-barra");
    app.innerHTML = `
      <div class="login">
        <img src="icon.svg" alt="">
        <h1>Sem acesso aos dados</h1>
        <p>O e-mail <b>${esc(email)}</b> entrou, mas não está liberado na lista da equipe.</p>
        <p class="sub">Peça para quem cuida do sistema adicionar este e-mail na tabela <b>equipe</b> do Supabase.</p>
        <div class="botoes"><button class="btn claro" id="sair">Sair e entrar com outro e-mail</button></div>
      </div>`;
    ligarRodape();
  }

  const rodape = () =>
    MODO_TESTE ? "" : `<div class="rodape"><button id="sair">Sair da conta</button></div>`;
  function ligarRodape() {
    const b = document.getElementById("sair");
    if (b) b.addEventListener("click", async () => {
      await sb.auth.signOut();
      servicos = null;
      acessoOk = null;
      location.hash = "#/";
      render();
    });
  }

  function avisarErro(err) {
    console.error(err);
    const m = String((err && err.message) || err);
    alert("Não foi possível salvar. Verifique a internet e tente de novo.\n\n" + m);
  }

  async function tentar(fn) {
    try { await fn(); } catch (err) { avisarErro(err); }
  }

  // ---------- Navegação ----------

  let acessoOk = null;

  function marcarAba(rota) {
    const aba = { "": "inicio", buscar: "buscar", novo: "novo", resumo: "resumo", revisoes: "resumo" }[rota] || "";
    document.querySelectorAll(".barra a").forEach((a) => a.classList.toggle("ativa", a.dataset.aba === aba));
  }

  async function render(manterRolagem) {
    if (!manterRolagem) window.scrollTo(0, 0);
    if (!MODO_TESTE) {
      const { data } = await sb.auth.getSession();
      if (!data.session) return telaLogin();
      if (acessoOk === null) {
        try { acessoOk = await banco.temAcesso(); } catch { acessoOk = true; } // na dúvida, segue
      }
      if (!acessoOk) return telaSemAcesso(data.session.user.email);
    }
    document.body.classList.remove("sem-barra");
    const partes = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    marcarAba(partes[0]);
    app.style.animation = "none"; void app.offsetWidth; app.style.animation = "";
    try {
      switch (partes[0]) {
        case "novo": return await telaFormulario(null, partes[1]);
        case "editar": return await telaFormulario(partes[1]);
        case "servico": return await telaServico(partes[1]);
        case "buscar": return await telaBusca(partes[1] || "");
        case "resumo": return await telaResumo(partes[1]);
        case "revisoes": return await telaRevisoes();
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
  window.addEventListener("hashchange", () => render());
  // Ao voltar para o app (ex.: depois de mandar WhatsApp), busca dados novos.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !servicos) return;
    if (/^#\/(novo|editar)/.test(location.hash)) return; // não apagar formulário em edição
    servicos = null;
    render(true);
  });
  render();
})();
