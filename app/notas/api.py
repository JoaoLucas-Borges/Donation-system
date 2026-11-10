"""Upload e exibição da foto da nota fiscal, e leitura dela com IA.

A leitura (/api/notas/extrair) só devolve os campos para o formulário:
nada é salvo até a pessoa revisar e clicar em Salvar.
"""
import os
import re
import uuid

from flask import Blueprint, abort, current_app, request, send_from_directory

from app import validacao as v
from app.LLM.extracao import extrair
from app.auth.decorators import login_required
from app.limitador import limitador

bp = Blueprint("notas", __name__)

# Nome que o próprio upload gera: 32 letras hexadecimais + extensão.
# A compra só aceita foto_path nesse formato, então ninguém consegue
# apontar para outro arquivo do servidor.
NOME_FOTO = re.compile(r"^[0-9a-f]{32}\.(jpg|png|webp)$")


def tipo_da_imagem(cabecalho):
    """Descobre o tipo pelos primeiros bytes, não pelo nome do arquivo."""
    if cabecalho[:3] == b"\xff\xd8\xff":
        return "jpg"
    if cabecalho[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if cabecalho[:4] == b"RIFF" and cabecalho[8:12] == b"WEBP":
        return "webp"
    return None


@bp.post("/api/notas/upload")
@login_required
def upload():
    arquivo = request.files.get("foto")
    if arquivo is None or not arquivo.filename:
        raise v.ErroValidacao("foto", "Escolha uma foto.")

    cabecalho = arquivo.stream.read(12)
    arquivo.stream.seek(0)
    extensao = tipo_da_imagem(cabecalho)
    if extensao is None:
        raise v.ErroValidacao("foto", "Envie uma imagem JPG, PNG ou WEBP.")

    pasta = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(pasta, exist_ok=True)
    nome = f"{uuid.uuid4().hex}.{extensao}"
    arquivo.save(os.path.join(pasta, nome))
    return {"foto_path": nome}, 201


# Tipo da imagem pela extensão. O NOME_FOTO já garante que é uma dessas três.
TIPOS_MIME = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


@bp.post("/api/notas/extrair")
@login_required
@limitador.limit("20 per minute")  # cada leitura gasta crédito da IA
def extrair_nota():
    dados = v.json_obrigatorio(request)
    nome = dados.get("foto_path")

    # Só nomes gerados pelo upload: ninguém pede à IA para ler outro arquivo do servidor
    if not isinstance(nome, str) or not NOME_FOTO.match(nome):
        raise v.ErroValidacao("foto_path", "Foto inválida. Envie a foto de novo.")

    caminho = os.path.join(current_app.config["UPLOAD_FOLDER"], nome)
    if not os.path.isfile(caminho):
        raise v.ErroValidacao("foto_path", "Foto não encontrada. Envie de novo.")

    extensao = nome.rsplit(".", 1)[1]  # "abc123.jpg" -> "jpg"
    try:
        nota = extrair(caminho, TIPOS_MIME[extensao])
    except Exception:
        # Rede, chave, modelo ou foto ilegível: o cadastro manual continua funcionando
        current_app.logger.exception("Falha ao ler a nota %s com IA", nome)
        return {"erro": "A IA não conseguiu ler esta nota."}, 502

    return nota.model_dump()


@bp.get("/notas/foto/<nome>")
@login_required
def foto(nome):
    if not NOME_FOTO.match(nome):
        abort(404)
    resposta = send_from_directory(current_app.config["UPLOAD_FOLDER"], nome)
    resposta.headers["X-Content-Type-Options"] = "nosniff"
    return resposta
