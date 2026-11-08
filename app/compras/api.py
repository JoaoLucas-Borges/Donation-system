from flask import Blueprint, request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app import validacao as v
from app.auth.decorators import login_required, operador_atual_id
from app.db import db
from app.models import Compra, Evento, ItemCompra

bp = Blueprint("compras_api", __name__, url_prefix="/api/compras")

UNIDADES = {"kg", "un", "l", "pct"}
ORIGENS = {"manual", "qr", "ia"}


# ---------- conversão para JSON ----------

def item_para_dict(item):
    return {
        "id": item.id,
        "descricao": item.descricao,
        "categoria": item.categoria,
        "quantidade": float(item.quantidade),
        "unidade": item.unidade,
        "valor_unitario": float(item.valor_unitario),
        "valor_total": float(item.valor_total),
    }


def compra_para_dict(compra, com_itens=False):
    soma_itens = sum(i.valor_total for i in compra.itens)
    dados = {
        "id": compra.id,
        "evento_id": compra.evento_id,
        "operador_id": compra.operador_id,
        "data_compra": compra.data_compra.isoformat(),
        "fornecedor": compra.fornecedor,
        "cnpj_emitente": compra.cnpj_emitente,
        "numero_nota": compra.numero_nota,
        "chave_acesso": compra.chave_acesso,
        "valor_total": float(compra.valor_total),
        "soma_itens": float(soma_itens),
        # Mesma conferência que a vw_conferencia_notas fará para o Power BI
        "diferenca": float(compra.valor_total - soma_itens),
        "foto_path": compra.foto_path,
        "origem_dados": compra.origem_dados,
        "criado_em": compra.criado_em.isoformat(),
    }
    if com_itens:
        dados["itens"] = [item_para_dict(i) for i in compra.itens]
    return dados


# ---------- leitura do JSON recebido ----------

def ler_campos_compra(dados):
    evento_id = v.inteiro(dados, "evento_id")
    if db.session.get(Evento, evento_id) is None:
        raise v.ErroValidacao("evento_id", "Evento não encontrado.")
    return {
        "evento_id": evento_id,
        "data_compra": v.data_iso(dados, "data_compra"),
        "fornecedor": v.texto(dados, "fornecedor"),
        "cnpj_emitente": v.digitos(dados, "cnpj_emitente", 14),
        "numero_nota": v.texto(dados, "numero_nota", max_len=20),
        "chave_acesso": v.digitos(dados, "chave_acesso", 44),
        "valor_total": v.numero(dados, "valor_total", casas=2, minimo=0),
        "foto_path": v.texto(dados, "foto_path", max_len=300),
        "origem_dados": v.opcao(dados, "origem_dados", ORIGENS, padrao="manual"),
    }


def ler_itens(dados):
    itens = dados.get("itens")
    if not isinstance(itens, list) or not itens:
        raise v.ErroValidacao("itens", "Informe pelo menos um item.")

    novos = []
    for n, item in enumerate(itens):
        if not isinstance(item, dict):
            raise v.ErroValidacao(f"itens[{n}]", "Item inválido.")
        try:
            novos.append(ItemCompra(
                descricao=v.texto(item, "descricao", obrigatorio=True),
                categoria=v.texto(item, "categoria"),
                quantidade=v.numero(item, "quantidade", casas=3, maior_que=0),
                unidade=v.opcao(item, "unidade", UNIDADES),
                valor_unitario=v.numero(item, "valor_unitario", casas=2, minimo=0),
            ))
        except v.ErroValidacao as erro:
            # Diz em qual linha está o problema: "itens[2].quantidade"
            raise v.ErroValidacao(f"itens[{n}].{erro.campo}", erro.mensagem)
    return novos


def salvar(compra):
    """Faz o commit e trata a nota fiscal repetida (chave_acesso UNIQUE)."""
    try:
        db.session.commit()
    except IntegrityError as erro:
        db.session.rollback()
        if "chave_acesso" in str(erro.orig):
            raise v.ErroValidacao("chave_acesso", "Esta nota fiscal já foi cadastrada.")
        raise


# ---------- rotas ----------

@bp.get("")
@login_required
def listar():
    consulta = (
        db.select(Compra)
        .options(selectinload(Compra.itens))  # busca os itens de todas numa consulta só
        .order_by(Compra.data_compra.desc(), Compra.id.desc())
    )
    evento_id = request.args.get("evento_id", type=int)
    if evento_id is not None:
        consulta = consulta.where(Compra.evento_id == evento_id)
    return [compra_para_dict(c) for c in db.session.scalars(consulta)]


@bp.post("")
@login_required
def criar():
    dados = v.json_obrigatorio(request)
    compra = Compra(**ler_campos_compra(dados), operador_id=operador_atual_id())
    compra.itens = ler_itens(dados)
    db.session.add(compra)
    salvar(compra)
    return compra_para_dict(compra, com_itens=True), 201


@bp.get("/<int:compra_id>")
@login_required
def detalhe(compra_id):
    compra = db.get_or_404(Compra, compra_id)
    return compra_para_dict(compra, com_itens=True)


@bp.put("/<int:compra_id>")
@login_required
def editar(compra_id):
    """Substitui a compra inteira: os campos e a lista de itens.

    O operador_id continua sendo o de quem cadastrou.
    """
    compra = db.get_or_404(Compra, compra_id)
    dados = v.json_obrigatorio(request)
    for campo, valor in ler_campos_compra(dados).items():
        setattr(compra, campo, valor)
    # delete-orphan no relacionamento apaga os itens antigos sozinho
    compra.itens = ler_itens(dados)
    salvar(compra)
    return compra_para_dict(compra, com_itens=True)


@bp.delete("/<int:compra_id>")
@login_required
def remover(compra_id):
    compra = db.get_or_404(Compra, compra_id)
    db.session.delete(compra)  # os itens vão junto (ON DELETE CASCADE)
    db.session.commit()
    return "", 204
