/**
 * ITパパのお出かけ攻略MAP - Frontend Logic (Auth Integrated)
 * 
 * 役割:
 * 1. 認証状態の管理（合言葉によるアクセス制限）
 * 2. Google Maps APIの初期化とコントロール
 * 3. ユーザーインターフェース(UI)の動的生成
 */

let map;
let infowindow;
let allLocations = [];
let currentSort = { key: null, asc: true };
const API_BASE_URL = ""; 

// ブラウザの保存領域からパスワードを取得
let appPassword = localStorage.getItem('app_pass');

// ==========================================================================
// 1. 認証管理ロジック (Authentication)
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    /**
     * ページ読み込み時に実行。
     * パスワードの有無によって、ログイン画面か地図画面かを切り替える。
     */
    const loginOverlay = document.getElementById('login-overlay');
    const mainApp = document.getElementById('main-app');

    if (appPassword) {
        // すでにパスワードが保存されていればアプリを表示
        loginOverlay.style.display = 'none';
        mainApp.style.display = 'block';
    } else {
        // 未認証ならログイン画面を表示
        loginOverlay.style.display = 'flex';
        mainApp.style.display = 'none';
    }
});

async function attemptLogin() {
    /**
     * ログインボタン押下時の処理。
     * 入力されたパスワードでAPI(config)を叩き、正解ならログイン状態にする。
     */
    const passInput = document.getElementById('pass-input').value;
    
    // 門番役のAPIにアクセス（ヘッダーにパスワードを乗せる）
    const res = await fetch('/api/config', {
        headers: { 'X-App-Password': passInput }
    });

    if (res.ok) {
        // 認証成功：パスワードを保存してリロード
        localStorage.setItem('app_pass', passInput);
        appPassword = passInput;
        location.reload(); 
    } else {
        // 認証失敗
        alert("パスワードが違います。");
    }
}

function logout() {
    /**
     * ログアウト処理。
     * 保存された鍵を破棄してログイン画面に戻す。
     */
    localStorage.removeItem('app_pass');
    location.reload();
}
// ==========================================================================
// 2. 地図初期化・コア設定 (Initialization)
// ==========================================================================

async function initMap() {
    /**
     * Googleマップを起動し、初期位置を設定。
     * 認証済みのパスワード（appPassword）を添えて設定を取得。
     */
    let defaultPos = { lat: 35.6812, lng: 139.7671 }; // 取得失敗時のフォールバック(東京駅)
    
    // 未認証の場合は地図の初期化をスキップ（エラー防止）
    if (!appPassword) return;

    try {
        const response = await fetch('/api/config', {
            headers: { 'X-App-Password': appPassword } // 認証ヘッダーを追加
        });

        if (response.ok) {
            const config = await response.json();
            // config.center.lat のように、一段深く参照する
            if (config.center && !isNaN(config.center.lat)) {
                defaultPos = { 
                    lat: Number(config.center.lat), 
                    lng: Number(config.center.lng) 
                };
            }
        } else if (response.status === 403) {
            // パスワードが期限切れ、または無効な場合はログアウト
            logout();
            return;
        }
    } catch (error) {
        console.error("座標の取得失敗:", error);
    }

    // 地図のレンダリング設定
    map = new google.maps.Map(document.getElementById("map"), {
        center: defaultPos, 
        zoom: 14, 
        disableDefaultUI: true, // 不要なボタンを隠してスッキリさせる
        zoomControl: true,      // ズーム操作のみ許可
    });

    // 共通で使用する情報ウィンドウ（吹き出し）の初期化
    infowindow = new google.maps.InfoWindow({
        pixelOffset: new google.maps.Size(0, -30) 
    });

    // Google Places Autocomplete (場所検索機能) のセットアップ
    const input = document.getElementById("pac-input");
    const autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.bindTo("bounds", map); // 現在の表示範囲を優先して検索
    
    autocomplete.addListener("place_changed", () => {
        infowindow.close();
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) return;

        // 検索結果に移動
        if (place.geometry.viewport) map.fitBounds(place.geometry.viewport);
        else { 
            map.setCenter(place.geometry.location); 
            map.setZoom(17); 
        }
        showSaveForm(place); // 保存用フォームを表示
    });

    loadData(); // 保存済みデータの読み込み開始
}
// ==========================================================================
// 3. データ保存・更新関連 (Data Operations) 
// ==========================================================================
async function deleteLocation(name) {
    /**
     * スポットの削除を実行。
     * 元のコードのロジックを維持しつつ、確実にfetchが走るように修正。
     */
    if (!confirm(`${name} を削除しますか？`)) return;
    
    // API_BASE_URLが空文字でも正しくパスが通るように記述
    const url = `/delete-location?name=${encodeURIComponent(name)}`;
    
    const res = await fetch(url, { 
        method: 'DELETE',
        headers: { 'X-App-Password': appPassword } 
    });
    
    if (res.ok) {
        loadData(); // 再読み込みしてリストとピンを更新
    } else {
        alert("削除に失敗しました。");
    }
}

async function saveLocation(name, lat, lng) {
    /**
     * 入力された情報をFormDataにまとめ、バックエンドへ送信。
     * ID重複によるバグ防止のため、InfoWindow内から直接要素を特定する。
     */
    const iwContainer = document.querySelector('.info-window-form');
    const score = iwContainer.querySelector("#score-input").value;
    const memo = iwContainer.querySelector("#memo-input").value;
    const imageFile = iwContainer.querySelector("#image-input").files[0];

    const formData = new FormData();
    formData.append("name", name);
    formData.append("lat", lat);
    formData.append("lng", lng);
    formData.append("kids_score", parseInt(score));
    formData.append("memo", memo || "");
    if (imageFile) formData.append("image", imageFile);

    const res = await fetch(`${API_BASE_URL}/save-location`, { 
        method: 'POST', 
        headers: { 'X-App-Password': appPassword },
        body: formData 
    });
    
    if (res.ok) { 
        infowindow.close(); 
        loadData(); 
    } else if (res.status === 403) {
        alert("認証エラー：パスワードを再確認してください。");
    }
}

function editInList(name, currentScore, currentMemo) {
    /**
     * リスト上の「編集」ボタンから呼ばれる。
     * ブラウザ標準の prompt を使い、リスト上で完結させる。
     */
    const inputScore = prompt(`${name} の評価(1-5)`, currentScore);
    const inputMemo = prompt("メモを編集", currentMemo);
    
    if (inputScore === null || inputMemo === null) return;

    // 更新APIを叩く
    fetch(`/update-location`, {
        method: 'POST', 
        headers: {
            'Content-Type': 'application/json',
            'X-App-Password': appPassword
        },
        body: JSON.stringify({ 
            name: name, 
            kids_score: parseInt(inputScore), 
            memo: inputMemo 
        })
    }).then(res => {
        if (res.ok) {
            // ① 成功メッセージを出してから再読み込み
            alert("✨ 更新しました！");
            loadData();
        } else {
            // ② 失敗した場合のセーフティネット
            alert(`❌ 更新に失敗しました（ステータス: ${res.status}）`);
        }
    }).catch(err => {
        // ネットワークエラーなどの保険
        console.error(err);
        alert("🚨 通信エラーが発生しました。");
    });
}
// ==========================================================================
// 4. 地図・UI描画ロジック (Rendering) 
// ==========================================================================

async function loadData() {
    /**
     * バックエンドから全データを取得し、地図上のピンを生成。
     * マウスオーバー時のツールチップ表示機能を含めて完全に復元。
     */
    const res = await fetch(`${API_BASE_URL}/get-locations`, {
        headers: { 'X-App-Password': appPassword }
    });
    
    if (!res.ok) return;
    
    allLocations = await res.json();
    
    // 既存のマーカーがあればクリアする処理が必要な場合はここに追加

    allLocations.forEach(loc => {
        const marker = new google.maps.Marker({ 
            position: { lat: loc.lat, lng: loc.lng }, 
            map: map, 
            title: loc.name 
        });

        // マウスオーバー：ピンに合わせると星とメモを表示
        marker.addListener("mouseover", () => {
            showTooltipWithMarker(marker, loc.name, loc.memo || '', loc.kids_score);
        });

        // マウスアウト：離れるとツールチップを閉じる
        marker.addListener("mouseout", () => {
            infowindow.close();
        });

        // クリック：該当するリストカードへスムーズスクロール
        marker.addListener("click", () => {
            const card = document.getElementById(`card-${loc.name}`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // カードを強調するエフェクトなどを入れる場合はここ
            }
            map.panTo(marker.getPosition());
            map.setZoom(17);
        });
    });

    // 地図のピンが打てたら、下のリストも描画する
    renderList();
}

function renderList() {
    /**
     * 画面下部の「攻略済みスポット一覧」を生成。
     * 編集ボタンを editInList(prompt形式) に、削除を deleteLocation に紐付け。
     */
    const container = document.getElementById('card-list');
    if (!container) return; 
    container.innerHTML = '';
    
    allLocations.forEach(loc => {
        const card = document.createElement('div');
        card.className = 'log-card';
        card.id = `card-${loc.name}`;

        const imgHtml = loc.image_url ? `<img src="${loc.image_url}" class="card-img">` : '';
        
        card.innerHTML = `
            ${imgHtml}
            <div class="clickable-area" onclick="focusOnMap(${loc.lat}, ${loc.lng}, '${loc.name}', '${loc.memo || ''}', ${loc.kids_score})">
                <div class="card-title">${loc.name}</div>
                <div class="score-badge">${"⭐".repeat(loc.kids_score)}</div>
                <div class="memo-text" style="font-size:0.85rem; color:#555;">${loc.memo || ''}</div>
            </div>
            <div style="display:flex; gap:10px; margin-top:10px;">
                <button onclick="editInList('${loc.name}', ${loc.kids_score}, '${loc.memo || ''}')" style="flex:1; background:#28a745; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer;">編集</button>
                <button onclick="deleteLocation('${loc.name}')" style="flex:1; background:#dc3545; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer;">削除</button>
            </div>`;
        container.appendChild(card);
    });
}

// ==========================================================================
// 5. ヘルパー関数 (Helper Functions) - 修正版
// ==========================================================================

function showSaveForm(place) {
    /**
     * 新規保存フォーム。
     * ID重複を避けるため、querySelectorで取得できるようクラスを付与。
     */
    const content = `
        <div class="info-window-form">
            <strong>📍 ${place.name}</strong>
            <label class="file-input-label">📷 写真を追加
                <input type="file" id="image-input" accept="image/*" style="display:none" onchange="previewImage(this)">
            </label>
            <img id="popup-preview" style="width:100%; display:none; margin-bottom:10px; border-radius:5px;">
            <div style="margin-bottom:8px;">
                <span style="font-size:0.85rem; color:#666;">評価 (1-5):</span>
                <input type="number" id="score-input" value="5" min="1" max="5" style="width:50px; float:right;">
            </div>
            <textarea id="memo-input" placeholder="攻略メモ..." style="width:100%; margin-bottom:8px;"></textarea>
            <button onclick="saveLocation('${place.name}', ${place.geometry.location.lat()}, ${place.geometry.location.lng()})" class="save-btn">攻略完了</button>
        </div>`;
    infowindow.setContent(content);
    infowindow.setPosition(place.geometry.location);
    infowindow.open(map);
}
function previewImage(input) {
    /**
     * InfoWindow内のプレビュー要素を確実に特定して表示。
     */
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            // 現在のInfoWindow内のimgタグを探す
            const iwContainer = document.querySelector('.info-window-form');
            const img = iwContainer ? iwContainer.querySelector("#popup-preview") : null;
            if (img) {
                img.src = e.target.result; 
                img.style.display = "block";
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function showSaveForm(place) {
    /**
     * 場所検索後に表示される新規保存用フォーム。
     */
    const content = `
        <div class="info-window-form">
            <strong>📍 ${place.name}</strong>
            <label class="file-input-label">📷 写真を追加
                <input type="file" id="image-input" accept="image/*" style="display:none" onchange="previewImage(this)">
            </label>
            <img id="popup-preview" style="width:100%; display:none; margin-bottom:10px; border-radius:5px;">
            <div style="margin-bottom:8px;">
                <span style="font-size:0.85rem; color:#666;">評価 (1-5):</span>
                <input type="number" id="score-input" value="5" min="1" max="5" style="width:50px; float:right;">
            </div>
            <textarea id="memo-input" placeholder="攻略メモ..." style="width:100%; margin-bottom:8px;"></textarea>
            <button onclick="saveLocation('${place.name}', ${place.geometry.location.lat()}, ${place.geometry.location.lng()})" class="save-btn">攻略完了</button>
        </div>`;
    infowindow.setContent(content);
    infowindow.setPosition(place.geometry.location);
    infowindow.open(map);
}

function sortTable(key) {
    /**
     * リストをキー（評価順など）でソート。
     */
    if (currentSort.key === key) currentSort.asc = !currentSort.asc;
    else { currentSort.key = key; currentSort.asc = (key === 'kids_score' ? false : true); }
    
    document.querySelectorAll('.sort-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`sort-${key}`);
    if (activeBtn) activeBtn.classList.add('active');
    
    allLocations.sort((a, b) => {
        let vA = a[key], vB = b[key];
        return currentSort.asc ? (vA > vB ? 1 : -1) : (vA < vB ? 1 : -1);
    });
    renderList();
}

function showTooltipWithMarker(marker, name, memo, score) {
    const stars = "⭐".repeat(score);
    const content = `
        <div style="padding: 5px; min-width: 150px; line-height: 1.4;">
            <strong style="font-size: 1rem;">${name}</strong><br>
            <span style="color: #f39c12;">${stars}</span>
            <div style="margin-top: 5px; font-size: 0.85rem; color: #555; white-space: pre-wrap;">${memo}</div>
        </div>`;
    infowindow.setOptions({
        pixelOffset: new google.maps.Size(0, 10) 
    });
    infowindow.setContent(content);
    
   
    infowindow.open(map, marker);
}

function focusOnMap(lat, lng, name, memo, score) {
    const pos = { lat: parseFloat(lat), lng: parseFloat(lng) };
    map.panTo(pos);
    map.setZoom(17);

    const stars = "⭐".repeat(score);
    const content = `
        <div style="padding: 5px; min-width: 150px;">
            <strong style="font-size: 1rem;">${name}</strong><br>
            <span style="color: #f39c12;">${stars}</span>
            <p style="margin-top: 5px; font-size: 0.85rem;">${memo}</p>
        </div>`;
    infowindow.setContent(content);


    infowindow.setOptions({
        pixelOffset: new google.maps.Size(0, -20) 
    });
    
    infowindow.setPosition(pos);
    infowindow.open(map);
}

// ページロード完了時に地図を初期化
google.maps.event.addDomListener(window, "load", initMap);

// ページロード時にPWAサービスワーカーを登録（jsフォルダ内にあるためscopeを指定）
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })  // 
    .then(() => console.log('PWA登録成功！'))
    .catch((err) => console.error('PWA登録失敗:', err));
}