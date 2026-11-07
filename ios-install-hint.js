/*
 * AvioliStream — aide à l'installation de l'application sur iPhone / iPad
 *
 * Pourquoi : Safari sur iOS n'a pas de bouton d'installation automatique (l'évènement
 * "beforeinstallprompt" n'existe pas). Ce script affiche à la place une petite fenêtre qui
 * explique les 3 étapes : Partager -> "Sur l'écran d'accueil" -> Ajouter.
 *
 * Il ne s'affiche que :
 *  - sur iPhone / iPad (jamais sur Android ni ordinateur : l'ancien popup n'est pas touché),
 *  - si l'app n'est PAS déjà installée (mode "standalone"),
 *  - si le client ne l'a pas déjà fermée dans les 7 derniers jours.
 *
 * Utilisation : <script src="/ios-install-hint.js" defer></script> avant </body>.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'avioli-ios-install-dismissed';
  var HIDE_DAYS = 7;
  var SHOW_DELAY_MS = 4000;

  // --- iPhone / iPad (iPadOS se présente comme un Mac avec écran tactile) ---
  var ua = navigator.userAgent || '';
  var isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) return;

  // --- App déjà installée ? ---
  var isStandalone =
    window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  if (isStandalone) return;

  // --- Déjà fermée récemment ? ---
  try {
    var last = Number(localStorage.getItem(STORAGE_KEY) || 0);
    if (last && Date.now() - last < HIDE_DAYS * 86400000) return;
  } catch (e) {}

  // --- Navigateurs intégrés (Instagram, Facebook, TikTok...) : pas d'installation possible ---
  var inAppBrowser = /FBAN|FBAV|Instagram|Line\/|TikTok|musical_ly|Snapchat|Twitter|MicroMessenger/i.test(ua);
  // Chrome / Firefox / Edge sur iOS : le menu Partager existe aussi, mais le bouton est en haut ou en bas selon le cas
  var isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(ua);
  var isIPad = /ipad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function dismiss(root) {
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch (e) {}
    root.classList.remove('avioli-ios-open');
    setTimeout(function () { if (root.parentNode) root.parentNode.removeChild(root); }, 300);
  }

  function build() {
    if (document.getElementById('avioli-ios-install')) return;

    var style = document.createElement('style');
    style.textContent =
      '#avioli-ios-install{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;' +
      'padding:0 12px calc(12px + env(safe-area-inset-bottom));pointer-events:none;' +
      'transform:translateY(120%);transition:transform .3s ease;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;}' +
      '#avioli-ios-install.avioli-ios-open{transform:translateY(0);}' +
      '#avioli-ios-install .ai-card{pointer-events:auto;max-width:420px;margin:0 auto;background:#1b1e22;color:#f1f1f2;' +
      'border:1px solid #2a2d32;border-radius:18px;padding:16px 16px 14px;box-shadow:0 18px 40px -10px rgba(0,0,0,.6);position:relative;}' +
      '#avioli-ios-install .ai-head{display:flex;align-items:center;gap:12px;margin-bottom:12px;padding-right:28px;}' +
      '#avioli-ios-install .ai-icon{width:44px;height:44px;border-radius:10px;flex-shrink:0;background:#0f1113;object-fit:cover;}' +
      '#avioli-ios-install .ai-title{font-weight:700;font-size:15px;line-height:1.25;}' +
      '#avioli-ios-install .ai-sub{font-size:12.5px;color:#9ca1ac;margin-top:2px;line-height:1.35;}' +
      '#avioli-ios-install .ai-close{position:absolute;top:8px;right:8px;width:32px;height:32px;border:none;background:transparent;' +
      'color:#9ca1ac;font-size:22px;line-height:1;cursor:pointer;border-radius:50%;}' +
      '#avioli-ios-install ol{list-style:none;margin:0 0 12px;padding:0;counter-reset:ai;}' +
      '#avioli-ios-install li{counter-increment:ai;display:flex;align-items:center;gap:10px;font-size:13.5px;line-height:1.4;padding:7px 0;}' +
      '#avioli-ios-install li::before{content:counter(ai);flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#E50914;color:#fff;' +
      'font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;}' +
      '#avioli-ios-install li svg{width:20px;height:20px;vertical-align:-5px;margin:0 2px;}' +
      '#avioli-ios-install .ai-later{display:block;width:100%;border:1px solid #2a2d32;background:transparent;color:#f1f1f2;' +
      'border-radius:10px;padding:10px;font-size:13.5px;font-weight:600;cursor:pointer;}' +
      '#avioli-ios-install .ai-warn{font-size:13px;color:#f5a524;line-height:1.45;margin:0 0 12px;}' +
      '#avioli-ios-install .ai-arrow{text-align:center;color:#9ca1ac;font-size:18px;margin-top:6px;line-height:1;}' +
      '@media (prefers-reduced-motion:reduce){#avioli-ios-install{transition:none;}}';
    document.head.appendChild(style);

    var shareSvg =
      '<svg viewBox="0 0 24 24" fill="none" stroke="#0a84ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
    var plusSvg =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>';

    var body;
    if (inAppBrowser) {
      body =
        '<p class="ai-warn">Pour installer l\u2019application, ouvrez ce site dans <b>Safari</b> : appuyez sur ' +
        'les trois points ou sur l\u2019ic\u00f4ne de navigateur, puis \u00ab Ouvrir dans Safari \u00bb.</p>';
    } else {
      body =
        '<ol>' +
        '<li><span>Appuyez sur le bouton <b>Partager</b> ' + shareSvg + (isIPad || !isSafari ? ' (en haut ou en bas de l\u2019\u00e9cran)' : ' (en bas de l\u2019\u00e9cran)') + '</span></li>' +
        '<li><span>Faites d\u00e9filer et choisissez <b>\u00ab Sur l\u2019\u00e9cran d\u2019accueil \u00bb</b> ' + plusSvg + '</span></li>' +
        '<li><span>Appuyez sur <b>Ajouter</b> en haut \u00e0 droite</span></li>' +
        '</ol>';
    }

    var root = document.createElement('div');
    root.id = 'avioli-ios-install';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Installer l\u2019application AvioliStream');
    root.innerHTML =
      '<div class="ai-card">' +
      '<button type="button" class="ai-close" aria-label="Fermer">\u00d7</button>' +
      '<div class="ai-head">' +
      '<img class="ai-icon" src="/icons/apple-touch-icon.png" alt="" width="44" height="44">' +
      '<div><div class="ai-title">Installer AvioliStream</div>' +
      '<div class="ai-sub">Acc\u00e9dez \u00e0 votre abonnement en un clic, depuis votre \u00e9cran d\u2019accueil.</div></div>' +
      '</div>' +
      body +
      '<button type="button" class="ai-later">Plus tard</button>' +
      (!isIPad && !inAppBrowser && isSafari ? '<div class="ai-arrow" aria-hidden="true">\u2193</div>' : '') +
      '</div>';

    document.body.appendChild(root);
    root.querySelector('.ai-close').addEventListener('click', function () { dismiss(root); });
    root.querySelector('.ai-later').addEventListener('click', function () { dismiss(root); });

    // Apparition douce
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.add('avioli-ios-open'); });
    });
  }

  function start() { setTimeout(build, SHOW_DELAY_MS); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
