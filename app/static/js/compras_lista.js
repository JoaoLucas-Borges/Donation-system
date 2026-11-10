"use strict";

(() => {
  const { el } = Sopao;
  const $ = (id) => document.getElementById(id);
  const select = $("evento");
  const linhas = $("linhas");
  const carregando = $("carregando");
  const vazio = $("vazio");
  const grade = $("tabela-wrap");
  const kpis = $("kpis");
  const busca = $("busca");
  const detalhe = $("detalhe");

  let compras = [];       // compras do evento escolhido
  let selecionada = null; // id da compra aberta no painel da direita

  // Aviso vindo do formulário (?salva=1)
  const parametros = new URLSearchParams(location.search);
  if (parametros.has("salva")) {
    const aviso = $("aviso");
    aviso.textContent = "Compra salva.";
    aviso.hidden = false;
    history.replaceState(null, "", location.pathname);
  }

  const centavos = (lista) => lista.reduce((s, c) => s + Math.round(c.valor_total * 100), 0);

  async function carregar() {
    const eventoId = Number(select.value);
    Sopao.guardarEvento(eventoId);
    carregando.hidden = false;
    const [lista, contador] = await Promise.all([
      Sopao.api("GET", `/api/compras?evento_id=${eventoId}`),
      Sopao.api("GET", `/api/eventos/${eventoId}/contador`),
    ]);
    carregando.hidden = true;
    compras = lista;

    resumir(contador.total);
    vazio.hidden = compras.length > 0;
    grade.hidden = compras.length === 0;
    desenhar();

    const aindaExiste = compras.some((c) => c.id === selecionada);
    selecionar(aindaExiste ? selecionada : compras[0]?.id ?? null);
  }

  // ---------- números do topo ----------
  function resumir(porcoes) {
    const total = centavos(compras);
    const comFoto = compras.filter((c) => c.foto_path).length;
    const qtd = compras.length;

    Sopao.animarNumero($("kpi-total"), total / 100, Sopao.dinheiro);
    Sopao.animarNumero($("kpi-qtd"), qtd, (n) => Sopao.doisDigitos(Math.round(n)));
    $("kpi-notas").replaceChildren(
      Sopao.doisDigitos(comFoto), el("small", {}, " de "), Sopao.doisDigitos(qtd),
    );
    if (porcoes > 0 && total > 0) Sopao.animarNumero($("kpi-custo"), total / 100 / porcoes, Sopao.dinheiro);
    else $("kpi-custo").textContent = "—";

    // período: da compra mais antiga à mais recente
    const datas = compras.map((c) => c.data_compra).sort();
    const periodo = $("periodo");
    if (!datas.length) periodo.textContent = "";
    else {
      const [primeira, ultima] = [datas[0], datas[datas.length - 1]];
      const ano = ultima.slice(0, 4);
      periodo.textContent = primeira === ultima
        ? `${Sopao.dataCurta(primeira)} ${ano}`
        : `${Sopao.dataCurta(primeira)} – ${Sopao.dataCurta(ultima)} ${ano}`;
    }
  }

  // ---------- tabela ----------
  function filtradas() {
    const termo = busca.value.trim().toLowerCase();
    if (!termo) return compras;
    return compras.filter((c) =>
      `${c.fornecedor ?? ""} ${c.numero_nota ?? ""}`.toLowerCase().includes(termo));
  }

  function desenhar() {
    const lista = filtradas();
    if (lista.length) linhas.replaceChildren(...lista.map(linha));
    else linhas.replaceChildren(el("tr", { class: "nada" }, el("td", { colspan: 5 }, `Nada encontrado para “${busca.value.trim()}”.`)));

    $("soma-total").textContent = Sopao.dinheiro(centavos(lista) / 100);
    const semFoto = lista.filter((c) => !c.foto_path).length;
    $("sem-comprovante").textContent =
      semFoto === 0 ? "Todas com comprovante" :
      semFoto === 1 ? "1 compra sem comprovante" : `${semFoto} compras sem comprovante`;
  }

  const ICONE_CLIPE = () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "clipe");
    svg.setAttribute("aria-label", "Com foto da nota");
    const caminho = document.createElementNS("http://www.w3.org/2000/svg", "path");
    caminho.setAttribute("d", "M20 11.5l-7.8 7.8a5 5 0 01-7.1-7.1l8.5-8.5a3.4 3.4 0 014.8 4.8l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8");
    svg.append(caminho);
    return svg;
  };

  function linha(compra, i) {
    const vazioTexto = () => el("span", { class: "suave" }, "—");
    return el("tr", {
      "data-id": compra.id,
      tabindex: 0,
      style: `--i:${Math.min(i, 14)}`,
      "aria-selected": compra.id === selecionada ? "true" : "false",
      onclick: () => selecionar(compra.id),
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selecionar(compra.id); }
        if (e.key === "ArrowDown") e.currentTarget.nextElementSibling?.focus();
        if (e.key === "ArrowUp") e.currentTarget.previousElementSibling?.focus();
      },
    },
      el("td", {}, Sopao.dataCurta(compra.data_compra)),
      el("td", {}, compra.fornecedor || vazioTexto()),
      el("td", {}, compra.numero_nota || vazioTexto()),
      el("td", { class: "num" }, Sopao.dinheiro(compra.valor_total)),
      el("td", { class: "centro" }, compra.foto_path ? ICONE_CLIPE() : vazioTexto()),
    );
  }

  busca.addEventListener("input", desenhar);

  // ---------- painel da compra selecionada ----------
  let pedido = 0; // ignora respostas antigas se a pessoa clicar rápido em várias linhas

  async function selecionar(id) {
    selecionada = id;
    for (const tr of linhas.children) {
      tr.setAttribute("aria-selected", Number(tr.dataset.id) === id ? "true" : "false");
    }
    desarmarApagar();
    $("det-erro").hidden = true;
    if (!id) { detalhe.hidden = true; return; }

    const meu = ++pedido;
    detalhe.hidden = false;
    detalhe.classList.add("carregando-detalhe");
    try {
      const compra = await Sopao.api("GET", `/api/compras/${id}`);
      if (meu !== pedido) return;
      preencherDetalhe(compra);
    } catch (erro) {
      if (meu !== pedido) return;
      $("det-erro").textContent = `Não foi possível abrir a compra: ${erro.message}`;
      $("det-erro").hidden = false;
    } finally {
      if (meu === pedido) detalhe.classList.remove("carregando-detalhe");
    }
  }

  const formatarCnpj = (c) => c && c.length === 14
    ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
    : c || "—";

  function preencherDetalhe(compra) {
    $("det-fornecedor").textContent = compra.fornecedor || "Sem fornecedor";
    $("det-data").textContent = Sopao.dataExtenso(compra.data_compra);
    $("det-nota").textContent = compra.numero_nota ? `Nº ${compra.numero_nota}` : "—";
    $("det-cnpj").textContent = formatarCnpj(compra.cnpj_emitente);

    $("det-itens").replaceChildren(...compra.itens.map((item) => el("tr", {},
      el("td", {}, item.descricao),
      el("td", { class: "num" }, `${Sopao.numero(item.quantidade)} ${item.unidade}`),
      el("td", { class: "num" }, Sopao.dinheiro(item.valor_total)),
    )));
    if (!compra.itens.length) {
      $("det-itens").replaceChildren(el("tr", {}, el("td", { colspan: 3, class: "suave" }, "Sem itens.")));
    }

    $("det-total").textContent = Sopao.dinheiro(compra.valor_total);
    const diferenca = $("det-diferenca");
    diferenca.hidden = Math.abs(compra.diferenca) < 0.005;
    diferenca.textContent = `Atenção: a nota soma ${Sopao.dinheiro(compra.soma_itens)} nos itens, ` +
      `diferença de ${Sopao.dinheiro(compra.diferenca)}.`;

    const comprovante = $("det-comprovante");
    const verNota = $("det-ver-nota");
    comprovante.textContent = compra.foto_path ? "Comprovante anexado" : "Sem comprovante";
    comprovante.classList.toggle("sem", !compra.foto_path);
    verNota.hidden = !compra.foto_path;
    if (compra.foto_path) verNota.href = `/notas/foto/${compra.foto_path}`;

    $("det-editar").href = `/compras/${compra.id}/editar`;

    // reinicia a animação de troca
    detalhe.classList.remove("troca");
    void detalhe.offsetWidth;
    detalhe.classList.add("troca");
  }

  // ---------- apagar em dois cliques (sem a caixa do navegador) ----------
  const botaoApagar = $("det-apagar");
  let armado = null;

  function desarmarApagar() {
    clearTimeout(armado);
    armado = null;
    botaoApagar.classList.remove("confirmar");
    botaoApagar.firstElementChild.textContent = "Apagar";
  }

  botaoApagar.addEventListener("click", async () => {
    if (!armado) {
      botaoApagar.classList.add("confirmar");
      botaoApagar.firstElementChild.textContent = "Clique de novo para apagar";
      armado = setTimeout(desarmarApagar, 4000);
      return;
    }
    desarmarApagar();
    botaoApagar.disabled = true;
    try {
      await Sopao.api("DELETE", `/api/compras/${selecionada}`);
      selecionada = null;
      await carregar();
    } catch (erro) {
      $("det-erro").textContent = `Não foi possível apagar: ${erro.message}`;
      $("det-erro").hidden = false;
    } finally {
      botaoApagar.disabled = false;
    }
  });

  // ---------- eventos ----------
  function falhou(erro) {
    carregando.hidden = true;
    vazio.hidden = false;
    vazio.textContent = `Não foi possível carregar: ${erro.message}`;
  }

  select.addEventListener("change", () => { selecionada = null; carregar().catch(falhou); });

  async function carregarEventos(selecionado) {
    const eventos = await Sopao.preencherEventos(select, { selecionado });
    select.hidden = eventos.length === 0;
    kpis.hidden = eventos.length === 0;
    if (!eventos.length) {
      carregando.hidden = true;
      grade.hidden = true;
      vazio.hidden = false;
      vazio.textContent = "Nenhum evento cadastrado ainda. Crie o primeiro acima.";
      novoEvento.abrir();
      return;
    }
    vazio.textContent = "Nenhuma compra neste evento ainda.";
    await carregar();
  }

  const novoEvento = Sopao.ligarNovoEvento({
    botaoAbrir: $("abrir-novo-evento"),
    aoCriar: (evento) => carregarEventos(evento.id),
  });

  carregarEventos().catch(falhou);
})();
