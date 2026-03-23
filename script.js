// 定数・初期設定

// URLパラメータから座標を取得する仕組み
const urlParams = new URLSearchParams(window.location.search);
const latParam  = urlParams.get('lat');
const lngParam  = urlParams.get('lng');

// 座標の決定（URLにあればそれ、なければ東京駅）
let HOME = (latParam && lngParam) 
    ? { lat: parseFloat(latParam), lng: parseFloat(lngParam), name: "マイホーム（URL指定）" }
    : { lat: 35.6812, lng: 139.7671, name: "基準地点（東京駅）" };

// 以降、既存の map 初期化コードなど...
const map = L.map('map').setView([35.6, 139.7], 9);

/** OpenStreetMap（OSM）の地図を使う版 commented out by gemini
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 18
}).addTo(map);
**/

// OpenStreetMapの代わりに国土地理院の地図を使う
L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
  attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>',
  maxZoom: 18
}).addTo(map);


const homeIcon = L.divIcon({
  html: '<div style="background:#185FA5;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  className: '', iconAnchor: [7, 7]
});

const eqIcon = L.divIcon({
  html: '<div style="background:#D85A30;width:18px;height:18px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  className: '', iconAnchor: [9, 9]
});

// 自宅（拠点）マーカーを保持する変数 changed by gemini
let homeMarker = L.marker([HOME.lat, HOME.lng], { icon: homeIcon }).addTo(map)
  .bindPopup('<b>' + HOME.name + '</b>');

let eqMarker = null, linePath = null, quakes = [];

// 拠点を更新する関数 added by gemini
function updateHome() {
  const newLat = parseFloat(document.getElementById('home-lat').value);
  const newLng = parseFloat(document.getElementById('home-lng').value);

  if (isNaN(newLat) || isNaN(newLng)) {
    alert("正しい数値を入力してください");
    return;
  }

  // データを更新
  HOME.lat = newLat;
  HOME.lng = newLng;

  // マーカーの位置を更新
  homeMarker.setLatLng([newLat, newLng]);
  map.panTo([newLat, newLng]);

  // リストの距離表示を再計算するために再読み込み
  loadQuakes();
}

// 2点間の距離を計算 (km)
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, r = Math.PI / 180;
  const dLa = (lat2 - lat1) * r, dLo = (lng2 - lng1) * r;
  const a = Math.sin(dLa/2)**2 + Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dLo/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// 日時フォーマット
function fmt(iso) {
  const d = new Date(iso);
  return (d.getMonth()+1) + '/' + d.getDate() + ' ' +
    String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

// 距離ラベル
function distLabel(d) {
  return d < 5 ? '⚠ かなり近い' : d < 15 ? '近め' : d < 30 ? 'やや遠め' : d < 60 ? '遠め' : 'かなり遠い';
}

// 地震の選択処理
function selectQuake(i) {
  const q = quakes[i];
  const h = q.earthquake && q.earthquake.hypocenter;
  if (!h || !h.latitude || h.latitude === -200) return;

  document.querySelectorAll('.eq-item').forEach((el, j) => el.classList.toggle('active', i === j));
  
  if (eqMarker) map.removeLayer(eqMarker);
  if (linePath) map.removeLayer(linePath);

  eqMarker = L.marker([h.latitude, h.longitude], { icon: eqIcon }).addTo(map)
    .bindPopup('<b>' + (h.name || '震央') + '</b><br>M' + (h.magnitude || '?') + '　深さ ' + (h.depth >= 0 ? h.depth : '?') + ' km')
    .openPopup();

  linePath = L.polyline([[HOME.lat, HOME.lng], [h.latitude, h.longitude]], {
    color: '#D85A30', weight: 2, dashArray: '5,5', opacity: 0.7
  }).addTo(map);

  map.fitBounds([[HOME.lat, HOME.lng], [h.latitude, h.longitude]], { padding: [50, 50] });

  const dist = haversine(HOME.lat, HOME.lng, h.latitude, h.longitude);
  document.getElementById('result-bar').innerHTML =
    '<span class="tag tag-eq">震央</span>' +
    '<b>' + (h.name || '不明') + '</b>' +
    '　<span style="font-size:15px;font-weight:500">' + dist.toFixed(1) + ' km</span>' +
    '　<span style="color:#888;font-size:12px">' + distLabel(dist) + '</span>';
}

// ボタンにイベントを登録 added by gemini
document.getElementById('update-home-btn').addEventListener('click', updateHome);

// データ取得
async function loadQuakes() {
  const listEl = document.getElementById('eq-list');
  const updatedEl = document.getElementById('updated');
  
  listEl.innerHTML = '<div class="loading">取得中...</div>';
  updatedEl.textContent = '取得中...';

  try {
    const res = await fetch('https://api.p2pquake.net/v2/history?codes=551&limit=10');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    quakes = await res.json();

    const now = new Date();
    updatedEl.textContent = '更新: ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

    listEl.innerHTML = '';
    quakes.forEach((q, i) => {
      const h = q.earthquake && q.earthquake.hypocenter;
      const hasCoord = h && h.latitude && h.latitude !== -200;
      const dist = hasCoord ? haversine(HOME.lat, HOME.lng, h.latitude, h.longitude) : null;
      const mag = h && h.magnitude > 0 ? 'M' + h.magnitude : 'M?';
      const place = (h && h.name) || '震源不明';
      const time = q.earthquake && q.earthquake.time ? fmt(q.earthquake.time) : '';

      const div = document.createElement('div');
      div.className = 'eq-item';
      div.innerHTML =
        '<span class="eq-mag">' + mag + '</span>' +
        '<div class="eq-info">' +
          '<div class="eq-place">' + place + '</div>' +
          '<div class="eq-time">' + time + '</div>' +
        '</div>' +
        (dist !== null ? '<span class="dist-badge">' + dist.toFixed(0) + ' km</span>' : '');

      if (hasCoord) {
        div.onclick = () => selectQuake(i);
      } else {
        div.style.opacity = '0.5';
      }
      listEl.appendChild(div);
    });

    if (quakes.length > 0) selectQuake(0);
  } catch(e) {
    listEl.innerHTML = '<div class="error">取得失敗: ' + e.message + '</div>';
    updatedEl.textContent = '取得失敗';
  }
}

// ボタンのクリックイベント登録
document.getElementById('reload-btn').addEventListener('click', loadQuakes);

// 初期読み込み
loadQuakes();
