from flask import Blueprint, render_template

from app.auth.decorators import login_required
from app.db import db
from app.models import Evento

bp = Blueprint("distribuicao", __name__)


@bp.get("/contagem/<int:evento_id>")
@login_required
def contagem(evento_id):
    evento = db.get_or_404(Evento, evento_id)
    return render_template("contagem.html", evento=evento)
