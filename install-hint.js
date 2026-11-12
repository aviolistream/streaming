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
      '#ih-box img{width:44px;height:44px;border-radius:10px;background:#fff;flex:none}' +
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

  var LOGOS = ['/icons/apple-touch-icon.png', '/icon-192.png', '/icons/icon-192.png', '/icons/icon-192x192.png', '/apple-touch-icon.png'];
  function loadLogo() {
    var img = box && box.querySelector('.ih-logo');
    if (!img) return;
    var i = 0;
    img.onerror = function () {
      i++;
      if (i < LOGOS.length) { img.src = LOGOS[i]; } else { img.style.display = 'none'; }
    };
    img.src = LOGOS[0];
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
