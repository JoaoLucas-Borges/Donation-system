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
      window.location.href = `/login?proxima=${encodeURIComponent(location.pathname)}`;
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

  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  // "2026-11-09" -> "09 nov"
  function dataCurta(iso) {
    if (!iso) return "";
    const [, mes, dia] = iso.slice(0, 10).split("-");
    return `${dia} ${MESES[Number(mes) - 1].slice(0, 3)}`;
  }

  // "2026-11-09" -> "09 de novembro de 2026"
  function dataExtenso(iso) {
    if (!iso) return "";
    const [ano, mes, dia] = iso.slice(0, 10).split("-");
    return `${dia} de ${MESES[Number(mes) - 1]} de ${ano}`;
  }

  // Contagem com dois dígitos, no estilo editorial: 6 -> "06"
  const doisDigitos = (n) => String(n).padStart(2, "0");

  // Anima um número subindo até o valor final. formatar(n) devolve o texto.
  // Em "menos movimento" escreve o valor direto.
  const reduzirMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  function animarNumero(elemento, valorFinal, formatar, duracaoMs = 1100) {
    cancelAnimationFrame(elemento._animacao);
    if (reduzirMovimento || !Number.isFinite(valorFinal)) {
      elemento.textContent = formatar(valorFinal);
      return;
    }
    const inicio = performance.now();
    const passo = (agora) => {
      const t = Math.min(1, (agora - inicio) / duracaoMs);
      const suave = 1 - Math.pow(2, -10 * t); // desacelera no fim
      elemento.textContent = formatar(t === 1 ? valorFinal : valorFinal * suave);
      if (t < 1) elemento._animacao = requestAnimationFrame(passo);
    };
    elemento._animacao = requestAnimationFrame(passo);
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
    ligarMenuContagem();
  }

  // O item "Contagem" do menu abre a contagem do último evento escolhido
  function ligarMenuContagem() {
    const link = document.querySelector("[data-menu-contagem]");
    const id = eventoGuardado();
    if (link && id) link.href = `/contagem/${id}`;
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

  // Liga o formulário de templates/_novo_evento.html.
  // aoCriar(evento) roda depois que o evento é salvo (ex.: recarregar o <select>).
  // Devolve abrir(dica), para a página abrir o formulário sozinha quando não há evento.
  function ligarNovoEvento({ botaoAbrir, aoCriar }) {
    const form = document.getElementById("form-evento");
    const dica = form.querySelector("[data-dica]");
    const botaoCriar = form.querySelector('[type="submit"]');

    function abrir(texto) {
      form.hidden = false;
      dica.textContent = texto || "";
      dica.hidden = !texto;
      if (!form.elements.data.value) form.elements.data.value = hojeISO();
      form.elements.nome.focus();
    }

    function fechar() {
      form.reset();
      limparErro(form);
      form.hidden = true;
    }

    if (botaoAbrir) botaoAbrir.addEventListener("click", () => abrir());
    form.querySelector("[data-cancelar]").addEventListener("click", fechar);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      limparErro(form);
      botaoCriar.disabled = true;
      try {
        const evento = await api("POST", "/api/eventos", {
          nome: form.elements.nome.value,
          data: form.elements.data.value,
          local: form.elements.local.value,
        });
        fechar();
        guardarEvento(evento.id);
        await aoCriar(evento);
      } catch (erro) {
        form.hidden = false;
        mostrarErro(form, erro);
      } finally {
        botaoCriar.disabled = false;
      }
    });

    return { abrir, fechar };
  }

  ligarMenuContagem();

  return {
    api, ErroApi, dinheiro, numero, dataBR, dataCurta, dataExtenso, doisDigitos, animarNumero, hojeISO,
    eventoGuardado, guardarEvento, eventoPadrao, preencherEventos, ligarNovoEvento,
    el, mostrarErro, limparErro,
  };
})();
