import io
import os
import uuid
from typing import List

# --- 第三者ライブラリ (Framework & Utilities) ---
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from PIL import Image
from supabase import create_client, Client

# 環境変数の読み込み
load_dotenv()

# ==========================================================================
# 1. コンフィギュレーション & インフラ設定
# ==========================================================================

# Google Maps API 設定
API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

# Supabase 接続情報
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
BUCKET_NAME = "kouryaku-images"

# 秘匿情報（自宅座標等）の取得
# デフォルト値（第2引数）を設定することで、環境変数が未設定の場合のクラッシュを防止
HOME_LAT = float(os.getenv("HOME_LAT", 35.6812))
HOME_LNG = float(os.getenv("HOME_LNG", 139.7671))

# Supabaseクライアントの初期化
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# FastAPI アプリケーション本体の定義
app = FastAPI(title="ITパパのロジカル攻略ログ API")

# 静的ファイルおよびテンプレートのパス設定
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# CORS設定（フロントエンドからのクロスドメインアクセスを許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================================================
# 2. 内部ロジック（画像処理・ユーティリティ）
# ==========================================================================

def resize_image(file_content: bytes, max_width: int = 1280) -> bytes:
    """
    画像を適切なサイズにリサイズし、JPEG形式で最適化します。
    
    【目的】
    - ストレージ容量の節約
    - アップロード/ダウンロードの高速化
    - 各種画像フォーマット（PNG/HEIC等）の標準化（JPEG変換）
    """
    img = Image.open(io.BytesIO(file_content))
    
    # 透過情報(RGBA)やパレット(P)を持つ画像は、JPEG変換のためにRGBへキャスト
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    
    # オリジナル幅がmax_widthを超える場合のみリサイズを実行（アスペクト比維持）
    w_percent = (max_width / float(img.size[0]))
    if w_percent < 1.0:
        h_size = int((float(img.size[1]) * float(w_percent)))
        img = img.resize((max_width, h_size), Image.Resampling.LANCZOS)
    
    output = io.BytesIO()
    # 視覚的な劣化を抑えつつファイルサイズを削る「Quality 85」を採用
    img.save(output, format="JPEG", quality=85, optimize=True)
    return output.getvalue()

# ==========================================================================
# 3. APIエンドポイント (Endpoints)
# ==========================================================================

@app.get("/api/config")
async def get_config():
    """フロントエンドへ地図設定情報を安全に受け渡す"""
    return {
        "apiKey": os.getenv("GOOGLE_MAPS_API_KEY"),
        "center": {
            "lat": HOME_LAT, 
            "lng": HOME_LNG
        }
    }

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """メイン画面のレンダリング"""
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
    """新規スポットの登録（画像アップロードを含む）"""
    image_url = ""
    
    # 画像ファイルが存在する場合のストレージ保存処理
    if image:
        file_ext = "jpg"
        file_name = f"{uuid.uuid4()}.{file_ext}" # ファイル名は競合回避のためUUIDを生成
        content = await image.read()
        
        # リサイズによる最適化
        optimized_content = resize_image(content)
        
        # Supabase Storage へのアップロード
        supabase.storage.from_(BUCKET_NAME).upload(
            path=file_name,
            file=optimized_content,
            file_options={"content-type": "image/jpeg"}
        )
        # 外部アクセス用の公開URLを生成
        image_url = supabase.storage.from_(BUCKET_NAME).get_public_url(file_name)

    # データベースへのインサート
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
    """登録済み全スポットの取得"""
    response = supabase.table("locations").select("*").execute()
    return response.data

@app.post("/update-location")
async def update_location(name: str, kids_score: int, memo: str):
    """スポット情報の更新"""
    supabase.table("locations")\
        .update({"kids_score": kids_score, "memo": memo})\
        .eq("name", name).execute()
    return {"status": "success"}

@app.delete("/delete-location")
async def delete_location(name: str):
    """スポットの削除処理"""
    supabase.table("locations").delete().eq("name", name).execute()
    return {"status": "success"}

# ==========================================================================
# 4. サーバー起動
# ==========================================================================

if __name__ == "__main__":
    import uvicorn
    # 外部環境（Render等）の動的ポート割り当てに対応
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)