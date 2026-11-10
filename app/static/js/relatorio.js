// Página de relatório: busca /api/relatorio e desenha os gráficos em HTML puro
// (barras são <div> com largura/altura em %; sem biblioteca de gráfico).
"use strict";

(() => {
  const { el } = Sopao;
  const $ = (id) => document.getElementById(id);
  const select = $("evento");
  const carregando = $("carregando");
  const vazio = $("vazio");
  const relatorio = $("relatorio");

  async function carregar() {
    const eventoId = Number(select.value);
    Sopao.guardarEvento(eventoId);
    for (const id of ["exportar-evento", "exportar-evento-2"]) {
      $(id).href = `/api/relatorio/exportar?evento_id=${eventoId}`;
    }
    carregando.hidden = false;
    const dados = await Sopao.api("GET", `/api/relatorio?evento_id=${eventoId}`);
    carregando.hidden = true;
    relatorio.hidden = false;
    desenhar(dados);
  }

  function desenhar(d) {
    const r = d.resumo;
    Sopao.animarNumero($("r-gasto"), r.total_gasto, Sopao.dinheiro);
    Sopao.animarNumero($("r-porcoes"), r.porcoes, (n) => Sopao.numero(Math.round(n)));
    if (r.custo_por_porcao === null) $("r-custo").textContent = "—";
    else Sopao.animarNumero($("r-custo"), r.custo_por_porcao, Sopao.dinheiro);
    Sopao.animarNumero($("r-conferir"), d.notas_para_conferir.length, (n) => Sopao.doisDigitos(Math.round(n)));

    $("manchete").replaceChildren(...manchete(r));

    colunas($("g-dias"), d.gasto_por_dia.map((x) => ({
      rotulo: Sopao.dataCurta(x.dia),
      valor: x.valor,
      texto: Sopao.dinheiro(x.valor),
      dica: `${Sopao.dataExtenso(x.dia)}: ${Sopao.dinheiro(x.valor)} em ${x.compras} ${x.compras === 1 ? "compra" : "compras"}`,
    })), "Nenhuma compra registrada.");

    const variosDias = new Set(d.porcoes_por_hora.map((x) => x.hora.slice(0, 10))).size > 1;
    colunas($("g-horas"), d.porcoes_por_hora.map((x) => {
      const hora = `${x.hora.slice(11, 13)}h`;
      const rotulo = variosDias ? `${x.hora.slice(8, 10)}/${x.hora.slice(5, 7)} ${hora}` : hora;
      return { rotulo, valor: x.porcoes, texto: Sopao.numero(x.porcoes), dica: `${rotulo}: ${Sopao.numero(x.porcoes)} porções` };
    }), "Nenhuma porção contada ainda.");

    const total = r.total_gasto || 1;
    barras($("g-fornecedores"), d.gasto_por_fornecedor.map((x) => ({
      rotulo: x.fornecedor,
      detalhe: `${x.compras} ${x.compras === 1 ? "nota" : "notas"} · ${porcento(x.valor / total)}`,
      valor: x.valor,
      texto: Sopao.dinheiro(x.valor),
    })), "Nenhuma compra registrada.");

    // Porcentagem dos itens sobre a soma dos itens (pode diferir do total das notas)
    const totalItens = d.itens.reduce((s, x) => s + x.valor, 0) || 1;
    barras($("g-itens"), agruparResto(d.itens, 8).map((x) => ({
      rotulo: x.descricao,
      detalhe: x.outros ? `${x.outros} itens` : `${Sopao.numero(x.quantidade)} ${x.unidade} · ${porcento(x.valor / totalItens)}`,
      valor: x.valor,
      texto: Sopao.dinheiro(x.valor),
      resto: Boolean(x.outros),
    })), "Nenhum item registrado.");

    conferencia(d.notas_para_conferir);
  }

  const porcento = (fracao) =>
    `${(fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: fracao < .1 ? 1 : 0 })}%`;

  // A manchete: o resumo inteiro numa frase
  function manchete(r) {
    if (r.total_gasto > 0 && r.porcoes > 0) {
      return [el("em", {}, Sopao.dinheiro(r.total_gasto)), " viraram ",
        el("em", {}, `${Sopao.numero(r.porcoes)} ${r.porcoes === 1 ? "porção" : "porções"}`),
        ` — ${Sopao.dinheiro(r.custo_por_porcao)} cada.`];
    }
    if (r.total_gasto > 0) return [el("em", {}, Sopao.dinheiro(r.total_gasto)), " em compras. As porções aparecem aqui depois da contagem."];
    return ["Ainda não há compras neste evento."];
  }

  // Mostra os maiores; o resto vira uma linha "Outros" (cinza)
  function agruparResto(itens, limite) {
    if (itens.length <= limite + 1) return itens;
    const resto = itens.slice(limite);
    return [...itens.slice(0, limite), {
      descricao: "Outros",
      valor: resto.reduce((s, x) => s + x.valor, 0),
      outros: resto.length,
    }];
  }

  // ---------- gráfico de colunas (tempo) ----------
  function colunas(alvo, dados, textoVazio) {
    if (!dados.length) return alvo.replaceChildren(el("p", { class: "grafico-vazio" }, textoVazio));
    const maximo = Math.max(...dados.map((x) => x.valor), 1);
    const indiceMaximo = dados.findIndex((x) => x.valor === maximo);
    alvo.style.setProperty("--n", dados.length);
    alvo.replaceChildren(...dados.map((x, i) => el("div", {
      class: `coluna${i === indiceMaximo ? " destaque-valor" : ""}`,
      style: `--altura:${Math.max(0, x.valor / maximo)};--i:${i}`,
      "data-dica": x.dica,
      tabindex: 0,
      "aria-label": x.dica,
    },
      el("span", { class: "coluna-valor" }, x.texto),
      el("span", { class: "coluna-barra" }),
      el("span", { class: "coluna-rotulo" }, x.rotulo),
    )));
  }

  // ---------- gráfico de barras horizontais (ranking) ----------
  function barras(alvo, dados, textoVazio) {
    if (!dados.length) return alvo.replaceChildren(el("p", { class: "grafico-vazio" }, textoVazio));
    const maximo = Math.max(...dados.filter((x) => !x.resto).map((x) => x.valor), 1);
    alvo.replaceChildren(...dados.map((x, i) => el("div", {
      class: `barra${x.resto ? " resto" : ""}`,
      style: `--largura:${Math.min(1, x.valor / maximo)};--i:${i}`,
    },
      el("span", { class: "barra-rotulo" }, x.rotulo, el("small", {}, x.detalhe)),
      el("span", { class: "barra-valor" }, x.texto),
      el("span", { class: "barra-trilho" }, el("span", { class: "barra-preenchida" })),
    )));
  }

  // ---------- notas para conferir ----------
  function conferencia(notas) {
    $("conferencia-ok").hidden = notas.length > 0;
    $("conferencia-tabela").hidden = notas.length === 0;
    $("conferencia-linhas").replaceChildren(...notas.map((n) => {
      const falta = [];
      if (!n.tem_comprovante) falta.push("Foto do comprovante");
      if (Math.abs(n.diferenca) >= 0.005) falta.push(`Itens somam ${Sopao.dinheiro(n.soma_itens)}, nota diz ${Sopao.dinheiro(n.valor_total)}`);
      return el("tr", {},
        el("td", {}, Sopao.dataCurta(n.data_compra)),
        el("td", {}, n.fornecedor || el("span", { class: "suave" }, "—")),
        el("td", {}, n.numero_nota || el("span", { class: "suave" }, "—")),
        el("td", { class: "num" }, Sopao.dinheiro(n.valor_total)),
        el("td", { class: "falta" }, falta.join(" · ")),
        el("td", { class: "num" }, el("a", { class: "link-seta", href: `/compras/${n.compra_id}/editar` }, "Corrigir ", el("span", { "aria-hidden": "true" }, "→"))),
      );
    }));
  }

  // ---------- dica ao passar o mouse nas colunas ----------
  const dica = $("dica-grafico");
  function mostrarDica(alvo) {
    const texto = alvo?.dataset.dica;
    if (!texto) return esconderDica();
    dica.textContent = texto;
    dica.hidden = false;
    const caixa = alvo.querySelector(".coluna-barra").getBoundingClientRect();
    const largura = dica.offsetWidth;
    const x = Math.min(window.innerWidth - largura - 8, Math.max(8, caixa.left + caixa.width / 2 - largura / 2));
    dica.style.left = `${x}px`;
    dica.style.top = `${caixa.top - dica.offsetHeight - 10}px`;
  }
  const esconderDica = () => { dica.hidden = true; };
  document.addEventListener("pointerover", (e) => {
    const coluna = e.target.closest?.("[data-dica]");
    if (coluna) mostrarDica(coluna); else esconderDica();
  });
  document.addEventListener("focusin", (e) => mostrarDica(e.target.closest?.("[data-dica]")));
  window.addEventListener("scroll", esconderDica, { passive: true });

  // ---------- eventos ----------
  function falhou(erro) {
    carregando.hidden = true;
    vazio.hidden = false;
    vazio.textContent = `Não foi possível carregar: ${erro.message}`;
  }

  select.addEventListener("change", () => carregar().catch(falhou));

  async function iniciar() {
    const eventos = await Sopao.preencherEventos(select);
    if (!eventos.length) {
      carregando.hidden = true;
      select.hidden = true;
      vazio.hidden = false;
      vazio.textContent = "Nenhum evento cadastrado ainda. Crie o primeiro na Visão geral.";
      return;
    }
    await carregar();
  }

  iniciar().catch(falhou);
})();
