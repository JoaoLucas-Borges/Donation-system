from functools import wraps

from flask import redirect, request, session, url_for


def login_required(view):
    """Bloqueia a rota se ninguém fez login.

    Na API devolve 401 em JSON (o fetch do navegador trata isso);
    nas páginas redireciona para /login.
    """
    @wraps(view)
    def envolvida(*args, **kwargs):
        if "operador_id" not in session:
            if request.path.startswith("/api/"):
                return {"erro": "Faça login para continuar."}, 401
            return redirect(url_for("auth.login"))
        return view(*args, **kwargs)

    return envolvida


def operador_atual_id():
    return session["operador_id"]
