# 📍 ITパパのお出かけ攻略MAP
ITエンジニアであり２児のパパである私が、家族との休日を「最短ルートで最適化」するために開発した、自分と家族専用のスポット管理アプリです。

## 📖 コンセプト
散らばりがちな「子供が喜んだ場所」「また行きたい公園」の情報を、地図上に蓄積。
Google Maps APIとSupabaseを連携させ、**「現場でサッと登録、後でしっかり攻略」**できる体験を追求しました。

## 🛠 技術スタック（Tech Stack）
効率とコストパフォーマンスを重視し、モダンな技術を採用しています。

*   **Backend**: Python / FastAPI
*   **Frontend**: JavaScript (Vanilla JS), HTML5, CSS3
*   **Database**: Supabase (PostgreSQL)
*   **Storage**: Supabase Storage (画像最適化保存)
*   **Infrastructure**: Render (Free Tier)
*   **Maps API**: Google Maps Platform (Maps, Places API)

## 🚀 特徴的な機能
- **セキュリティの最適化**: 自宅座標やAPIキーを環境変数（ENV）に隠蔽し、GitHub公開時の安全性を担保。
- **画像リサイズ・エンジン**: PIL（Pillow）を使用し、アップロード時に画像を自動最適化。ストレージ容量を節約。
- **レスポンシブ・ロジック**: スマホからの操作を前提としたUI設計（ホーム画面への追加を推奨）。
- **CI/CD連動**: GitHubへのPushにより、Render経由で即座にクラウドへデプロイ。

## 📂 ディレクトリ構成
```text
.
├── main.py              # サーバーサイド・ロジック（API、画像処理、環境変数管理）
├── requirements.txt     # 依存ライブラリ一覧
├── templates/
│   └── index.html       # メイン画面（Jinja2テンプレート）
└── static/
    ├── css/
    │   └── style.css    # UIデザイン（ロジカル・レイアウト）
    └── js/
        └── script.js    # 地図制御・非同期通信（async/await）
```
## ⚙️ セットアップ
1.  `.env` ファイルを作成し、以下の情報を設定します。
    ```env
    GOOGLE_MAPS_API_KEY=YOUR_API_KEY
    SUPABASE_URL=YOUR_SUPABASE_URL
    SUPABASE_KEY=YOUR_SUPABASE_KEY
    HOME_LAT=35.6812   # デフォルトの表示位置（緯度）
    HOME_LNG=139.7671  # デフォルトの表示位置（経度）
    ```
2.  依存関係をインストールします。
    ```bash
    pip install -r requirements.txt
    ```
3.  サーバーを起動します。
    ```bash
    python main.py
    ```
---

### 📬 Connect with me
このプロジェクトや「ロジカルな子育て×Tech」に興味を持っていただけたら、ぜひ X (Twitter) で交流しましょう！
- **X (Twitter)**: [@Gyantarou1](https://x.com/Gyantarou1)

