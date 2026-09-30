"""Revisa el índice Git antes de publicar: sin dependencias ni valores de secretos.

Uso desde la raíz: python infra/check_git_files.py
No analiza el historial ni garantiza detectar todos los secretos posibles.
"""

import re
import subprocess
from pathlib import PurePosixPath


FORBIDDEN_PARTS = {
    "node_modules", ".venv", "venv", "env", "__pycache__", ".pytest_cache",
    ".ruff_cache", "dist", ".aws", ".codex", ".agents", "backups",
    "test-results", "playwright-report", "blob-report", "htmlcov", "coverage",
}
FORBIDDEN_SUFFIXES = {
    ".pyc", ".pyo", ".tsbuildinfo", ".log", ".pem", ".key", ".p12", ".pfx",
    ".jks", ".dump", ".db", ".sqlite", ".sqlite3",
}
PATTERNS = {
    "AWS access key": r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
    "private key": r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    "GitHub token": r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b",
    "Slack token": r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b",
    "embedded JWT": r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b",
    "tunnel token": r"--token\s+[\"']?[A-Za-z0-9+/=_-]{30,}",
    "literal AWS secret": r"(?i)aws_(?:secret_access_key|session_token)\s*[:=]\s*[\"'][A-Za-z0-9+/=_-]{30,}[\"']",
}


def git(*args):
    return subprocess.check_output(["git", *args])


def main():
    paths = [path.decode("utf-8") for path in git("ls-files", "-z").split(b"\0") if path]
    failures = []
    for path in paths:
        file = PurePosixPath(path)
        if (FORBIDDEN_PARTS.intersection(file.parts) or file.suffix in FORBIDDEN_SUFFIXES
                or (file.name.startswith(".env") and file.name != ".env.example")
                or file.name in {"credentials", ".coverage", ".DS_Store", "Thumbs.db"}):
            failures.append((path, "archivo local/privado o generado"))
            continue
        # Leer el contenido que realmente se enviaría, no la copia del worktree.
        content = git("show", f":{path}")
        if b"\0" in content:
            continue
        text = content.decode("utf-8", errors="replace")
        for label, pattern in PATTERNS.items():
            if re.search(pattern, text):
                failures.append((path, label))
    if failures:
        for path, label in failures:
            print(f"REVISAR: {path} ({label})")
        return 1
    print(f"OK: {len(paths)} archivos del índice; sin artefactos prohibidos ni patrones de secretos detectados.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
