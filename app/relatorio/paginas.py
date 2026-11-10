from flask import Blueprint, render_template

from app.auth.decorators import login_required

bp = Blueprint("relatorio", __name__, url_prefix="/relatorio")


@bp.get("")
@login_required
def relatorio():
    return render_template("relatorio.html")
