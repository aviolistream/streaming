/*
 * AvioliStream — champ « Code promo » sur les pages produit
 *
 * Utilisation (avant </body>, après le script de la page) :
 *   <script src="/promo.js" data-platform="Netflix" data-plan="Premium" defer></script>
 *
 * Le script :
 *  - ajoute le champ « Code promo » au-dessus des boutons de paiement,
 *  - vérifie le code auprès de Supabase (fonction validate_promo),
 *  - affiche l'ancien prix barré et le nouveau prix,
 *  - expose window.avioliPromo.current() pour que le formulaire envoie le code avec la commande.
 * Le prix final est de toute façon recalculé côté serveur à la création de la commande.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var PLATFORM = (script && script.dataset.platform) || 'Netflix';
  var PLAN = (script && script.dataset.plan) || 'Premium';

  var form = document.getElementById('orderForm');
  var durationSelect = document.getElementById('duration');
  var priceAmount = document.getElementById('priceAmount');
  var btnFeda = document.getElementById('btnFeda');
  if (!form || !durationSelect || !priceAmount || !btnFeda) return;

  var client = (typeof supabaseClient !== 'undefined') ? supabaseClient : null;
  if (!client) return;

  var applied = null; // { code, discount, total }

  function fmt(n) { return Number(n).toLocaleString('fr-FR'); }

  // --- Style ---
  var style = document.createElement('style');
  style.textContent =
    '.promo-row{display:grid;grid-template-columns:1fr auto;gap:8px;}' +
    '.promo-row input{text-transform:uppercase;}' +
    '.btn-promo{padding:0 20px;border-radius:10px;border:1px solid var(--line);background:var(--bg-soft);color:var(--text);' +
    'font-family:var(--font-body);font-weight:600;font-size:.9rem;cursor:pointer;}' +
    '.btn-promo:hover{border-color:var(--accent);}' +
    '.btn-promo:disabled{opacity:.55;cursor:not-allowed;}' +
    '.promo-msg{font-size:.82rem;margin-top:6px;}' +
    '.promo-msg.ok{color:#22c55e;}' +
    '.promo-msg.error{color:#ef4444;}' +
    '.price-box .old{font-family:var(--font-mono);font-size:1rem;color:var(--muted);text-decoration:line-through;}';
  document.head.appendChild(style);

  // --- Champ code promo, juste avant les boutons de paiement ---
  var block = document.createElement('div');
  block.className = 'form-row';
  block.innerHTML =
    '<div>' +
    '<label class="field-label" for="promoCode">Code promo <span style="font-weight:400;">(facultatif)</span></label>' +
    '<div class="promo-row">' +
    '<input type="text" id="promoCode" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="30">' +
    '<button type="button" class="btn-promo" id="promoApply">Appliquer</button>' +
    '</div>' +
    '<div class="promo-msg" id="promoMsg" style="display:none;" role="status"></div>' +
    '</div>';
  btnFeda.parentNode.parentNode.insertBefore(block, btnFeda.parentNode);

  var input = document.getElementById('promoCode');
  var button = document.getElementById('promoApply');
  var msg = document.getElementById('promoMsg');

  // --- Ancien prix barré, à gauche du prix ---
  var oldEl = document.createElement('span');
  oldEl.className = 'old';
  oldEl.style.display = 'none';
  priceAmount.parentNode.insertBefore(oldEl, priceAmount);

  function show(type, text) {
    msg.className = 'promo-msg ' + type;
    msg.textContent = text;
    msg.style.display = 'block';
  }
  function hideMsg() { msg.style.display = 'none'; }

  function refresh() {
    var opt = durationSelect.options[durationSelect.selectedIndex];
    var base = Number(opt.dataset.price);
    if (applied) {
      oldEl.textContent = fmt(base);
      oldEl.style.display = 'inline';
      priceAmount.textContent = fmt(applied.total);
    } else {
      oldEl.style.display = 'none';
      priceAmount.textContent = fmt(base);
    }
  }

  function check(code) {
    var months = Number(durationSelect.value);
    return client
      .rpc('validate_promo', { p_code: code, p_platform: PLATFORM, p_plan: PLAN, p_months: months })
      .then(function (res) {
        if (res.error || !res.data) {
          return { valid: false, message: 'Impossible de vérifier le code pour le moment. Réessayez.' };
        }
        return res.data;
      })
      .catch(function () {
        return { valid: false, message: 'Impossible de vérifier le code pour le moment. Réessayez.' };
      });
  }

  function accept(r) {
    applied = { code: r.code, discount: r.discount, total: r.total };
    input.value = r.code;
    show('ok', 'Code ' + r.code + ' appliqué : −' + fmt(r.discount) + ' FCFA');
    refresh();
  }

  function apply() {
    if (input.disabled) return;
    var code = input.value.trim();
    if (!code) { show('error', 'Entrez un code promo.'); return; }
    var months = durationSelect.value;
    button.disabled = true;
    check(code).then(function (r) {
      button.disabled = false;
      if (months !== durationSelect.value) return; // la durée a changé entre-temps
      if (r.valid) {
        accept(r);
      } else {
        applied = null;
        show('error', r.message || 'Code promo invalide.');
        refresh();
      }
    });
  }

  button.addEventListener('click', apply);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); apply(); }
  });
  input.addEventListener('input', function () {
    input.value = input.value.toUpperCase().replace(/\s/g, '');
    if (applied && input.value !== applied.code) {
      applied = null;
      hideMsg();
      refresh();
    }
  });

  // Changement de durée : on revérifie le code pour afficher le bon prix
  durationSelect.addEventListener('change', function () {
    if (!applied) return;
    var code = applied.code;
    var months = durationSelect.value;
    applied = null;
    refresh();
    check(code).then(function (r) {
      if (months !== durationSelect.value) return;
      if (r.valid) { accept(r); }
      else { show('error', r.message || 'Code promo invalide.'); refresh(); }
    });
  });

  // Lien partageable : /netflix-premium?promo=AVIOLI applique le code automatiquement
  var urlPromo = new URLSearchParams(window.location.search).get('promo');
  if (urlPromo) {
    input.value = urlPromo.toUpperCase().replace(/\s/g, '');
    apply();
  }

  window.avioliPromo = {
    current: function () { return applied; },
    invalidate: function (text) {
      applied = null;
      refresh();
      show('error', text || 'Ce code promo n’est plus valable.');
    },
  };
})();
