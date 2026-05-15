import io
import os
import uuid
from typing import List, Optional

# --- 第三者ライブラリ ---
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form, Depends, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.security import APIKeyHeader
from pydantic import BaseModel  
from PIL import Image
from supabase import create_client, Client

# 環境変数の読み込み
load_dotenv()

# ==========================================================================
# 1. コンフィギュレーション & インフラ設定
# ==========================================================================

# Google Maps API / Supabase 設定
API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
BUCKET_NAME = "kouryaku-images"

# サイト全体の合言葉（Renderの環境変数 "APP_PASSWORD" に設定してください）
APP_PASSWORD = os.getenv("APP_PASSWORD")

# 秘匿情報（自宅座標等）
HOME_LAT = float(os.getenv("HOME_LAT", 35.6812))
HOME_LNG = float(os.getenv("HOME_LNG", 139.7671))

# インフラ初期化
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
app = FastAPI(title="ITパパのロジカル攻略ログ API (Protected)")

# 認証用ヘッダーの定義 (ブラウザのJSから X-App-Password を送る)
header_auth = APIKeyHeader(name="X-App-Password", auto_error=False)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================================================
# 2. 認証ロジック
# ==========================================================================

async def verify_app_access(password: str = Security(header_auth)):
    # パスワードが未設定、または一致しない場合は拒否
    if not APP_PASSWORD or password != APP_PASSWORD:
        raise HTTPException(status_code=403, detail="Forbidden")
    return password

# ==========================================================================
# 3. 内部ロジック（画像処理）
# ==========================================================================

def resize_image(file_content: bytes, max_width: int = 1280) -> bytes:
    img = Image.open(io.BytesIO(file_content))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    
    w_percent = (max_width / float(img.size[0]))
    if w_percent < 1.0:
        h_size = int((float(img.size[1]) * float(w_percent)))
        img = img.resize((max_width, h_size), Image.Resampling.LANCZOS)
    
    output = io.BytesIO()
    img.save(output, format="JPEG", quality=85, optimize=True)
    return output.getvalue()

# ==========================================================================
# 4. リクエストデータの型定義 (Pydanticモデル)
# ==========================================================================

class LocationUpdate(BaseModel):
    """JS側からJSON形式で送られてくる編集データを受け取る型"""
    name: str
    kids_score: int
    memo: str

# ==========================================================================
# 5. APIエンドポイント
# ==========================================================================

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """
    メイン画面のHTMLを返す。
    ※HTML自体は見えますが、パスワードがないとJSがデータを取得できない設計。
    """
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"api_key": API_KEY}
    )

@app.get("/api/config")
async def get_config(auth: str = Depends(verify_app_access)):
    """認証通過後、地図の設定を返す"""
    return {
        "apiKey": API_KEY,
        "center": {"lat": HOME_LAT, "lng": HOME_LNG}
    }

@app.get("/get-locations")
async def get_locations(auth: str = Depends(verify_app_access)):
    """認証通過後、登録済みスポットを返す"""
    response = supabase.table("locations").select("*").execute()
    return response.data

@app.post("/save-location")
async def save_location(
    name: str = Form(...),
    lat: float = Form(...),
    lng: float = Form(...),
    kids_score: int = Form(...),
    memo: str = Form(...),
    image: UploadFile = File(None),
    auth: str = Depends(verify_app_access)
):
    """認証通過後、新規スポットを保存"""
    image_url = ""
    if image:
        file_name = f"{uuid.uuid4()}.jpg"
        content = await image.read()
        optimized_content = resize_image(content)
        
        supabase.storage.from_(BUCKET_NAME).upload(
            path=file_name,
            file=optimized_content,
            file_options={"content-type": "image/jpeg"}
        )
        image_url = supabase.storage.from_(BUCKET_NAME).get_public_url(file_name)

    data = {
        "name": name, "lat": lat, "lng": lng,
        "kids_score": kids_score, "memo": memo, "image_url": image_url
    }
    response = supabase.table("locations").insert(data).execute()
    return {"status": "success", "data": response.data}

@app.post("/update-location")
async def update_location(data: LocationUpdate, auth: str = Depends(verify_app_access)):
    """
    認証通過後、既存スポットの情報を更新する。
    場所名（name）をキーにして、星（kids_score）とメモ（memo）を書き換えます。
    """
    try:
        response = supabase.table("locations")\
            .update({"kids_score": data.kids_score, "memo": data.memo})\
            .eq("name", data.name)\
            .execute()
        return {"status": "success", "data": response.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/delete-location")
async def delete_location(name: str, auth: str = Depends(verify_app_access)):
    """認証通過後、削除を実行"""
    supabase.table("locations").delete().eq("name", name).execute()
    return {"status": "success"}

# ==========================================================================
# 6. サーバー起動
# ==========================================================================

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)