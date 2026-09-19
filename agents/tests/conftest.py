import sys
from pathlib import Path

# El paquete se importa desde la raíz de `agents/` sin instalarlo, para que
# `pytest` funcione igual en CI y en una copia recién clonada.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
