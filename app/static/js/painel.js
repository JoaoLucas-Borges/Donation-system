"use strict";

(() => {
  const { el } = Sopao;
  const select = document.getElementById("evento");
  const resumo = document.getElementById("resumo");
  const semEventos = document.getElementById("sem-eventos");

  async function carregarEventos(selecionado) {
    const eventos = await Sopao.preencherEventos(select, { selecionado });
    select.hidden = eventos.length === 0;
    botaoExcluir.hidden = eventos.length === 0;
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
    resumoAtual = { compras: compras.length, porcoes };
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

  select.addEventListener("change", () => {
    desarmarExcluir();
    carregarResumo().catch(alertar);
  });

  // ----- excluir evento, em dois cliques (sem a caixa do navegador) -----
  // O segundo clique diz o que vai sumir, para ninguém apagar um evento de verdade sem querer.
  const botaoExcluir = document.getElementById("excluir-evento");
  const avisoExcluir = document.getElementById("excluir-aviso");
  let resumoAtual = { compras: 0, porcoes: 0 };
  let armado = null;

  function desarmarExcluir() {
    clearTimeout(armado);
    armado = null;
    botaoExcluir.classList.remove("confirmar");
    botaoExcluir.firstElementChild.textContent = "Excluir evento";
  }

  function oQueSome({ compras, porcoes }) {
    const partes = [];
    if (compras) partes.push(compras === 1 ? "1 compra" : `${compras} compras`);
    if (porcoes) partes.push(porcoes === 1 ? "1 porção" : `${Sopao.numero(porcoes)} porções`);
    return partes.length ? `apaga ${partes.join(" e ")}` : "evento vazio";
  }

  botaoExcluir.addEventListener("click", async () => {
    avisoExcluir.hidden = true;
    if (!armado) {
      botaoExcluir.classList.add("confirmar");
      botaoExcluir.firstElementChild.textContent = `Confirmar exclusão (${oQueSome(resumoAtual)})`;
      armado = setTimeout(desarmarExcluir, 5000);
      return;
    }
    desarmarExcluir();
    botaoExcluir.disabled = true;
    try {
      await Sopao.api("DELETE", `/api/eventos/${select.value}`);
      await carregarEventos(); // escolhe outro evento sozinho (ou mostra "nenhum evento")
    } catch (erro) {
      avisoExcluir.textContent = `Não foi possível excluir: ${erro.message}`;
      avisoExcluir.hidden = false;
    } finally {
      botaoExcluir.disabled = false;
    }
  });

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
