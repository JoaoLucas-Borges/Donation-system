CREATE TABLE IF NOT EXISTS evento(
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    data DATE NOT NULL,
    local TEXT
);

CREATE TABLE IF NOT EXISTS operador(
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    codigo_hash TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS compra(
    id SERIAL PRIMARY KEY,
    evento_id INT NOT NULL REFERENCES evento(id),
    operador_id INT NOT NULL REFERENCES operador(id),
    data_compra DATE NOT NULL,
    fornecedor TEXT,
    cnpj_emitente CHAR(14),
    numero_nota TEXT,
    chave_acesso CHAR(44) UNIQUE,
    valor_total NUMERIC(10,2) NOT NULL CHECK (valor_total >= 0),
    foto_path TEXT,
    origem_dados TEXT NOT NULL DEFAULT 'manual' CHECK(origem_dados in ('manual', 'qr', 'ia')),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS item_compra (
    id SERIAL PRIMARY KEY,
    compra_id INT NOT NULL REFERENCES compra(id) ON DELETE CASCADE,
    descricao TEXT NOT NULL,
    categoria TEXT,
    quantidade NUMERIC(10,3) NOT NULL CHECK (quantidade > 0),
    unidade TEXT NOT NULL CHECK (unidade IN ('kg', 'un', 'l', 'pct')),
    valor_unitario NUMERIC(10,2) NOT NULL CHECK(valor_unitario >= 0),
    valor_total NUMERIC(10,2) GENERATED ALWAYS AS (round(quantidade * valor_unitario, 2)) STORED 
);

CREATE TABLE IF NOT EXISTS distribuicao(
    id BIGSERIAL PRIMARY KEY,
    evento_id INT NOT NULL REFERENCES evento(id),
    operador_id INT NOT NULL REFERENCES operador(id),
    quantidade INT NOT NULL CHECK (quantidade IN (1, -1)),
    posto TEXT,
    client_id UUID NOT NULL UNIQUE,
    clicado_em TIMESTAMPTZ NOT NULL,
    registrado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compra_evento ON compra(evento_id);
CREATE INDEX IF NOT EXISTS idx_item_compra_compra ON item_compra(compra_id);
CREATE INDEX IF NOT EXISTS idx_distribuicao_evento ON distribuicao(evento_id);