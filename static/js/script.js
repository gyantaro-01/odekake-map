/**
 * ITパパのお出かけ攻略MAP - Frontend Logic
 * 
 * 役割:
 * 1. Google Maps APIの初期化とコントロール
 * 2. Supabase(Backend経由)とのデータ同期
 * 3. ユーザーインターフェース(UI)の動的生成
 */

let map;
let infowindow;
let allLocations = [];
let currentSort = { key: null, asc: true };
const API_BASE_URL = ""; 

// ==========================================================================
// 1. 地図初期化・コア設定 (Initialization)
// ==========================================================================

async function initMap() {
    /**
     * Googleマップを起動し、初期位置を設定。
     * 座標はセキュリティの観点からバックエンドの環境変数経由で取得。
     */
    let defaultPos = { lat: 35.6812, lng: 139.7671 }; // 取得失敗時のフォールバック(東京駅)
    
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const config = await response.json();
            defaultPos = { lat: config.lat, lng: config.lng };
        }
    } catch (error) {
        console.error("[Config] 座標の取得に失敗しました。デフォルト位置を使用します。", error);
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

        // 検索結果に移動（範囲がある場合はフィット、ない場合はピンポイント移動）
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
// 2. データ保存・更新関連 (Data Operations)
// ==========================================================================

async function saveLocation(name, lat, lng) {
    /**
     * 入力された情報をFormDataにまとめ、バックエンドへ送信。
     */
    const score = document.getElementById("score-input").value;
    const memo = document.getElementById("memo-input").value;
    const imageFile = document.getElementById("image-input").files[0];

    const formData = new FormData();
    formData.append("name", name);
    formData.append("lat", lat);
    formData.append("lng", lng);
    formData.append("kids_score", parseInt(score));
    formData.append("memo", memo || "");
    if (imageFile) formData.append("image", imageFile);

    const res = await fetch(`${API_BASE_URL}/save-location`, { 
        method: 'POST', 
        body: formData 
    });
    
    if (res.ok) { 
        infowindow.close(); 
        loadData(); // リストとピンを再読み込み
    }
}

async function update_location_call(name, currentScore, currentMemo) {
    /**
     * 既存スポット情報の更新（評価・メモ）。
     */
    const inputScore = prompt(`${name} の評価(1-5)`, currentScore);
    const inputMemo = prompt("メモ", currentMemo);
    
    if (inputScore === null || inputMemo === null) return;

    const res = await fetch(`${API_BASE_URL}/update-location`, {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, kids_score: parseInt(inputScore), memo: inputMemo })
    });
    
    if (res.ok) loadData();
}

async function deleteLocation(name) {
    /**
     * スポットの削除を実行。
     */
    if (!confirm(`${name} を削除しますか？`)) return;
    const res = await fetch(`${API_BASE_URL}/delete-location?name=${encodeURIComponent(name)}`, { 
        method: 'DELETE' 
    });
    
    if (res.ok) loadData();
}

// ==========================================================================
// 3. 地図・UI描画ロジック (Rendering)
// ==========================================================================

async function loadData() {
    /**
     * バックエンドから全データを取得し、地図上のピンを生成。
     */
    const res = await fetch(`${API_BASE_URL}/get-locations`);
    allLocations = await res.json();
    
    allLocations.forEach(loc => {
        const marker = new google.maps.Marker({ 
            position: { lat: loc.lat, lng: loc.lng }, 
            map: map, 
            title: loc.name 
        });

        // マウスオーバー：簡易情報を表示
        marker.addListener("mouseover", () => {
            showTooltipWithMarker(marker, loc.name, loc.memo || '', loc.kids_score);
        });

        // マウスアウト：情報を閉じる
        marker.addListener("mouseout", () => {
            infowindow.close();
        });

        // クリック：該当するリストカードへスクロール
        marker.addListener("click", () => {
            const card = document.getElementById(`card-${loc.name}`);
            if (card) card.scrollIntoView({ behavior: 'smooth' });
            
            map.panTo(marker.getPosition());
            map.setZoom(17);
        });
    });

    renderList();
}

function renderList() {
    /**
     * 画面下部の「攻略済みスポット一覧」を生成。
     */
    const container = document.getElementById('card-list');
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
                <button onclick="editLocation('${loc.name}', ${loc.kids_score}, '${loc.memo || ''}')" style="flex:1; background:#28a745; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer;">編集</button>
                <button onclick="deleteLocation('${loc.name}')" style="flex:1; background:#dc3545; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer;">削除</button>
            </div>`;
        container.appendChild(card);
    });
}

// ==========================================================================
// 4. ヘルパー関数 (Helper Functions)
// ==========================================================================

function showTooltipWithMarker(marker, name, memo, score) {
    /**
     * 地図上のピンに紐づくツールチップ（吹き出し）を表示。
     */
    const stars = "⭐".repeat(score || 0);
    infowindow.setContent(`
        <div style="padding:0px 2px; min-width:120px; line-height: 1.2; cursor:default;">
            <strong style="display:block; font-size:0.9rem; margin: 0 0 1px 0; padding-right: 15px;">📍 ${name}</strong>
            <div style="color:#ff9800; font-size:0.8rem; margin-bottom:2px;">${stars}</div>
            <div style="font-size:0.75rem; color:#666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${memo}</div>
        </div>
    `);
    infowindow.open(map, marker);
}

function focusOnMap(lat, lng, name, memo, score) {
    /**
     * リストクリック時に地図を該当地点へスムーズに移動。
     */
    const pos = { lat: lat, lng: lng };
    map.panTo(pos);
    map.setZoom(17);
    
    const stars = "⭐".repeat(score || 0);
    infowindow.setContent(`
        <div style="padding:5px; min-width:150px;">
            <strong style="display:block; font-size:1rem; margin-bottom:3px;">📍 ${name}</strong>
            <div style="color:#ff9800; margin-bottom:5px;">${stars}</div>
            <div style="font-size:0.8rem; color:#666; line-height:1.4;">${memo}</div>
        </div>
    `);
    infowindow.setPosition(pos);
    infowindow.open(map);
}

function previewImage(input) {
    /**
     * 画像選択時に即座にプレビューを表示（FileReader API使用）。
     */
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById("popup-preview");
            img.src = e.target.result; 
            img.style.display = "block";
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function showSaveForm(place) {
    /**
     * 場所検索後に表示される新規保存用フォームのテンプレートを生成。
     */
    const content = `
        <div class="info-window-form">
            <strong>📍 ${place.name}</strong>
            <label class="file-input-label">📷 写真を追加
                <input type="file" id="image-input" accept="image/*" style="display:none" onchange="previewImage(this)">
            </label>
            <img id="popup-preview">
            <div style="margin-bottom:8px;">
                <span style="font-size:0.85rem; color:#666;">評価 (1-5):</span>
                <input type="number" id="score-input" value="5" min="1" max="5" style="width:50px; float:right;">
            </div>
            <textarea id="memo-input" placeholder="攻略メモ..."></textarea>
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
    document.getElementById(`sort-${key}`).classList.add('active');
    
    allLocations.sort((a, b) => {
        let vA = a[key], vB = b[key];
        return currentSort.asc ? (vA > vB ? 1 : -1) : (vA < vB ? 1 : -1);
    });
    renderList();
}

// ページロード完了時に地図を初期化
google.maps.event.addDomListener(window, "load", initMap);