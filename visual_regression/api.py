from fastapi import FastAPI
from pydantic import BaseModel

from visual_regression.service import compare


app = FastAPI()


class CompareRequest(BaseModel):
    test_case_id: str
    step_name: str
    framework: str
    browser: str
    current_image_path: str
    threshold: float = 0.1


@app.post("/compare")
def compare_endpoint(req: CompareRequest):
    return compare(
        req.test_case_id,
        req.step_name,
        req.framework,
        req.browser,
        req.current_image_path,
        req.threshold,
    )


@app.get("/health")
def health():
    return {"status": "ok"}
