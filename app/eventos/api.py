from flask import Blueprint, request

from app import validacao as v
from app.auth.decorators import login_required
from app.db import db
from app.models import Compra, Distribuicao, Evento

bp = Blueprint("eventos_api", __name__, url_prefix="/api/eventos")


def evento_para_dict(evento):
    return {
        "id": evento.id,
        "nome": evento.nome,
        "data": evento.data.isoformat(),
        "local": evento.local,
    }


@bp.get("")
@login_required
def listar():
    eventos = db.session.scalars(
        db.select(Evento).order_by(Evento.data.desc(), Evento.id.desc())
    ).all()
    return [evento_para_dict(e) for e in eventos]


@bp.post("")
@login_required
def criar():
    dados = v.json_obrigatorio(request)
    evento = Evento(
        nome=v.texto(dados, "nome", obrigatorio=True),
        data=v.data_iso(dados, "data"),
        local=v.texto(dados, "local"),
    )
    db.session.add(evento)
    db.session.commit()
    return evento_para_dict(evento), 201


@bp.delete("/<int:evento_id>")
@login_required
def remover(evento_id):
    """Apaga o evento com tudo dele: compras (itens vão junto pelo CASCADE) e porções.

    Feito para limpar eventos de teste. Não tem volta: apaga de verdade,
    ao contrário do desfazer da contagem. As fotos ficam na pasta de uploads.
    """
    evento = db.get_or_404(Evento, evento_id)
    porcoes = db.session.execute(
        db.delete(Distribuicao).where(Distribuicao.evento_id == evento_id)
    ).rowcount
    compras = db.session.execute(
        db.delete(Compra).where(Compra.evento_id == evento_id)
    ).rowcount
    db.session.delete(evento)
    db.session.commit()  # tudo numa transação: ou apaga tudo, ou nada
    return {"compras_apagadas": compras, "registros_contagem_apagados": porcoes}
