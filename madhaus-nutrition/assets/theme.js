(function () {
  // Mobile menu
  var burger = document.querySelector('[data-menu-toggle]');
  var nav = document.querySelector('[data-nav]');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open);
    });
  }

  // Product page: quantity stepper + variant-aware price / availability
  var product = document.querySelector('[data-product]');
  if (!product) return;

  var qty = product.querySelector('[data-qty]');
  var minus = product.querySelector('[data-qty-minus]');
  var plus = product.querySelector('[data-qty-plus]');
  if (qty && minus && plus) {
    minus.addEventListener('click', function () { qty.value = Math.max(1, (parseInt(qty.value, 10) || 1) - 1); });
    plus.addEventListener('click', function () { qty.value = (parseInt(qty.value, 10) || 1) + 1; });
  }

  // Sticky add-to-cart: show once the main button scrolls out of view
  var sticky = product.querySelector('[data-sticky-atc]');
  var mainBtn = product.querySelector('[data-add]');
  if (sticky && mainBtn && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      var out = !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0;
      sticky.classList.toggle('is-visible', out);
      sticky.setAttribute('aria-hidden', !out);
      var b = sticky.querySelector('[data-sticky-add]');
      if (b) b.tabIndex = out ? 0 : -1;
    }).observe(mainBtn);
  }

  var select = product.querySelector('[data-variant-select]');
  if (!select) return;
  var price = product.querySelector('[data-price]');
  var compare = product.querySelector('[data-compare-price]');
  var add = product.querySelector('[data-add]');
  var stickyPrice = product.querySelector('[data-sticky-price]');
  var stickyAdd = product.querySelector('[data-sticky-add]');
  var stockMsg = product.querySelector('[data-stock-msg]');
  var stockCount = product.querySelector('[data-stock-count]');

  function update() {
    var opt = select.options[select.selectedIndex];
    if (price) price.textContent = opt.dataset.price;
    if (compare) {
      compare.textContent = opt.dataset.compare;
      compare.hidden = !opt.dataset.compare;
    }
    var ok = opt.dataset.available === 'true';
    [add, stickyAdd].forEach(function (b) {
      if (!b) return;
      b.disabled = !ok;
      b.textContent = ok ? 'Add to cart' : 'Sold out';
    });
    if (stickyPrice) stickyPrice.textContent = opt.dataset.price;
    if (stockMsg) {
      var n = parseInt(opt.dataset.stock, 10);
      var low = ok && n > 0 && n <= 10;
      stockMsg.hidden = !low;
      if (low && stockCount) stockCount.textContent = n;
    }
    var url = new URL(window.location.href);
    url.searchParams.set('variant', opt.value);
    window.history.replaceState({}, '', url);
  }
  select.addEventListener('change', update);
})();
