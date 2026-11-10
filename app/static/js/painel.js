"use strict";

(() => {
  const { el } = Sopao;
  const select = document.getElementById("evento");
  const resumo = document.getElementById("resumo");
  const semEventos = document.getElementById("sem-eventos");

  async function carregarEventos(selecionado) {
    const eventos = await Sopao.preencherEventos(select, { selecionado });
    select.hidden = eventos.length === 0;
    semEventos.hidden = eventos.length > 0;
    resumo.hidden = eventos.length === 0;
    if (eventos.length) await carregarResumo();
  }

  async function carregarResumo() {
    const eventoId = Number(select.value);
    Sopao.guardarEvento(eventoId);
    document.getElementById("link-contagem").href = `/contagem/${eventoId}`;

    const [compras, contador] = await Promise.all([
      Sopao.api("GET", `/api/compras?evento_id=${eventoId}`),
      Sopao.api("GET", `/api/eventos/${eventoId}/contador`),
    ]);

    // Soma em centavos (inteiros) para não acumular erro de arredondamento
    const gastoCentavos = compras.reduce((soma, c) => soma + Math.round(c.valor_total * 100), 0);
    const porcoes = contador.total;
    const custo = porcoes > 0 ? gastoCentavos / 100 / porcoes : null;

    const $ = (id) => document.getElementById(id);
    Sopao.animarNumero($("total-gasto"), gastoCentavos / 100, Sopao.dinheiro);
    Sopao.animarNumero($("porcoes"), porcoes, (n) => Sopao.numero(Math.round(n)));
    if (custo === null) $("custo-porcao").textContent = "—";
    else Sopao.animarNumero($("custo-porcao"), custo, Sopao.dinheiro);
    Sopao.animarNumero($("qtd-compras"), compras.length, (n) => Sopao.doisDigitos(Math.round(n)));

    $("frase").replaceChildren(...frase(gastoCentavos / 100, porcoes, custo));
  }

  // A frase de prestação de contas, em linguagem de gente
  function frase(gasto, porcoes, custo) {
    if (porcoes > 0 && gasto > 0) {
      return [
        "Até agora, ", el("em", {}, `${Sopao.numero(porcoes)} ${porcoes === 1 ? "porção servida" : "porções servidas"}`),
        ", a ", el("em", {}, Sopao.dinheiro(custo)), " cada.",
      ];
    }
    if (porcoes > 0) return [el("em", {}, Sopao.numero(porcoes)), " porções servidas. Falta registrar as compras."];
    if (gasto > 0) return [el("em", {}, Sopao.dinheiro(gasto)), " em compras. A contagem começa no dia."];
    return ["Uma campanha nova, ", el("em", {}, "à espera"), " da primeira compra."];
  }

  select.addEventListener("change", () => carregarResumo().catch(alertar));

  // ----- novo evento -----
  Sopao.ligarNovoEvento({
    botaoAbrir: document.getElementById("abrir-novo-evento"),
    aoCriar: (evento) => carregarEventos(evento.id),
  });

  function alertar(erro) {
    semEventos.hidden = false;
    semEventos.textContent = `Não foi possível carregar: ${erro.message}`;
  }

  carregarEventos().catch(alertar);
})();
