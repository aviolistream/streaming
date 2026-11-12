/* AvioliStream - popup d'installation de l'app (Android + iPhone/iPad) */
(function () {
  'use strict';

  var KEY = 'avioli_install_hint_dismissed';
  var HOURS = 24;
  var DELAY = 4000;

  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);
  if (!isIOS && !isAndroid) return;

  // Deja installee (ouverte depuis l'ecran d'accueil)
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
  if (standalone) return;

  function dismissedRecently() {
    try {
      var t = parseInt(localStorage.getItem(KEY) || '0', 10);
      return !!t && Date.now() - t < HOURS * 3600000;
    } catch (e) { return false; }
  }
  function remember() {
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
  }
  if (dismissedRecently()) return;

  // Navigateurs integres (Instagram, Facebook, TikTok...) et autres cas ou l'install est impossible
  var inApp = /FBAN|FBAV|Instagram|TikTok|musical_ly|Snapchat|Twitter|Line\/|; wv\)/i.test(ua);
  var iosOtherBrowser = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);

  var deferred = null;
  var box = null;
  var shown = false;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (shown) render(); // le popup manuel passe en bouton "Installer"
  });
  window.addEventListener('appinstalled', function () {
    remember();
    close();
  });

  function css() {
    if (document.getElementById('ih-style')) return;
    var s = document.createElement('style');
    s.id = 'ih-style';
    s.textContent =
      '#ih-box{position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;max-width:440px;margin:0 auto;' +
      'background:#14181c;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:18px;' +
      'padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));box-shadow:0 12px 40px rgba(0,0,0,.45);' +
      'font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;animation:ihUp .35s ease both}' +
      '@keyframes ihUp{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}' +
      '#ih-box .ih-top{display:flex;align-items:center;gap:12px;margin-bottom:10px}' +
      '#ih-box img{width:44px;height:44px;border-radius:12px;background:#fff;flex:none}' +
      '#ih-box .ih-t{font-family:Sora,Inter,system-ui,sans-serif;font-weight:700;font-size:16px;line-height:1.25}' +
            '#ih-box ol{margin:8px 0 12px;padding-left:20px;font-size:14px;line-height:1.5;color:#e6ecef}' +
      '#ih-box li{margin:3px 0}' +
      '#ih-box p{margin:6px 0 12px;font-size:14px;line-height:1.5;color:#e6ecef}' +
      '#ih-box .ih-row{display:flex;gap:10px}' +
      '#ih-box button{flex:1;border:0;border-radius:12px;padding:12px 14px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit}' +
      '#ih-box .ih-main{background:#FF3131;color:#fff}' +
      '#ih-box .ih-alt{background:rgba(255,255,255,.1);color:#fff}' +
      '#ih-x{position:absolute;top:8px;right:10px;background:none!important;border:0;color:#9aa5ab!important;font-size:22px!important;line-height:1;padding:4px 8px!important;flex:none!important;width:auto}';
    document.head.appendChild(s);
  }

  function close() {
    if (box && box.parentNode) box.parentNode.removeChild(box);
    box = null;
    shown = false;
  }

  function header(title) {
    return '<button id="ih-x" aria-label="Fermer">\u00d7</button>' +
      '<div class="ih-top"><img class="ih-logo" alt="" width="44" height="44">' +
      '<div class="ih-t">' + title + '</div></div>';
  }

  var LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAu4AAALuCAIAAAB+fwSdAAAACXBIWXMAABYlAAAWJQFJUiTwAAAE8mlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSfvu78nIGlkPSdXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQnPz4KPHg6eG1wbWV0YSB4bWxuczp4PSdhZG9iZTpuczptZXRhLyc+CjxyZGY6UkRGIHhtbG5zOnJkZj0naHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyc+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczpBdHRyaWI9J2h0dHA6Ly9ucy5hdHRyaWJ1dGlvbi5jb20vYWRzLzEuMC8nPgogIDxBdHRyaWI6QWRzPgogICA8cmRmOlNlcT4KICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0nUmVzb3VyY2UnPgogICAgIDxBdHRyaWI6Q3JlYXRlZD4yMDI1LTA5LTAyPC9BdHRyaWI6Q3JlYXRlZD4KICAgICA8QXR0cmliOkV4dElkPjQyN2M3ODc0LWU4YzYtNDA4Ni1hYjRiLWRiMjY2MzhlNjg2MjwvQXR0cmliOkV4dElkPgogICAgIDxBdHRyaWI6RmJJZD41MjUyNjU5MTQxNzk1ODA8L0F0dHJpYjpGYklkPgogICAgIDxBdHRyaWI6VG91Y2hUeXBlPjI8L0F0dHJpYjpUb3VjaFR5cGU+CiAgICA8L3JkZjpsaT4KICAgPC9yZGY6U2VxPgogIDwvQXR0cmliOkFkcz4KIDwvcmRmOkRlc2NyaXB0aW9uPgoKIDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PScnCiAgeG1sbnM6ZGM9J2h0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvJz4KICA8ZGM6dGl0bGU+CiAgIDxyZGY6QWx0PgogICAgPHJkZjpsaSB4bWw6bGFuZz0neC1kZWZhdWx0Jz5sb2dvIGF2aW9saXN0cmVhbSAtIDE8L3JkZjpsaT4KICAgPC9yZGY6QWx0PgogIDwvZGM6dGl0bGU+CiA8L3JkZjpEZXNjcmlwdGlvbj4KCiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0nJwogIHhtbG5zOnBkZj0naHR0cDovL25zLmFkb2JlLmNvbS9wZGYvMS4zLyc+CiAgPHBkZjpBdXRob3I+T2xrZWR5PC9wZGY6QXV0aG9yPgogPC9yZGY6RGVzY3JpcHRpb24+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczp4bXA9J2h0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8nPgogIDx4bXA6Q3JlYXRvclRvb2w+Q2FudmEgZG9jPURBR3ZrNC05c0JBIHVzZXI9VUFFSk9RY3ZBQkkgYnJhbmQ9UHJpbmNldG9uIFBoaWxsaXAmIzM5O3MgQ2xhc3MgdGVtcGxhdGU9Qmx1ZSBhbmQgR3JleSBNb2Rlcm4gTXVsdGltZWRpYSBUViBQb2RjYXN0IFBsYXkgTG9nbzwveG1wOkNyZWF0b3JUb29sPgogPC9yZGY6RGVzY3JpcHRpb24+CjwvcmRmOlJERj4KPC94OnhtcG1ldGE+Cjw/eHBhY2tldCBlbmQ9J3InPz7U9BgtAAAgAElEQVR4nO3dh7sTZf434PdPci1r112xILpiR1xcFVCURQVFsTcsC9gFu9iwiwiube2KDURFfyDYFUFQiiAiRcg74eDxcErypJ05X3Lf1+fy8tJkZpKTzPNJ8szM/ysAAIT1//LeAACA6qkyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBg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QGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAASmygAAgakyAEBgqgwAEJgqAwAEpsoAAIGpMgBAYKoMABCYKgMABKbKAACBqTIAQGCqDAAQmCoDAAT2/wE7jQus64g0IAAAAABJRU5ErkJggg==';
  function loadLogo() {
    var img = box && box.querySelector('.ih-logo');
    if (img) img.src = LOGO;
  }

  function html() {
    var h;
    if (inApp) {
      var nav = isIOS ? 'Safari' : 'Chrome';
      h = header('Ouvrir dans ' + nav) +
        '<p>Appuyez sur les <b>\u22ef</b> ou <b>\u22ee</b> en haut ou en bas de l\u2019\u00e9cran, puis sur <b>\u00ab Ouvrir dans ' + nav + ' \u00bb</b>.</p>' +
        '<div class="ih-row"><button class="ih-alt" data-a="later">Compris</button></div>';
    } else if (isIOS && iosOtherBrowser) {
      h = header('Ouvrir dans Safari') +
        '<p>Sur iPhone, l\u2019installation se fait depuis <b>Safari</b>. Copiez ce lien et ouvrez-le dans Safari.</p>' +
        '<div class="ih-row"><button class="ih-alt" data-a="later">Compris</button></div>';
    } else if (isIOS) {
      h = header('Installer AvioliStream App') +
        '<ol><li>Appuyez sur <b>Partager</b> (le carr\u00e9 avec une fl\u00e8che \u2B06\uFE0F)</li>' +
        '<li>Choisissez <b>\u00ab Sur l\u2019\u00e9cran d\u2019accueil \u00bb</b></li>' +
        '<li>Appuyez sur <b>Ajouter</b></li></ol>' +
        '<div class="ih-row"><button class="ih-alt" data-a="later">Plus tard</button></div>';
    } else if (deferred) {
      h = header('Installer AvioliStream App') +
        '<div class="ih-row"><button class="ih-alt" data-a="later">Plus tard</button>' +
        '<button class="ih-main" data-a="install">Installer</button></div>';
    } else {
      h = header('Installer AvioliStream App') +
        '<ol><li>Ouvrez le menu <b>\u22ee</b> de votre navigateur</li>' +
        '<li>Appuyez sur <b>\u00ab Installer l\u2019application \u00bb</b> ou <b>\u00ab Ajouter \u00e0 l\u2019\u00e9cran d\u2019accueil \u00bb</b></li></ol>' +
        '<div class="ih-row"><button class="ih-alt" data-a="later">Plus tard</button></div>';
    }
    return h;
  }

  function render() {
    css();
    if (!box) {
      box = document.createElement('div');
      box.id = 'ih-box';
      box.setAttribute('role', 'dialog');
      document.body.appendChild(box);
      box.addEventListener('click', function (ev) {
        var t = ev.target;
        if (t.id === 'ih-x' || (t.getAttribute && t.getAttribute('data-a') === 'later')) {
          remember();
          close();
        } else if (t.getAttribute && t.getAttribute('data-a') === 'install' && deferred) {
          var d = deferred;
          deferred = null;
          d.prompt();
          if (d.userChoice && d.userChoice.then) {
            d.userChoice.then(function () { remember(); close(); });
          } else { remember(); close(); }
        }
      });
    }
    box.innerHTML = html();
    loadLogo();
    shown = true;
  }

  function start() {
    setTimeout(function () {
      if (dismissedRecently() || !document.body) return;
      render();
    }, DELAY);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
