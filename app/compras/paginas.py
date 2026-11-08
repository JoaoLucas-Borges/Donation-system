from flask import Blueprint, render_template

from app.auth.decorators import login_required
from app.db import db
from app.models import Compra

bp = Blueprint("compras", __name__, url_prefix="/compras")


@bp.get("")
@login_required
def lista():
    return render_template("compras/lista.html")


@bp.get("/nova")
@login_required
def nova():
    return render_template("compras/form.html", compra_id=None)


@bp.get("/<int:compra_id>/editar")
@login_required
def editar(compra_id):
    db.get_or_404(Compra, compra_id)
    return render_template("compras/form.html", compra_id=compra_id)
