from flask import Blueprint, render_template

from app.auth.decorators import login_required

bp = Blueprint("painel", __name__)


@bp.get("/")
@login_required
def painel():
    return render_template("painel.html")
