"""Relatório da campanha e exportação para o Power BI / Excel.

Tudo aqui lê das views vw_* (sql/views.sql), as mesmas que o Power BI usa.
Assim o número que aparece no app é o mesmo que aparece no Power BI.
"""
import csv
import io
import zipfile
from datetime import date, datetime
from decimal import Decimal

from flask import Blueprint, Response, request

from app import validacao as v
from app.auth.decorators import login_required
from app.db import db
from app.models import Evento

bp = Blueprint("relatorio_api", __name__, url_prefix="/api/relatorio")


def consultar(sql, **parametros):
    """Roda um SELECT e devolve uma lista de dicionários."""
    return [dict(linha) for linha in db.session.execute(db.text(sql), parametros).mappings()]


def para_json(valor):
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, (date, datetime)):
        return valor.isoformat()
    return valor


def limpar(linhas):
    return [{chave: para_json(valor) for chave, valor in linha.items()} for linha in linhas]


def evento_da_query():
    try:
        evento_id = int(request.args.get("evento_id", ""))
    except ValueError:
        raise v.ErroValidacao("evento_id", "Informe o evento_id.")
    db.get_or_404(Evento, evento_id)
    return evento_id


# ---------- relatório (JSON para a página /relatorio) ----------

@bp.get("")
@login_required
def relatorio():
    evento_id = evento_da_query()
    p = {"evento_id": evento_id}

    resumo = consultar("SELECT * FROM vw_resumo_evento WHERE evento_id = :evento_id", **p)[0]

    gasto_por_dia = consultar("""
        SELECT data_compra AS dia, SUM(valor_total) AS valor, COUNT(*) AS compras
        FROM vw_conferencia_notas WHERE evento_id = :evento_id
        GROUP BY data_compra ORDER BY data_compra
    """, **p)

    gasto_por_fornecedor = consultar("""
        SELECT COALESCE(NULLIF(trim(fornecedor), ''), 'Sem fornecedor') AS fornecedor,
               SUM(valor_total) AS valor, COUNT(*) AS compras
        FROM vw_conferencia_notas WHERE evento_id = :evento_id
        GROUP BY 1 ORDER BY valor DESC
    """, **p)

    # Itens com o mesmo nome (ignorando maiúsculas) e a mesma unidade viram uma linha só
    itens = consultar("""
        SELECT min(descricao) AS descricao, unidade,
               SUM(quantidade) AS quantidade, SUM(valor_total) AS valor
        FROM vw_itens WHERE evento_id = :evento_id
        GROUP BY lower(trim(descricao)), unidade
        ORDER BY valor DESC
    """, **p)

    porcoes_por_hora = consultar("""
        SELECT hora, SUM(quantidade) AS porcoes
        FROM vw_distribuicao WHERE evento_id = :evento_id
        GROUP BY hora ORDER BY hora
    """, **p)

    notas = consultar("""
        SELECT compra_id, data_compra, fornecedor, numero_nota,
               valor_total, soma_itens, diferenca, tem_comprovante
        FROM vw_conferencia_notas
        WHERE evento_id = :evento_id AND (diferenca <> 0 OR NOT tem_comprovante)
        ORDER BY data_compra, compra_id
    """, **p)

    return {
        "resumo": limpar([resumo])[0],
        "gasto_por_dia": limpar(gasto_por_dia),
        "gasto_por_fornecedor": limpar(gasto_por_fornecedor),
        "itens": limpar(itens),
        "porcoes_por_hora": limpar(porcoes_por_hora),
        "notas_para_conferir": limpar(notas),
    }


# ---------- exportação (ZIP com CSVs) ----------
# Cada CSV é uma tabela, pronta para o Power BI (Obter dados > Pasta ou Texto/CSV)
# ou para abrir no Excel. Formato brasileiro: separador ";" e vírgula decimal.

def valor_csv(valor):
    if valor is None:
        return ""
    if isinstance(valor, Decimal):
        return str(valor).replace(".", ",")
    if isinstance(valor, bool):
        return "sim" if valor else "não"
    if isinstance(valor, datetime):
        return valor.strftime("%Y-%m-%d %H:%M")
    if isinstance(valor, date):
        return valor.isoformat()
    return valor


def gerar_csv(linhas, colunas):
    saida = io.StringIO()
    # BOM no começo: sem ele o Excel lê os acentos errado
    saida.write("﻿")
    escritor = csv.writer(saida, delimiter=";", lineterminator="\r\n")
    escritor.writerow(colunas)
    for linha in linhas:
        escritor.writerow([valor_csv(linha[c]) for c in colunas])
    return saida.getvalue()


@bp.get("/exportar")
@login_required
def exportar():
    # Sem evento_id: exporta todos os eventos (bom para comparar campanhas no Power BI)
    filtro, p, nome = "", {}, "sopao_todos_os_eventos"
    if request.args.get("evento_id"):
        p = {"evento_id": evento_da_query()}
        filtro, nome = "WHERE evento_id = :evento_id", f"sopao_evento_{p['evento_id']}"

    tabelas = {
        "resumo_eventos.csv": (
            f"SELECT * FROM vw_resumo_evento {filtro} ORDER BY data",
            ["evento_id", "nome", "data", "local", "total_gasto", "qtd_compras", "porcoes", "custo_por_porcao"],
        ),
        "compras.csv": (
            f"SELECT * FROM vw_conferencia_notas {filtro} ORDER BY data_compra, compra_id",
            ["compra_id", "evento_id", "data_compra", "fornecedor", "numero_nota",
             "valor_total", "soma_itens", "diferenca", "tem_comprovante"],
        ),
        "itens.csv": (
            f"SELECT * FROM vw_itens {filtro} ORDER BY data_compra, compra_id, id",
            ["id", "compra_id", "evento_id", "data_compra", "fornecedor", "numero_nota",
             "descricao", "categoria", "quantidade", "unidade", "valor_unitario", "valor_total"],
        ),
        "porcoes_por_hora.csv": (
            f"SELECT evento_id, hora, SUM(quantidade) AS porcoes FROM vw_distribuicao {filtro} "
            "GROUP BY evento_id, hora ORDER BY evento_id, hora",
            ["evento_id", "hora", "porcoes"],
        ),
    }

    arquivo = io.BytesIO()
    with zipfile.ZipFile(arquivo, "w", zipfile.ZIP_DEFLATED) as zip_:
        for nome_csv, (sql, colunas) in tabelas.items():
            zip_.writestr(nome_csv, gerar_csv(consultar(sql, **p), colunas).encode("utf-8"))

    return Response(
        arquivo.getvalue(),
        mimetype="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{nome}_{date.today().isoformat()}.zip"'},
    )
