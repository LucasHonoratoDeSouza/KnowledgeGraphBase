from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel


class HealthResponse(BaseModel):
    component: Literal["api"] = "api"
    status: Literal["ok"] = "ok"


def create_app() -> FastAPI:
    app = FastAPI(title="Knowledge OS API", version="0.1.0")

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse()

    return app


app = create_app()
