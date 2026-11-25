/* ==========================================================================
   BLOND:ISH store — quick-buy modal + product page buy panel.
   Loaded ONLY by sections/blondish-header.liquid (BLOND:ISH templates only).
   ========================================================================== */
(function () {
  'use strict';

  if (window.BlondishStore) return;

  function money(cents) {
    try {
      if (window.theme && theme.Currency && theme.settings && theme.settings.moneyFormat) {
        return theme.Currency.formatMoney(cents, theme.settings.moneyFormat);
      }
    } catch (e) {}
    return '$' + (cents / 100).toFixed(2);
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readJSON(el) {
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  function hasRealOptions(product) {
    return !(product.variants.length === 1 && /^default title$/i.test(product.variants[0].title));
  }

  /* ---------- Cart ---------- */
  function addToCart(variantId, quantity) {
    return fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: quantity || 1 }] })
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.description || data.message || 'Could not add to cart');
        return data;
      });
    });
  }

  function openCart() {
    if (document.getElementById('CartDrawer')) {
      document.dispatchEvent(new CustomEvent('cart:build'));
      document.dispatchEvent(new CustomEvent('cart:open'));
    } else {
      window.location.href = '/cart';
    }
  }

  /* ---------- Gallery (zoom + thumbnails) ---------- */
  function Gallery(root) {
    this.root = root;
    this.main = root.querySelector('[data-bl-gallery-main]');
    this.img = this.main && this.main.querySelector('img');
    if (!this.main || !this.img) return;

    var self = this;
    this.main.addEventListener('click', function (e) {
      self.main.classList.toggle('is-zoomed');
      self.pan(e);
    });
    this.main.addEventListener('mousemove', function (e) { self.pan(e); });
    this.main.addEventListener('mouseleave', function () { self.main.classList.remove('is-zoomed'); });

    root.querySelectorAll('[data-bl-thumb]').forEach(function (btn) {
      btn.addEventListener('click', function () { self.show(btn.getAttribute('data-bl-thumb')); });
    });
  }
  Gallery.prototype.pan = function (e) {
    if (!this.main.classList.contains('is-zoomed')) return;
    var r = this.main.getBoundingClientRect();
    var x = ((e.clientX - r.left) / r.width) * 100;
    var y = ((e.clientY - r.top) / r.height) * 100;
    this.img.style.transformOrigin = x + '% ' + y + '%';
  };
  Gallery.prototype.show = function (src) {
    if (!this.img || !src) return;
    this.main.classList.remove('is-zoomed');
    this.img.src = src;
    this.img.removeAttribute('srcset');
    this.root.querySelectorAll('[data-bl-thumb]').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-bl-thumb') === src);
    });
  };

  /* ---------- Buy panel controller (modal + product page) ---------- */
  function BuyPanel(root, product, opts) {
    this.root = root;
    this.product = product;
    this.opts = opts || {};
    this.idInput = root.querySelector('[data-bl-variant-id]');
    this.priceEl = root.querySelector('[data-bl-price]');
    this.submit = root.querySelector('[data-bl-submit]');
    this.error = root.querySelector('[data-bl-error]');
    this.details = root.querySelector('[data-bl-details]');
    this.qty = root.querySelector('[data-bl-qty]');
    this.form = root.querySelector('[data-bl-form]');
    this.gallery = this.opts.gallery || null;

    var initial = null;
    var wanted = Number(this.opts.variantId);
    product.variants.forEach(function (v) { if (v.id === wanted) initial = v; });
    if (!initial) product.variants.forEach(function (v) { if (!initial && v.available) initial = v; });
    this.selected = (initial || product.variants[0]).options.slice();

    this.bind();
    this.update(true);
  }

  BuyPanel.prototype.bind = function () {
    var self = this;
    this.root.querySelectorAll('[data-bl-value]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-bl-index'));
        self.selected[idx] = btn.getAttribute('data-bl-value');
        self.update(false);
      });
    });

    this.root.querySelectorAll('[data-bl-qty-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var n = Math.max(1, (parseInt(self.qty.value, 10) || 1) + Number(btn.getAttribute('data-bl-qty-step')));
        self.qty.value = n;
      });
    });

    if (this.form) {
      this.form.addEventListener('submit', function (e) {
        e.preventDefault();
        self.add();
      });
    }
  };

  BuyPanel.prototype.current = function () {
    var sel = this.selected;
    var match = null;
    this.product.variants.forEach(function (v) {
      if (!match && v.options.every(function (o, i) { return o === sel[i]; })) match = v;
    });
    return match;
  };

  BuyPanel.prototype.update = function (isInitial) {
    var self = this;
    var variant = this.current();

    // Option buttons: active + unavailable state (given the other selections).
    this.root.querySelectorAll('[data-bl-value]').forEach(function (btn) {
      var idx = Number(btn.getAttribute('data-bl-index'));
      var val = btn.getAttribute('data-bl-value');
      var active = self.selected[idx] === val;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      var test = self.selected.slice();
      test[idx] = val;
      var ok = self.product.variants.some(function (v) {
        return v.available && v.options.every(function (o, i) { return o === test[i]; });
      });
      btn.classList.toggle('is-unavailable', !ok);
    });

    if (this.error) this.error.textContent = '';

    if (!variant) {
      if (this.priceEl) this.priceEl.innerHTML = '';
      this.setButton(false, 'Unavailable');
      return;
    }

    if (this.idInput) this.idInput.value = variant.id;
    if (this.priceEl) {
      var html = esc(money(variant.price));
      if (variant.compare_at_price && variant.compare_at_price > variant.price) {
        html += '<s>' + esc(money(variant.compare_at_price)) + '</s>';
      }
      this.priceEl.innerHTML = html;
    }
    this.setButton(variant.available, variant.available ? 'Add to cart' : 'Sold out');

    if (this.details) {
      var base = this.details.getAttribute('data-bl-base');
      this.details.href = base + (base.indexOf('?') === -1 ? '?' : '&') + 'variant=' + variant.id;
    }

    if (!isInitial && variant.image && this.gallery) this.gallery.show(variant.image);

    if (this.opts.updateUrl && !isInitial && window.history && history.replaceState) {
      var url = new URL(window.location.href);
      url.searchParams.set('variant', variant.id);
      history.replaceState(null, '', url.toString());
    }
  };

  BuyPanel.prototype.setButton = function (enabled, label) {
    if (!this.submit) return;
    this.submit.disabled = !enabled;
    this.submit.textContent = label;
  };

  BuyPanel.prototype.add = function () {
    var self = this;
    var variant = this.current();
    if (!variant || !variant.available) return;
    var qty = this.qty ? Math.max(1, parseInt(this.qty.value, 10) || 1) : 1;

    this.setButton(false, 'Adding…');
    addToCart(variant.id, qty)
      .then(function () {
        self.setButton(true, 'Add to cart');
        if (self.opts.onAdded) self.opts.onAdded();
        openCart();
      })
      .catch(function (err) {
        self.setButton(true, 'Add to cart');
        if (self.error) self.error.textContent = err.message;
      });
  };

  /* ---------- Shared markup ---------- */
  function optionsHTML(product) {
    if (!hasRealOptions(product)) return '';
    return product.options.map(function (opt, i) {
      var values = [];
      product.variants.forEach(function (v) {
        if (values.indexOf(v.options[i]) === -1) values.push(v.options[i]);
      });
      return '<fieldset class="blondish-buy__option">' +
        '<legend class="blondish-buy__label">' + esc(opt) + '</legend>' +
        '<div class="blondish-buy__values">' +
        values.map(function (val) {
          return '<button type="button" class="blondish-buy__value" data-bl-value="' + esc(val) +
            '" data-bl-index="' + i + '" aria-pressed="false">' + esc(val) + '</button>';
        }).join('') +
        '</div></fieldset>';
    }).join('');
  }

  function galleryHTML(product) {
    var imgs = product.images || [];
    var main = imgs[0] || '';
    var thumbs = imgs.length > 1
      ? '<div class="blondish-gallery__thumbs">' + imgs.map(function (src, i) {
          return '<button type="button" class="blondish-gallery__thumb' + (i === 0 ? ' is-active' : '') +
            '" data-bl-thumb="' + esc(src) + '" aria-label="Show image ' + (i + 1) + '"><img src="' + esc(src) +
            '" alt="" loading="lazy"></button>';
        }).join('') + '</div>'
      : '';
    return '<div class="blondish-gallery" data-bl-gallery>' +
      '<div class="blondish-gallery__main" data-bl-gallery-main>' +
      (main ? '<img src="' + esc(main) + '" alt="' + esc(product.title) + '">' : '') +
      '<span class="blondish-gallery__hint">Click to zoom</span></div>' + thumbs + '</div>';
  }

  /* ---------- Quick-buy modal ---------- */
  var modal = null;
  var lastTrigger = null;

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'blondish blondish-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '<div class="blondish-modal__panel" role="dialog" aria-modal="true" aria-labelledby="BlondishModalTitle"></div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.closest('[data-bl-close]')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
    });
    return modal;
  }

  function openModal(product, trigger) {
    ensureModal();
    lastTrigger = trigger || null;
    var panel = modal.querySelector('.blondish-modal__panel');
    var detailsUrl = product.details_url || product.url;

    panel.innerHTML =
      '<button type="button" class="blondish-modal__close" data-bl-close aria-label="Close">&times;</button>' +
      galleryHTML(product) +
      '<form class="blondish-modal__info" data-bl-form novalidate>' +
        '<h2 class="blondish-buy__title" id="BlondishModalTitle">' + esc(product.title) + '</h2>' +
        '<div class="blondish-buy__price" data-bl-price></div>' +
        (product.description ? '<p class="blondish-buy__desc">' + esc(product.description) + '</p>' : '') +
        optionsHTML(product) +
        '<input type="hidden" name="id" data-bl-variant-id>' +
        '<button type="submit" class="blondish-buy__submit" data-bl-submit>Add to cart</button>' +
        '<p class="blondish-buy__error" data-bl-error role="alert"></p>' +
        '<a class="blondish-buy__details" data-bl-details data-bl-base="' + esc(detailsUrl) + '" href="' + esc(detailsUrl) + '">View full details</a>' +
      '</form>';

    var gallery = new Gallery(panel.querySelector('[data-bl-gallery]'));
    new BuyPanel(panel, product, { gallery: gallery, onAdded: closeModal });

    document.documentElement.classList.add('blondish-scroll-lock');
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('is-open');
    var close = panel.querySelector('[data-bl-close]');
    if (close) close.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('blondish-scroll-lock');
    if (lastTrigger) lastTrigger.focus();
  }

  /* ---------- Init ---------- */
  function initCollection() {
    document.addEventListener('click', function (e) {
      var card = e.target.closest('[data-bl-quick]');
      if (!card) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let new-tab clicks through
      var product = readJSON(document.getElementById(card.getAttribute('data-bl-quick')));
      if (!product) return; // fall back to the product page link
      e.preventDefault();
      openModal(product, card);
    });
  }

  function initProductPages() {
    document.querySelectorAll('[data-bl-product-page]').forEach(function (root) {
      var product = readJSON(root.querySelector('[data-bl-product-json]'));
      if (!product) return;
      var galleryRoot = root.querySelector('[data-bl-gallery]');
      var gallery = galleryRoot ? new Gallery(galleryRoot) : null;
      new BuyPanel(root, product, {
        gallery: gallery,
        variantId: root.getAttribute('data-bl-variant'),
        updateUrl: true
      });
    });
  }

  function init() {
    initCollection();
    initProductPages();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.BlondishStore = { openModal: openModal, closeModal: closeModal };
})();
