let map;
let infowindow;
let allLocations = [];
let currentSort = { key: null, asc: true };
const API_BASE_URL = ""; 

function initMap() {
    const defaultPos = { lat: 35.6812, lng: 139.7671 };
    map = new google.maps.Map(document.getElementById("map"), {
        center: defaultPos, zoom: 14, disableDefaultUI: true, zoomControl: true,
    });
    infowindow = new google.maps.InfoWindow({
        pixelOffset: new google.maps.Size(0, -30) 
    });;
    const input = document.getElementById("pac-input");
    const autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.bindTo("bounds", map);
    autocomplete.addListener("place_changed", () => {
        infowindow.close();
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) return;
        if (place.geometry.viewport) map.fitBounds(place.geometry.viewport);
        else { map.setCenter(place.geometry.location); map.setZoom(17); }
        showSaveForm(place);
    });
    loadData();
}

function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById("popup-preview");
            img.src = e.target.result; img.style.display = "block";
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function showSaveForm(place) {
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

// 地図上のピンに詳細を表示する関数を新規作成
// 引数に score を追加
function focusOnMap(lat, lng, name, memo, score) {
    const pos = { lat: lat, lng: lng };
    map.panTo(pos);
    map.setZoom(17);
    
    // スコアに応じて星の文字列を作成
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

async function saveLocation(name, lat, lng) {
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

    const res = await fetch(`${API_BASE_URL}/save-location`, { method: 'POST', body: formData });
    if (res.ok) { infowindow.close(); loadData(); }
}

// 【新規】地図を動かさずに吹き出しだけ出す関数
function showTooltip(lat, lng, name, memo, score) {
    const pos = { lat: lat, lng: lng };
    const stars = "⭐".repeat(score || 0);
    
    infowindow.setContent(`
        <div style="padding:5px; min-width:150px;">
            <strong style="display:block; font-size:1rem; margin-bottom:3px;">📍 ${name}</strong>
            <div style="color:#ff9800; margin-bottom:5px;">${stars}</div>
            <div style="font-size:0.8rem; color:#666;">${memo.substring(0, 30)}...</div>
        </div>
    `);
    infowindow.setPosition(pos);
    infowindow.open(map);
}

async function loadData() {
    const res = await fetch(`${API_BASE_URL}/get-locations`);
    allLocations = await res.json();
    
    allLocations.forEach(loc => {
        const marker = new google.maps.Marker({ 
            position: { lat: loc.lat, lng: loc.lng }, 
            map: map, 
            title: loc.name 
        });

        // マウスを乗せた時：即座に表示
        marker.addListener("mouseover", () => {
            showTooltipWithMarker(marker, loc.name, loc.memo || '', loc.kids_score);
        });

        // マウスを外した時：閉じる
        marker.addListener("mouseout", () => {
            infowindow.close();
        });

        // クリックした時：リストへスクロール 
        // （クリックして詳細を見たい場合、mouseoutで閉じないように工夫が必要なら後ほど調整）
        marker.addListener("click", () => {
            const card = document.getElementById(`card-${loc.name}`);
            if (card) card.scrollIntoView({ behavior: 'smooth' });
            
            // 地図もその場所にフォーカスしたい場合は以下を追加
            map.panTo(marker.getPosition());
            map.setZoom(17);
        });
    });

    renderList();
}

// 新しい表示用関数
// 1. 表示用の関数を「マーカー紐付け型」に修正
function showTooltipWithMarker(marker, name, memo, score) {
    const stars = "⭐".repeat(score || 0);
    infowindow.setContent(`
        <div style="padding:0px 2px; min-width:120px; line-height: 1.2;cursor:default;">
            <strong style="display:block; font-size:0.9rem;margin: 0 0 1px 0; padding-right: 15px;;">📍 ${name}</strong>
            <div style="color:#ff9800; font-size:0.8rem;margin-bottom:2px;">${stars}</div>
            <div style="font-size:0.75rem; color:#666;white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${memo}</div>
        </div>
    `);
    
    // 座標ではなく、マーカー（ピン）を指定して開く
    // これでGoogleマップ側が「ピンの少し上」に自動配置してくれます
    infowindow.open(map, marker);
}
function renderList() {
    const container = document.getElementById('card-list');
    container.innerHTML = '';
    allLocations.forEach(loc => {
        const card = document.createElement('div');
        card.className = 'log-card';
        card.id = `card-${loc.name}`; // スクロール用にIDが必要

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

async function deleteLocation(name) {
    if (!confirm(`${name} を削除しますか？`)) return;
    const res = await fetch(`${API_BASE_URL}/delete-location?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (res.ok) loadData();
}

async function editLocation(name, currentScore, currentMemo) {
    const inputScore = prompt(`${name} の評価(1-5)`, currentScore);
    const inputMemo = prompt("メモ", currentMemo);
    if (inputScore === null || inputMemo === null) return;
    const res = await fetch(`${API_BASE_URL}/update-location`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, kids_score: parseInt(inputScore), memo: inputMemo })
    });
    if (res.ok) loadData();
}

function sortTable(key) {
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

google.maps.event.addDomListener(window, "load", initMap);