"""Funções para ler e validar campos do JSON que chega na API.

Cada função recebe o dicionário `dados` e o nome do campo. Se o valor
estiver errado, levanta ErroValidacao, e o handler em create_app()
transforma isso numa resposta 400 com {"erro": ..., "campo": ...}.
"""
from datetime import date
from decimal import Decimal, InvalidOperation


class ErroValidacao(Exception):
    def __init__(self, campo, mensagem):
        super().__init__(mensagem)
        self.campo = campo
        self.mensagem = mensagem


def json_obrigatorio(request):
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict):
        raise ErroValidacao(None, "Envie um objeto JSON no corpo da requisição.")
    return dados


def texto(dados, campo, obrigatorio=False, max_len=200):
    valor = dados.get(campo)
    if valor is None or (isinstance(valor, str) and valor.strip() == ""):
        if obrigatorio:
            raise ErroValidacao(campo, "Campo obrigatório.")
        return None
    if not isinstance(valor, str):
        raise ErroValidacao(campo, "Deve ser um texto.")
    valor = valor.strip()
    if len(valor) > max_len:
        raise ErroValidacao(campo, f"Máximo de {max_len} caracteres.")
    return valor


def inteiro(dados, campo):
    valor = dados.get(campo)
    # bool é subclasse de int em Python, por isso a checagem extra
    if isinstance(valor, bool) or not isinstance(valor, int):
        raise ErroValidacao(campo, "Deve ser um número inteiro.")
    return valor


def numero(dados, campo, casas, minimo=None, maior_que=None):
    """Lê um número decimal. Aceita 12.5, "12.5" ou "12,5"."""
    valor = dados.get(campo)
    if valor is None or valor == "":
        raise ErroValidacao(campo, "Campo obrigatório.")
    if isinstance(valor, bool):
        raise ErroValidacao(campo, "Deve ser um número.")
    try:
        # str() antes de Decimal evita imprecisão de float (0.1 vira 0.1, não 0.1000000000000000055)
        valor = Decimal(str(valor).replace(",", "."))
    except InvalidOperation:
        raise ErroValidacao(campo, "Deve ser um número.")
    if not valor.is_finite():
        raise ErroValidacao(campo, "Deve ser um número.")
    # NUMERIC(10, casas) guarda no máximo 10 - casas dígitos antes da vírgula
    if abs(valor) >= Decimal(10) ** (10 - casas):
        raise ErroValidacao(campo, "Valor grande demais.")
    if minimo is not None and valor < minimo:
        raise ErroValidacao(campo, f"Deve ser no mínimo {minimo}.")
    if maior_que is not None and valor <= maior_que:
        raise ErroValidacao(campo, f"Deve ser maior que {maior_que}.")
    return valor


def data_iso(dados, campo):
    """Lê uma data no formato AAAA-MM-DD (o mesmo do <input type="date">)."""
    valor = dados.get(campo)
    if not valor:
        raise ErroValidacao(campo, "Campo obrigatório.")
    try:
        return date.fromisoformat(valor)
    except (TypeError, ValueError):
        raise ErroValidacao(campo, "Data inválida, use AAAA-MM-DD.")


def digitos(dados, campo, tamanho):
    """Campo opcional só com dígitos (CNPJ, chave de acesso). Aceita pontuação."""
    valor = dados.get(campo)
    if valor is None or valor == "":
        return None
    if not isinstance(valor, str):
        raise ErroValidacao(campo, "Deve ser um texto.")
    so_digitos = "".join(c for c in valor if c.isdigit())
    if len(so_digitos) != tamanho:
        raise ErroValidacao(campo, f"Deve ter {tamanho} dígitos.")
    return so_digitos


def opcao(dados, campo, opcoes, padrao=None):
    valor = dados.get(campo) or padrao
    if valor not in opcoes:
        raise ErroValidacao(campo, f"Use um destes: {', '.join(sorted(opcoes))}.")
    return valor
