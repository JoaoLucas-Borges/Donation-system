// Tela de contagem: a parte mais crítica do dia da campanha.
//
// Como funciona:
// 1. Cada clique (+1 ou -1) soma na tela na hora e entra numa fila no localStorage,
//    com um client_id único e a hora do clique.
// 2. A cada poucos segundos a fila é enviada ao servidor em lote.
// 3. Só saem da fila os cliques que o servidor confirmou. Clique feito durante o
//    envio continua na fila e vai no próximo lote.
// 4. Se o mesmo clique for enviado duas vezes (resposta perdida no Wi-Fi), o
//    servidor ignora a cópia pelo client_id. Então reenviar é sempre seguro.
"use strict";

(() => {
  const EVENTO_ID = Number(document.body.dataset.eventoId);
  const CHAVE_FILA = "sopao_fila_distribuicao";
  const CHAVE_TOTAL = `sopao_total_evento_${EVENTO_ID}`;
  const INTERVALO_ENVIO_MS = 3000;
  const INTERVALO_MINIMO_CLIQUE_MS = 300;
  const TAMANHO_LOTE = 200;

  const elContador = document.getElementById("contador");
  const elFeedback = document.getElementById("feedback");
  const elConexao = document.getElementById("status-conexao");
  const elPendentes = document.getElementById("status-pendentes");
  const elEnvio = document.getElementById("status-envio");

  // ---------- fila (localStorage, com plano B em memória) ----------
  let armazenamentoOk = true;
  let filaMemoria = [];

  // Sempre lê do localStorage antes de mudar, para não apagar cliques
  // de outra aba aberta no mesmo navegador.
  function lerFila() {
    if (!armazenamentoOk) return filaMemoria;
    try {
      const texto = localStorage.getItem(CHAVE_FILA);
      return texto ? JSON.parse(texto) : [];
    } catch (e) {
      ativarPlanoB();
      return filaMemoria;
    }
  }

  function gravarFila(fila) {
    if (armazenamentoOk) {
      try {
        localStorage.setItem(CHAVE_FILA, JSON.stringify(fila));
        return;
      } catch (e) {
        ativarPlanoB();
      }
    }
    filaMemoria = fila;
  }

  function ativarPlanoB() {
    if (!armazenamentoOk) return;
    armazenamentoOk = false;
    document.getElementById("aviso-armazenamento").hidden = false;
  }

  function adicionarNaFila(clique) {
    const fila = lerFila();
    fila.push(clique);
    gravarFila(fila);
  }

  function tirarDaFila(ids) {
    gravarFila(lerFila().filter((c) => !ids.has(c.client_id)));
  }

  // crypto.randomUUID só existe em HTTPS ou localhost; o plano B gera um UUID v4 igual
  function novoId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // ---------- total na tela ----------
  // Tela = último total confirmado pelo servidor + cliques deste evento ainda na fila
  let totalServidor = lerTotalGuardado();

  function lerTotalGuardado() {
    try {
      const t = localStorage.getItem(CHAVE_TOTAL);
      return t === null ? null : Number(t);
    } catch (e) {
      return null;
    }
  }

  function guardarTotal(total) {
    totalServidor = total;
    try { localStorage.setItem(CHAVE_TOTAL, String(total)); } catch (e) { /* sem problema */ }
  }

  function pendentesDoEvento() {
    return lerFila().filter((c) => c.evento_id === EVENTO_ID);
  }

  function totalNaTela() {
    return (totalServidor ?? 0) + pendentesDoEvento().reduce((s, c) => s + c.quantidade, 0);
  }

  function atualizarTela() {
    elContador.textContent = Sopao.numero(totalNaTela());
    const pendentes = lerFila().length;
    elPendentes.textContent = pendentes === 1 ? "1 clique aguardando envio" : `${pendentes} cliques aguardando envio`;
    elPendentes.classList.toggle("texto-alerta", pendentes > 0);
  }

  // ---------- cliques ----------
  let ultimoClique = 0;

  function registrar(quantidade) {
    const agora = performance.now();
    if (agora - ultimoClique < INTERVALO_MINIMO_CLIQUE_MS) return; // clique duplo sem querer
    if (quantidade === -1 && totalNaTela() <= 0) return;          // não desce de zero
    ultimoClique = agora;

    adicionarNaFila({
      client_id: novoId(),
      evento_id: EVENTO_ID,
      quantidade,
      clicado_em: new Date().toISOString(),
    });
    atualizarTela();
    mostrarFeedback(quantidade);
  }

  function mostrarFeedback(quantidade) {
    const classe = quantidade === 1 ? "mais" : "menos";
    // Remove e recoloca a classe para a animação tocar de novo a cada clique
    for (const alvo of [elContador, document.body]) {
      alvo.classList.remove("mais", "menos");
      void alvo.offsetWidth;
      alvo.classList.add(classe);
    }
    elFeedback.textContent = quantidade === 1 ? "+1" : "−1 desfeito";
  }

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();          // não rola a página nem "clica" botão em foco
      if (!e.repeat) registrar(1); // tecla segurada não conta
    } else if (e.key === "Backspace") {
      e.preventDefault();          // não volta a página no navegador
      if (!e.repeat) registrar(-1);
    }
  });

  // Botões para quem usa toque ou mouse. blur() tira o foco para o Espaço
  // não acionar o botão de novo.
  document.getElementById("mais").addEventListener("click", (e) => { e.currentTarget.blur(); registrar(1); });
  document.getElementById("menos").addEventListener("click", (e) => { e.currentTarget.blur(); registrar(-1); });

  document.getElementById("tela-cheia").addEventListener("click", (e) => {
    e.currentTarget.blur();
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });

  // ---------- envio em segundo plano ----------
  let enviando = false;

  function mostrarConexao(estado, texto) {
    elConexao.dataset.estado = estado; // online | offline | sessao
    elConexao.querySelector(".texto").textContent = texto;
  }

  async function sincronizar() {
    if (enviando) return;
    enviando = true;
    const opcoes = { redirecionar401: false, timeoutMs: 10000 };
    try {
      const lote = lerFila().slice(0, TAMANHO_LOTE);
      if (lote.length) {
        const resposta = await Sopao.api("POST", "/api/distribuicoes", lote, opcoes);
        const resolvidos = new Set([
          ...resposta.confirmados,
          ...resposta.rejeitados.map((r) => r.client_id),
        ]);
        if (resposta.rejeitados.length) console.warn("Cliques recusados pelo servidor:", resposta.rejeitados);
        tirarDaFila(resolvidos);
      }
      // Busca o total depois de enviar: assim ele já inclui o lote que acabou de sair da fila
      const contador = await Sopao.api("GET", `/api/eventos/${EVENTO_ID}/contador`, undefined, opcoes);
      guardarTotal(contador.total);
      mostrarConexao("online", "Online");
      elEnvio.textContent = `Último envio: ${new Date().toLocaleTimeString("pt-BR")}`;
      // Ainda sobrou fila (mais de um lote)? Manda o próximo já
      if (lerFila().length >= TAMANHO_LOTE) setTimeout(sincronizar, 0);
    } catch (erro) {
      if (erro.status === 401) {
        mostrarConexao("sessao", "Sessão expirada: faça login em outra aba. Os cliques estão guardados.");
      } else {
        mostrarConexao("offline", "Sem conexão: os cliques estão guardados e serão enviados depois");
      }
    } finally {
      enviando = false;
      atualizarTela();
    }
  }

  setInterval(sincronizar, INTERVALO_ENVIO_MS);
  window.addEventListener("online", sincronizar);
  // Outra aba mexeu na fila: atualiza o número
  window.addEventListener("storage", (e) => { if (e.key === CHAVE_FILA) atualizarTela(); });

  atualizarTela();
  sincronizar();
})();
