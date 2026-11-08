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
    entrada("categoria").value = item.categoria ?? "";
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
    const nota = paraInteiro(campo("valor_total").value, 2) ?? 0;
    const diferenca = nota - soma;
    document.getElementById("soma-itens").textContent = Sopao.dinheiro(soma / 100);
    document.getElementById("valor-nota").textContent = Sopao.dinheiro(nota / 100);
    const elDif = document.getElementById("diferenca");
    elDif.textContent = Sopao.dinheiro(diferenca / 100);
    document.getElementById("conferencia").classList.toggle("com-diferenca", diferenca !== 0);
  }

  listaItens.addEventListener("input", recalcular);
  campo("valor_total").addEventListener("input", recalcular);

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

  function mostrarFoto(src, texto) {
    previa.src = src;
    previa.hidden = !src;
    remover.hidden = !src;
    status.textContent = texto;
  }

  arquivo.addEventListener("change", async () => {
    const escolhido = arquivo.files[0];
    if (!escolhido) return;
    if (escolhido.size > 10 * 1024 * 1024) {
      status.textContent = "Foto maior que 10 MB. Tire outra com menos resolução.";
      arquivo.value = "";
      return;
    }
    mostrarFoto(URL.createObjectURL(escolhido), "Enviando foto…");
    botaoSalvar.disabled = true;
    try {
      const dados = new FormData();
      dados.append("foto", escolhido);
      const resposta = await Sopao.api("POST", "/api/notas/upload", dados, { timeoutMs: 60000 });
      campo("foto_path").value = resposta.foto_path;
      status.textContent = "Foto enviada ✓";
    } catch (erro) {
      campo("foto_path").value = "";
      mostrarFoto("", `Não foi possível enviar a foto: ${erro.message}`);
    } finally {
      botaoSalvar.disabled = false;
      arquivo.value = "";
    }
  });

  remover.addEventListener("click", () => {
    campo("foto_path").value = "";
    mostrarFoto("", "Nenhuma foto.");
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
      // Manda o texto normalizado; se for inválido, manda como está e a API aponta o erro
      valor_total: normalizar(campo("valor_total").value) ?? campo("valor_total").value,
      foto_path: texto("foto_path"),
      itens: [...listaItens.children].map((linha) => {
        const valor = (nome) => linha.querySelector(`[data-item="${nome}"]`).value.trim();
        return {
          descricao: valor("descricao"),
          categoria: valor("categoria") || null,
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

  form.addEventListener("input", (e) => e.target.classList.remove("invalido"));

  // ---------- início ----------
  async function iniciar() {
    if (!compraId) {
      await Sopao.preencherEventos(campo("evento_id"));
      campo("data_compra").value = Sopao.hojeISO();
      adicionarItem();
      return;
    }
    const compra = await Sopao.api("GET", `/api/compras/${compraId}`);
    await Sopao.preencherEventos(campo("evento_id"), { selecionado: compra.evento_id });
    for (const nome of ["data_compra", "fornecedor", "cnpj_emitente", "numero_nota", "chave_acesso", "foto_path"]) {
      campo(nome).value = compra[nome] ?? "";
    }
    campo("valor_total").value = paraCampo(compra.valor_total, 2);
    if (compra.cnpj_emitente || compra.numero_nota || compra.chave_acesso) {
      form.querySelector(".detalhes-nota").open = true;
    }
    if (compra.foto_path) mostrarFoto(`/notas/foto/${compra.foto_path}`, "Foto salva.");
    compra.itens.forEach((item) => adicionarItem(item));
    if (!compra.itens.length) adicionarItem();
  }

  iniciar().catch((erro) => Sopao.mostrarErro(form, erro));
})();
