"""Real API for Playwright, with a disposable database and normal provider."""

from pathlib import Path
from tempfile import TemporaryDirectory

import uvicorn

from app.main import create_app

if __name__ == "__main__":
    # Graceful Playwright shutdown closes SQLite and removes this run's data.
    with TemporaryDirectory(prefix="prompt-studio-e2e-") as directory:
        app = create_app(database_path=str(Path(directory) / "test.sqlite3"))
        uvicorn.run(app, host="127.0.0.1", port=8001, log_level="warning")
