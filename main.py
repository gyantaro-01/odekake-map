import os
import io
import uuid
from typing import List
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from supabase import create_client, Client
from PIL import Image
from fastapi.staticfiles import StaticFiles

load_dotenv()

# 設定
API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
BUCKET_NAME = "kouryaku-images"

# Supabaseクライアント初期化
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 画像処理ロジック ---
def resize_image(file_content: bytes, max_width: int = 1280) -> bytes:
    """画像をリサイズしてJPEGバイナリを返す（1GB制限対策）"""
    img = Image.open(io.BytesIO(file_content))
    # RGBに変換（PNGやHEIC対策）
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    
    # リサイズ計算
    w_percent = (max_width / float(img.size[0]))
    if w_percent < 1.0:
        h_size = int((float(img.size[1]) * float(w_percent)))
        img = img.resize((max_width, h_size), Image.Resampling.LANCZOS)
    
    output = io.BytesIO()
    # 圧縮率85%で最適化
    img.save(output, format="JPEG", quality=85, optimize=True)
    return output.getvalue()

# --- エンドポイント ---

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"api_key": API_KEY}
    )

@app.post("/save-location")
async def save_location(
    name: str = Form(...),
    lat: float = Form(...),
    lng: float = Form(...),
    kids_score: int = Form(...),
    memo: str = Form(...),
    image: UploadFile = File(None)
):
    image_url = ""
    
    # 1. 画像がある場合はリサイズしてSupabase Storageへ
    if image:
        file_ext = "jpg"
        file_name = f"{uuid.uuid4()}.{file_ext}"
        content = await image.read()
        
        # リサイズ実行
        optimized_content = resize_image(content)
        
        # Storageにアップロード
        res = supabase.storage.from_(BUCKET_NAME).upload(
            path=file_name,
            file=optimized_content,
            file_options={"content-type": "image/jpeg"}
        )
        # 公開URLを取得
        image_url = supabase.storage.from_(BUCKET_NAME).get_public_url(file_name)

    # 2. DB (Supabase) へ保存
    data = {
        "name": name,
        "lat": lat,
        "lng": lng,
        "kids_score": kids_score,
        "memo": memo,
        "image_url": image_url
    }
    
    response = supabase.table("locations").insert(data).execute()
    return {"status": "success", "data": response.data}

@app.get("/get-locations")
async def get_locations():
    # Supabaseから全件取得
    response = supabase.table("locations").select("*").execute()
    return response.data

@app.post("/update-location")
async def update_location(name: str, kids_score: int, memo: str):
    response = supabase.table("locations")\
        .update({"kids_score": kids_score, "memo": memo})\
        .eq("name", name).execute()
    return {"status": "success"}

@app.delete("/delete-location")
async def delete_location(name: str):
    response = supabase.table("locations").delete().eq("name", name).execute()
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    # Renderの環境変数からポートを取得、なければ8000を使う
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)