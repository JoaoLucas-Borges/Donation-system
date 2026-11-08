"use strict";

(() => {
  const select = document.getElementById("evento");
  const form = document.getElementById("form-evento");
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
    const comDiferenca = compras.filter((c) => Math.abs(c.diferenca) >= 0.005).length;
    const porcoes = contador.total;

    document.getElementById("total-gasto").textContent = Sopao.dinheiro(gastoCentavos / 100);
    document.getElementById("porcoes").textContent = Sopao.numero(porcoes);
    document.getElementById("custo-porcao").textContent =
      porcoes > 0 ? Sopao.dinheiro(gastoCentavos / 100 / porcoes) : "—";

    const elDiferenca = document.getElementById("notas-diferenca");
    elDiferenca.textContent = `${comDiferenca} de ${compras.length}`;
    elDiferenca.classList.toggle("texto-alerta", comDiferenca > 0);
  }

  select.addEventListener("change", () => carregarResumo().catch(alertar));

  // ----- novo evento -----
  document.getElementById("abrir-novo-evento").addEventListener("click", () => {
    form.hidden = false;
    form.elements.data.value = Sopao.hojeISO();
    form.elements.nome.focus();
  });
  document.getElementById("cancelar-novo-evento").addEventListener("click", () => {
    form.reset();
    Sopao.limparErro(form);
    form.hidden = true;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    Sopao.limparErro(form);
    try {
      const evento = await Sopao.api("POST", "/api/eventos", {
        nome: form.elements.nome.value,
        data: form.elements.data.value,
        local: form.elements.local.value,
      });
      form.reset();
      form.hidden = true;
      Sopao.guardarEvento(evento.id);
      await carregarEventos(evento.id);
    } catch (erro) {
      Sopao.mostrarErro(form, erro);
    }
  });

  function alertar(erro) {
    semEventos.hidden = false;
    semEventos.textContent = `Não foi possível carregar: ${erro.message}`;
  }

  carregarEventos().catch(alertar);
})();
