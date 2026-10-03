"""Hook PreToolUse do Claude Code: antes de `git commit`/`git push`, roda a barreira de dados pessoais.

Le o JSON do hook na entrada padrao; se o comando Bash contiver git commit ou git push,
executa scripts/check_no_personal_data.py e bloqueia (exit 2) quando ela falhar.
"""
import json
import pathlib
import re
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parents[1]

dados = json.load(sys.stdin)
comando = dados.get("tool_input", {}).get("command", "")
if re.search(r"\bgit\s+(commit|push)\b", comando):
    r = subprocess.run(
        [sys.executable, str(RAIZ / "scripts" / "check_no_personal_data.py")],
        capture_output=True, text=True, cwd=RAIZ,
    )
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr)
        sys.exit(2)
sys.exit(0)
