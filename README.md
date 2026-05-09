# 🗺️ ITパパのお出かけ攻略MAP

ITエンジニアでありパパである私が、家族との休日を「最短ルートで最適化」するために開発した、自分と家族専用のスポット管理アプリです。

## 🚀 このアプリの攻略ポイント
- **ロジカルな評価**: 子供の満足度（kids_score）を5段階で記録し、スコア順にソート可能。
- **プライバシー攻略**: APIキーを `.env` で管理し、セキュリティを確保。
- **マルチデバイス対応**: PCで登録し、外出先ではスマホから場所を確認・編集可能。

## 🛠 テクニカルスタック
- **Frontend**: Leaflet.js / Google Places API
- **Backend**: FastAPI (Python 3.9+)
- **Database**: SQLite (kouryaku.db)

## 📋 使い方（クイックスタート）
1. `.env` ファイルを作成し、`GOOGLE_MAPS_API_KEY` を設定します。
2. `pip install -r requirements.txt` でライブラリをインストール。
3. `python main.py` でサーバー起動。
4. `index.html` をブラウザで開いて攻略開始！
---
### 📬 Connect with me
このプロジェクトや「ロジカルな子育て×Tech」に興味を持っていただけたら、ぜひ X (Twitter) で交流しましょう！
- **X (Twitter)**: [@Gyantarou1](https://x.com/Gyantarou1)

