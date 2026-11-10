"use strict";

(() => {
  const form = document.getElementById("form-compra");
  const compraId = form.dataset.compraId ? Number(form.dataset.compraId) : null;
  const listaItens = document.getElementById("itens");
  const modelo = document.getElementById("modelo-item");
  const botaoSalvar = document.getElementById("salvar");
  const campo = (nome) => form.elements[nome];

  // ---------- números ----------
  // Aceita "1.234,56", "1234,56" e "1234.56". Devolve o texto normalizado
  // ("1234.56") que a API entende, ou null se não for um número.
  function normalizar(texto) {
    let t = String(texto ?? "").trim().replace(/\s|R\$/g, "");
    if (!t) return null;
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    return /^\d+(\.\d+)?$/.test(t) ? t : null;
  }

  // "4.5" com 2 casas -> 450 (inteiro). Arredonda a última casa para cima a partir de 5.
  function paraInteiro(texto, casas) {
    const t = normalizar(texto);
    if (t === null) return null;
    const [inteira, decimal = ""] = t.split(".");
    const cortada = (decimal + "0".repeat(casas)).slice(0, casas);
    let valor = Number(inteira) * 10 ** casas + Number(cortada || 0);
    if (Number(decimal[casas] || 0) >= 5) valor += 1;
    return valor;
  }

  // Igual ao round(quantidade * valor_unitario, 2) do banco, sem erro de float:
  // quantidade em milésimos x valor em centavos = centavos x 1000
  function totalItemCentavos(quantidade, valorUnitario) {
    const qtd = paraInteiro(quantidade, 3);
    const unit = paraInteiro(valorUnitario, 2);
    if (qtd === null || unit === null) return null;
    return Math.floor((qtd * unit + 500) / 1000);
  }

  // 4.5 -> "4,50"; 1.5 (quantidade) -> "1,5"
  const paraCampo = (n, casasFixas) =>
    (casasFixas ? Number(n).toFixed(casasFixas) : String(Number(n))).replace(".", ",");

  // ---------- itens ----------
  function adicionarItem(item = {}, focar = false) {
    const linha = modelo.content.firstElementChild.cloneNode(true);
    const entrada = (nome) => linha.querySelector(`[data-item="${nome}"]`);
    entrada("descricao").value = item.descricao ?? "";
    // A categoria saiu da tela, mas compras antigas podem ter: guarda para não apagar ao editar
    if (item.categoria) linha.dataset.categoria = item.categoria;
    entrada("quantidade").value = item.quantidade != null ? paraCampo(item.quantidade) : "";
    entrada("unidade").value = item.unidade ?? "kg";
    entrada("valor_unitario").value = item.valor_unitario != null ? paraCampo(item.valor_unitario, 2) : "";
    listaItens.append(linha);
    renumerar();
    recalcular();
    if (focar) entrada("descricao").focus();
  }

  // data-campo="itens[2].quantidade" deixa o Sopao.mostrarErro achar o campo
  // que a API apontou como errado
  function renumerar() {
    [...listaItens.children].forEach((linha, i) => {
      linha.querySelectorAll("[data-item]").forEach((entrada) => {
        entrada.dataset.campo = `itens[${i}].${entrada.dataset.item}`;
      });
    });
  }

  function linhaVazia(linha) {
    return ["descricao", "quantidade", "valor_unitario"]
      .every((nome) => !linha.querySelector(`[data-item="${nome}"]`).value.trim());
  }

  // Soma dos itens em centavos. É também o valor total da compra.
  let somaCentavos = 0;

  function recalcular() {
    let soma = 0;
    for (const linha of listaItens.children) {
      const total = totalItemCentavos(
        linha.querySelector('[data-item="quantidade"]').value,
        linha.querySelector('[data-item="valor_unitario"]').value,
      );
      linha.querySelector(".item-total").textContent = total === null ? "—" : Sopao.dinheiro(total / 100);
      soma += total ?? 0;
    }
    somaCentavos = soma;
    document.getElementById("soma-itens").textContent = Sopao.dinheiro(soma / 100);
    const preenchidos = [...listaItens.children].filter((linha) => !linhaVazia(linha)).length;
    document.getElementById("qtd-itens").textContent = preenchidos === 1 ? "1 item" : `${preenchidos} itens`;
  }

  // 12345 centavos -> "123.45" (sem passar por float)
  const centavosParaTexto = (c) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;

  listaItens.addEventListener("input", recalcular);

  listaItens.addEventListener("click", (e) => {
    const botao = e.target.closest("[data-remover]");
    if (!botao) return;
    botao.closest(".item-linha").remove();
    if (!listaItens.children.length) adicionarItem();
    renumerar();
    recalcular();
  });

  // Enter num item vai para a próxima linha (ou cria uma), em vez de enviar o formulário
  listaItens.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target.tagName === "BUTTON") return;
    e.preventDefault();
    const linha = e.target.closest(".item-linha");
    const proxima = linha.nextElementSibling;
    if (proxima) proxima.querySelector('[data-item="descricao"]').focus();
    else adicionarItem({}, true);
  });

  document.getElementById("adicionar-item").addEventListener("click", () => adicionarItem({}, true));

  // ---------- foto ----------
  const arquivo = document.getElementById("foto-arquivo");
  const previa = document.getElementById("foto-previa");
  const status = document.getElementById("foto-status");
  const remover = document.getElementById("foto-remover");

  const lerIA = document.getElementById("ler-ia");
  const avisoIA = document.getElementById("aviso-ia");

  function mostrarFoto(src, texto) {
    previa.src = src;
    previa.hidden = !src;
    remover.hidden = !src;
    status.textContent = texto;
    // Só dá para ler com IA uma foto que já está salva no servidor
    lerIA.hidden = !src || !campo("foto_path").value;
    if (!src) avisoIA.hidden = true;
  }

  arquivo.addEventListener("change", () => enviarFoto(arquivo.files[0]));

  // Arrastar a imagem do computador para a área tracejada
  const soltar = document.querySelector(".soltar");
  ["dragenter", "dragover"].forEach((tipo) => soltar.addEventListener(tipo, (e) => {
    e.preventDefault();
    soltar.classList.add("arrastando");
  }));
  ["dragleave", "drop"].forEach((tipo) => soltar.addEventListener(tipo, () => soltar.classList.remove("arrastando")));
  soltar.addEventListener("drop", (e) => {
    e.preventDefault();
    const escolhido = e.dataTransfer.files[0];
    if (escolhido && !/^image\/(jpeg|png|webp)$/.test(escolhido.type)) {
      status.textContent = "Use uma imagem JPG, PNG ou WebP.";
      return;
    }
    enviarFoto(escolhido);
  });

  async function enviarFoto(escolhido) {
    if (!escolhido) return;
    if (escolhido.size > 10 * 1024 * 1024) {
      status.textContent = "Foto maior que 10 MB. Tire outra com menos resolução.";
      arquivo.value = "";
      return;
    }
    mostrarFoto(URL.createObjectURL(escolhido), "Enviando foto…");
    lerIA.hidden = true; // até a foto nova chegar ao servidor
    botaoSalvar.disabled = true;
    try {
      const dados = new FormData();
      dados.append("foto", escolhido);
      const resposta = await Sopao.api("POST", "/api/notas/upload", dados, { timeoutMs: 60000 });
      campo("foto_path").value = resposta.foto_path;
      status.textContent = "Foto enviada ✓";
      lerIA.hidden = false;
      avisoIA.hidden = true;
    } catch (erro) {
      campo("foto_path").value = "";
      mostrarFoto("", `Não foi possível enviar a foto: ${erro.message}`);
    } finally {
      botaoSalvar.disabled = false;
      arquivo.value = "";
    }
  }

  remover.addEventListener("click", () => {
    campo("foto_path").value = "";
    mostrarFoto("", "Nenhuma foto.");
  });

  // ---------- leitura da nota com IA ----------
  // A IA só preenche o formulário. Nada é salvo até a pessoa revisar e clicar em Salvar.
  function marcarIA(entrada) {
    entrada.classList.add("pela-ia");
  }

  function preencherComIA(nota) {
    const cabecalho = ["data_compra", "fornecedor", "cnpj_emitente", "numero_nota", "chave_acesso"];
    for (const nome of cabecalho) {
      if (nota[nome] == null || nota[nome] === "") continue;
      campo(nome).value = nota[nome];
      marcarIA(campo(nome));
    }
    if (nota.cnpj_emitente || nota.numero_nota || nota.chave_acesso) {
      form.querySelector(".detalhes-nota").open = true;
    }

    // Tira linhas vazias e as que uma leitura anterior criou (clicar duas vezes não duplica)
    for (const linha of [...listaItens.children]) {
      if (linha.dataset.ia || linhaVazia(linha)) linha.remove();
    }
    for (const item of nota.itens || []) {
      adicionarItem(item);
      const linha = listaItens.lastElementChild;
      linha.dataset.ia = "1";
      linha.querySelectorAll("[data-item]").forEach(marcarIA);
    }
    if (!listaItens.children.length) adicionarItem();
    renumerar();
    recalcular();

    campo("origem_dados").value = "ia";
    mostrarConferencia(nota);
  }

  // Compara o total impresso na nota com a soma dos itens lidos
  function mostrarConferencia(nota) {
    const qtd = (nota.itens || []).length;
    const lidos = qtd === 1 ? "1 item lido" : `${qtd} itens lidos`;
    let texto;
    let diferenca = false;
    if (!qtd) {
      texto = "A IA não encontrou itens na foto. Preencha à mão ou tente uma foto mais nítida.";
      diferenca = true;
    } else if (nota.valor_total == null) {
      texto = `${lidos}. Não deu para ler o total da nota: confira a soma com o papel.`;
    } else {
      const totalNota = Math.round(Number(nota.valor_total) * 100);
      if (totalNota === somaCentavos) {
        texto = `${lidos}. A soma confere com o total da nota (${Sopao.dinheiro(totalNota / 100)}).`;
      } else {
        texto = `${lidos}. Total da nota: ${Sopao.dinheiro(totalNota / 100)}; soma dos itens: ` +
          `${Sopao.dinheiro(somaCentavos / 100)}. Confira os itens antes de salvar.`;
        diferenca = true;
      }
    }
    avisoIA.textContent = `${texto} Os campos destacados vieram da IA: revise antes de salvar.`;
    avisoIA.classList.toggle("diferenca", diferenca);
    avisoIA.hidden = false;
  }

  lerIA.addEventListener("click", async () => {
    const rotulo = lerIA.querySelector("span");
    lerIA.disabled = true;
    botaoSalvar.disabled = true;
    lerIA.setAttribute("aria-busy", "true");
    rotulo.textContent = "Lendo a nota…";
    avisoIA.hidden = true;
    Sopao.limparErro(form);
    try {
      const nota = await Sopao.api("POST", "/api/notas/extrair",
        { foto_path: campo("foto_path").value }, { timeoutMs: 120000 });
      preencherComIA(nota);
      rotulo.textContent = "Ler de novo";
    } catch (erro) {
      avisoIA.textContent = `Não foi possível ler a nota: ${erro.message} Preencha à mão.`;
      avisoIA.classList.add("diferenca");
      avisoIA.hidden = false;
      rotulo.textContent = "Tentar de novo";
    } finally {
      lerIA.disabled = false;
      botaoSalvar.disabled = false;
      lerIA.removeAttribute("aria-busy");
    }
  });

  // ---------- salvar ----------
  function montarCompra() {
    // Tira linhas totalmente vazias (deixa uma, para a API avisar que falta item)
    for (const linha of [...listaItens.children]) {
      if (linhaVazia(linha) && listaItens.children.length > 1) linha.remove();
    }
    renumerar();

    const texto = (nome) => campo(nome).value.trim() || null;
    return {
      evento_id: Number(campo("evento_id").value) || null,
      data_compra: campo("data_compra").value,
      fornecedor: texto("fornecedor"),
      cnpj_emitente: texto("cnpj_emitente"),
      numero_nota: texto("numero_nota"),
      chave_acesso: texto("chave_acesso"),
      // O total da compra é a soma dos itens (mesma conta do banco)
      valor_total: centavosParaTexto(somaCentavos),
      foto_path: texto("foto_path"),
      origem_dados: campo("origem_dados").value || "manual",
      itens: [...listaItens.children].map((linha) => {
        const valor = (nome) => linha.querySelector(`[data-item="${nome}"]`).value.trim();
        return {
          descricao: valor("descricao"),
          categoria: linha.dataset.categoria || null,
          quantidade: normalizar(valor("quantidade")) ?? valor("quantidade"),
          unidade: valor("unidade"),
          valor_unitario: normalizar(valor("valor_unitario")) ?? valor("valor_unitario"),
        };
      }),
    };
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    Sopao.limparErro(form);
    const compra = montarCompra();

    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando…";
    try {
      if (compraId) await Sopao.api("PUT", `/api/compras/${compraId}`, compra);
      else await Sopao.api("POST", "/api/compras", compra);
      Sopao.guardarEvento(compra.evento_id);
      window.location.href = "/compras?salva=1";
    } catch (erro) {
      // Os dados fiscais ficam num bloco recolhido: abre se o erro estiver lá
      if (["cnpj_emitente", "numero_nota", "chave_acesso"].includes(erro.campo)) {
        form.querySelector(".detalhes-nota").open = true;
      }
      Sopao.mostrarErro(form, erro);
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = "Salvar compra";
    }
  });

  // Mexeu no campo: deixa de ser "erro" e de ser "veio da IA" (já foi revisado)
  form.addEventListener("input", (e) => e.target.classList.remove("invalido", "pela-ia"));
  form.addEventListener("change", (e) => e.target.classList.remove("pela-ia"));

  // ---------- novo evento ----------
  const novoEvento = Sopao.ligarNovoEvento({
    botaoAbrir: document.getElementById("abrir-novo-evento"),
    aoCriar: (evento) => Sopao.preencherEventos(campo("evento_id"), { selecionado: evento.id }),
  });

  async function carregarEventos(selecionado) {
    const eventos = await Sopao.preencherEventos(campo("evento_id"), { selecionado });
    if (!eventos.length) {
      novoEvento.abrir("Ainda não há nenhum evento. Crie um aqui para registrar a compra.");
    }
  }

  // ---------- início ----------
  async function iniciar() {
    if (!compraId) {
      await carregarEventos();
      campo("data_compra").value = Sopao.hojeISO();
      adicionarItem();
      return;
    }
    const compra = await Sopao.api("GET", `/api/compras/${compraId}`);
    await carregarEventos(compra.evento_id);
    for (const nome of ["data_compra", "fornecedor", "cnpj_emitente", "numero_nota", "chave_acesso", "foto_path", "origem_dados"]) {
      campo(nome).value = compra[nome] ?? "";
    }
    if (compra.cnpj_emitente || compra.numero_nota || compra.chave_acesso) {
      form.querySelector(".detalhes-nota").open = true;
    }
    if (compra.foto_path) mostrarFoto(`/notas/foto/${compra.foto_path}`, "Foto salva.");
    compra.itens.forEach((item) => adicionarItem(item));
    if (!compra.itens.length) adicionarItem();
  }

  iniciar().catch((erro) => Sopao.mostrarErro(form, erro));
})();
