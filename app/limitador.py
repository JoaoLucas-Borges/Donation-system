from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Igual ao db.py: cria aqui, liga ao app no create_app() com init_app.
# memory:// guarda as contagens na memória do processo. Sem Redis, como o
# projeto pede. Com vários workers do gunicorn, cada um conta separado,
# então o limite real fica "5 por minuto por worker". Para este uso, basta.
limitador = Limiter(key_func=get_remote_address, storage_uri="memory://")
