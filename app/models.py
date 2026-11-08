from app.db import db


class Evento(db.Model):
    __tablename__ = "evento"

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.Text, nullable=False)
    data = db.Column(db.Date, nullable=False)
    local = db.Column(db.Text)


class Operador(db.Model):
    __tablename__ = "operador"

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.Text, nullable=False)
    codigo_hash = db.Column(db.Text, nullable=False)
    ativo = db.Column(db.Boolean, nullable=False, server_default=db.true())


class Compra(db.Model):
    __tablename__ = "compra"

    id = db.Column(db.Integer, primary_key=True)
    evento_id = db.Column(db.Integer, db.ForeignKey("evento.id"), nullable=False)
    operador_id = db.Column(db.Integer, db.ForeignKey("operador.id"), nullable=False)
    data_compra = db.Column(db.Date, nullable=False)
    fornecedor = db.Column(db.Text)
    cnpj_emitente = db.Column(db.CHAR(14))
    numero_nota = db.Column(db.Text)
    chave_acesso = db.Column(db.CHAR(44), unique=True)
    valor_total = db.Column(db.Numeric(10, 2), nullable=False)
    foto_path = db.Column(db.Text)
    origem_dados = db.Column(db.Text, nullable=False, server_default="manual")
    criado_em = db.Column(db.DateTime(timezone=True), nullable=False, server_default=db.func.now())

    itens = db.relationship(
        "ItemCompra",
        backref="compra",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class ItemCompra(db.Model):
    __tablename__ = "item_compra"

    id = db.Column(db.Integer, primary_key=True)
    compra_id = db.Column(
        db.Integer, db.ForeignKey("compra.id", ondelete="CASCADE"), nullable=False
    )
    descricao = db.Column(db.Text, nullable=False)
    categoria = db.Column(db.Text)
    quantidade = db.Column(db.Numeric(10, 3), nullable=False)
    unidade = db.Column(db.Text, nullable=False)
    valor_unitario = db.Column(db.Numeric(10, 2), nullable=False)
    valor_total = db.Column(
        db.Numeric(10, 2), db.Computed("round(quantidade * valor_unitario, 2)")
    )


class Distribuicao(db.Model):
    __tablename__ = "distribuicao"

    id = db.Column(db.BigInteger, primary_key=True)
    evento_id = db.Column(db.Integer, db.ForeignKey("evento.id"), nullable=False)
    operador_id = db.Column(db.Integer, db.ForeignKey("operador.id"), nullable=False)
    quantidade = db.Column(db.Integer, nullable=False)
    client_id = db.Column(db.Uuid, nullable=False, unique=True)
    clicado_em = db.Column(db.DateTime(timezone=True), nullable=False)
    registrado_em = db.Column(
        db.DateTime(timezone=True), nullable=False, server_default=db.func.now()
    )
