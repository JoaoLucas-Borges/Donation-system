"use strict";

(() => {
  const { el } = Sopao;
  const select = document.getElementById("evento");
  const linhas = document.getElementById("linhas");
  const carregando = document.getElementById("carregando");
  const vazio = document.getElementById("vazio");
  const tabela = document.getElementById("tabela-wrap");

  // Aviso vindo do formulário (?salva=1)
  const parametros = new URLSearchParams(location.search);
  if (parametros.has("salva")) {
    const aviso = document.getElementById("aviso");
    aviso.textContent = "Compra salva.";
    aviso.hidden = false;
    history.replaceState(null, "", location.pathname);
  }

  async function carregar() {
    const eventoId = Number(select.value);
    Sopao.guardarEvento(eventoId);
    carregando.hidden = false;
    const compras = await Sopao.api("GET", `/api/compras?evento_id=${eventoId}`);
    carregando.hidden = true;

    vazio.hidden = compras.length > 0;
    tabela.hidden = compras.length === 0;
    linhas.replaceChildren(...compras.map(linha));

    const somaNotas = compras.reduce((s, c) => s + Math.round(c.valor_total * 100), 0);
    const somaItens = compras.reduce((s, c) => s + Math.round(c.soma_itens * 100), 0);
    document.getElementById("soma-notas").textContent = Sopao.dinheiro(somaNotas / 100);
    document.getElementById("soma-itens").textContent = Sopao.dinheiro(somaItens / 100);
  }

  function linha(compra) {
    const temDiferenca = Math.abs(compra.diferenca) >= 0.005;
    const conferencia = temDiferenca
      ? el("span", { class: "selo alerta", title: "Valor da nota menos a soma dos itens" },
          `Diferença ${Sopao.dinheiro(compra.diferenca)}`)
      : el("span", { class: "selo ok" }, "Confere");

    const foto = compra.foto_path
      ? el("a", { href: `/notas/foto/${compra.foto_path}`, target: "_blank", rel: "noopener" }, "Ver")
      : el("span", { class: "suave" }, "—");

    return el("tr", {},
      el("td", {}, Sopao.dataBR(compra.data_compra)),
      el("td", {}, compra.fornecedor || el("span", { class: "suave" }, "—")),
      el("td", {}, compra.numero_nota || el("span", { class: "suave" }, "—")),
      el("td", { class: "num" }, Sopao.dinheiro(compra.valor_total)),
      el("td", { class: "num" }, Sopao.dinheiro(compra.soma_itens)),
      el("td", {}, conferencia),
      el("td", {}, foto),
      el("td", { class: "acoes" },
        el("a", { class: "botao pequeno", href: `/compras/${compra.id}/editar` }, "Editar"),
        el("button", { type: "button", class: "botao pequeno perigo", onclick: () => apagar(compra) }, "Apagar"),
      ),
    );
  }

  async function apagar(compra) {
    const descricao = `${compra.fornecedor || "sem fornecedor"} de ${Sopao.dataBR(compra.data_compra)}, ${Sopao.dinheiro(compra.valor_total)}`;
    if (!confirm(`Apagar a compra ${descricao}? Os itens também serão apagados.`)) return;
    try {
      await Sopao.api("DELETE", `/api/compras/${compra.id}`);
      await carregar();
    } catch (erro) {
      alert(`Não foi possível apagar: ${erro.message}`);
    }
  }

  function falhou(erro) {
    carregando.hidden = true;
    vazio.hidden = false;
    vazio.textContent = `Não foi possível carregar: ${erro.message}`;
  }

  select.addEventListener("change", () => carregar().catch(falhou));

  Sopao.preencherEventos(select)
    .then((eventos) => {
      if (!eventos.length) {
        carregando.hidden = true;
        vazio.hidden = false;
        vazio.textContent = "Nenhum evento cadastrado. Crie um no Painel primeiro.";
        select.hidden = true;
        return;
      }
      return carregar();
    })
    .catch(falhou);
})();
