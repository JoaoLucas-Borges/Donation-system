import base64
import os
from typing import Literal

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

class Item(BaseModel):
    descricao:str
    categoria:str
    quantidade:float
    unidade: Literal["kg", "un", "l", "pct"]
    valor_unitario: float

class NotaExtraida(BaseModel):
    fornecedor: str | None
    cnpj_emitente: str | None = Field(description="Só os 14 dígitos")
    numero_nota: str | None
    chave_acesso: str | None = Field(description="Os 44 dígitos, sem espaços")
    data_compra: str | None = Field(description="Formato AAAA-MM-DD")
    valor_total: float | None
    itens: list[Item]

INSTRUCOES = """Você lê fotos de notas fiscais brasileiras (NFC-e/cupom).
Extraia só o que está legível na imagem. Se um campo não aparece ou está
ilegível, devolva null: nunca invente. Use o ponto como separador decimal."""

# Criado só na primeira leitura: sem MODELO_IA no .env o app ainda sobe,
# só a leitura da nota falha (e o cadastro manual continua funcionando).
_extrator = None


def _pegar_extrator():
    global _extrator
    if _extrator is None:
        nome = os.environ.get("MODELO_IA")
        if not nome:
            raise RuntimeError("Defina MODELO_IA no .env (ex.: openai:<modelo>).")
        modelo = init_chat_model(nome)
        _extrator = modelo.with_structured_output(NotaExtraida, method="json_schema")
    return _extrator


def extrair(caminho, tipo_mime):
    with open(caminho, "rb") as f:
        dados = base64.standard_b64encode(f.read()).decode()

    mensagens = [
        SystemMessage(INSTRUCOES),
        HumanMessage(content=[
            {"type": "image", "base64": dados, "mime_type": tipo_mime},
            {"type": "text", "text": "Extraia os dados desta nota."},
        ]),
    ]
    return _pegar_extrator().invoke(mensagens)
