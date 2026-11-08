// Funções usadas por todas as páginas.
"use strict";

const Sopao = (() => {
  class ErroApi extends Error {
    constructor(mensagem, status, campo) {
      super(mensagem);
      this.status = status;
      this.campo = campo;
    }
  }

  // Chama a API e devolve o JSON. Em erro, lança ErroApi com a mensagem do servidor.
  // corpo pode ser um objeto (vira JSON) ou um FormData (upload de arquivo).
  async function api(metodo, url, corpo, { redirecionar401 = true, timeoutMs = 15000 } = {}) {
    const opcoes = { method: metodo, headers: {}, credentials: "same-origin" };
    if (corpo instanceof FormData) {
      opcoes.body = corpo;
    } else if (corpo !== undefined) {
      opcoes.headers["Content-Type"] = "application/json";
      opcoes.body = JSON.stringify(corpo);
    }
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
      opcoes.signal = AbortSignal.timeout(timeoutMs);
    }

    let resposta;
    try {
      resposta = await fetch(url, opcoes);
    } catch (e) {
      throw new ErroApi("Sem conexão com o servidor. Tente de novo.", 0, null);
    }

    if (resposta.status === 401 && redirecionar401) {
      window.location.href = "/login";
      throw new ErroApi("Sessão expirada.", 401, null);
    }

    const texto = await resposta.text();
    let dados = null;
    if (texto) {
      try { dados = JSON.parse(texto); } catch (e) { dados = null; }
    }
    if (!resposta.ok) {
      const mensagem = (dados && dados.erro) || `Erro ${resposta.status} no servidor.`;
      throw new ErroApi(mensagem, resposta.status, dados && dados.campo);
    }
    return dados;
  }

  const formatoDinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const formatoNumero = new Intl.NumberFormat("pt-BR");

  function dinheiro(valor) {
    return formatoDinheiro.format(Number(valor) || 0);
  }

  function numero(valor) {
    return formatoNumero.format(Number(valor) || 0);
  }

  // "2026-11-08" -> "08/11/2026"
  function dataBR(iso) {
    if (!iso) return "";
    const [ano, mes, dia] = iso.slice(0, 10).split("-");
    return `${dia}/${mes}/${ano}`;
  }

  // Data de hoje no fuso do navegador, no formato AAAA-MM-DD
  function hojeISO() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Lembra o último evento escolhido (só conveniência; pode falhar em modo anônimo)
  function eventoGuardado() {
    try { return Number(localStorage.getItem("sopao_evento_id")) || null; } catch (e) { return null; }
  }
  function guardarEvento(id) {
    try { localStorage.setItem("sopao_evento_id", String(id)); } catch (e) { /* sem problema */ }
  }

  // Evento padrão: o guardado; senão o de hoje; senão o próximo; senão o mais recente.
  function eventoPadrao(eventos) {
    if (!eventos.length) return null;
    const guardado = eventos.find((e) => e.id === eventoGuardado());
    if (guardado) return guardado;
    const hoje = hojeISO();
    const deHoje = eventos.find((e) => e.data === hoje);
    if (deHoje) return deHoje;
    const futuros = eventos.filter((e) => e.data > hoje).sort((a, b) => a.data.localeCompare(b.data));
    if (futuros.length) return futuros[0];
    return eventos[0]; // a API já devolve do mais recente para o mais antigo
  }

  // Preenche um <select> com os eventos e escolhe o padrão. Devolve a lista.
  async function preencherEventos(select, { selecionado } = {}) {
    const eventos = await api("GET", "/api/eventos");
    select.replaceChildren(...eventos.map((e) => {
      const opcao = document.createElement("option");
      opcao.value = e.id;
      opcao.textContent = `${e.nome} — ${dataBR(e.data)}`;
      return opcao;
    }));
    const escolhido = selecionado ?? eventoPadrao(eventos)?.id;
    if (escolhido) select.value = String(escolhido);
    return eventos;
  }

  // Cria um elemento: el("td", { class: "num" }, "texto", outroElemento)
  // Usa textContent, então texto vindo do banco nunca vira HTML (evita XSS).
  function el(tag, atributos = {}, ...filhos) {
    const elemento = document.createElement(tag);
    for (const [nome, valor] of Object.entries(atributos)) {
      if (valor === false || valor === null || valor === undefined) continue;
      if (nome.startsWith("on")) elemento.addEventListener(nome.slice(2), valor);
      else elemento.setAttribute(nome, valor === true ? "" : valor);
    }
    for (const filho of filhos) {
      if (filho === null || filho === undefined) continue;
      elemento.append(filho instanceof Node ? filho : String(filho));
    }
    return elemento;
  }

  // Mostra o erro da API no formulário: mensagem + destaque no campo (data-campo)
  function mostrarErro(form, erro) {
    form.querySelectorAll(".invalido").forEach((c) => c.classList.remove("invalido"));
    const caixa = form.querySelector("[data-mensagem]");
    if (caixa) {
      caixa.textContent = erro.message;
      caixa.hidden = false;
    }
    if (erro.campo) {
      const campo = form.querySelector(`[data-campo="${CSS.escape(erro.campo)}"]`);
      if (campo) {
        campo.classList.add("invalido");
        campo.focus();
      }
    }
  }

  function limparErro(form) {
    form.querySelectorAll(".invalido").forEach((c) => c.classList.remove("invalido"));
    const caixa = form.querySelector("[data-mensagem]");
    if (caixa) caixa.hidden = true;
  }

  return {
    api, ErroApi, dinheiro, numero, dataBR, hojeISO,
    eventoGuardado, guardarEvento, eventoPadrao, preencherEventos,
    el, mostrarErro, limparErro,
  };
})();
