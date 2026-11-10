from flask import Blueprint, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash

from app.db import db
from app.limitador import limitador
from app.models import Operador

bp = Blueprint("auth", __name__)


def autenticar(codigo):
    """Procura o operador ativo dono do código.

    O hash tem sal, então não dá para buscar com WHERE: testamos cada um.
    Com poucos operadores isso é rápido.
    """
    if not (codigo.isdigit() and len(codigo) == 6):
        return None
    ativos = db.session.scalars(db.select(Operador).where(Operador.ativo)).all()
    for operador in ativos:
        if check_password_hash(operador.codigo_hash, codigo):
            return operador
    return None


def pagina_segura(caminho):
    """Só aceita caminhos deste site ("/compras"), nunca outro endereço.

    Sem isso, um link como /login?proxima=https://site-falso.com mandaria a
    pessoa para fora do sistema logo depois de digitar o código (open redirect).
    """
    if caminho and caminho.startswith("/") and not caminho.startswith(("//", "/\\")):
        return caminho
    return url_for("painel.painel")


@bp.route("/login", methods=["GET", "POST"])
@limitador.limit(
    "5 per minute",
    methods=["POST"],
    # Só tentativa errada gasta: os operadores no mesmo Wi-Fi têm o mesmo IP
    deduct_when=lambda resposta: resposta.status_code == 401,
)
def login():
    proxima = pagina_segura(request.args.get("proxima"))
    # Já está logado: não faz sentido mostrar o login de novo
    if request.method == "GET" and "operador_id" in session:
        return redirect(proxima)

    erro = None
    if request.method == "POST":
        operador = autenticar(request.form.get("codigo", "").strip())
        if operador:
            session.clear()
            session.permanent = True  # usa o PERMANENT_SESSION_LIFETIME do config
            session["operador_id"] = operador.id
            session["operador_nome"] = operador.nome
            return redirect(proxima)
        erro = "Código inválido."
    return render_template("login.html", erro=erro), (401 if erro else 200)


@bp.get("/logout")
def logout():
    session.clear()
    return redirect(url_for("auth.login"))
