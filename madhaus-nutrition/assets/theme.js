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

  var select = product.querySelector('[data-variant-select]');
  if (!select) return;
  var price = product.querySelector('[data-price]');
  var compare = product.querySelector('[data-compare-price]');
  var add = product.querySelector('[data-add]');

  function update() {
    var opt = select.options[select.selectedIndex];
    if (price) price.textContent = opt.dataset.price;
    if (compare) {
      compare.textContent = opt.dataset.compare;
      compare.hidden = !opt.dataset.compare;
    }
    if (add) {
      var ok = opt.dataset.available === 'true';
      add.disabled = !ok;
      add.textContent = ok ? 'Add to cart' : 'Sold out';
    }
    var url = new URL(window.location.href);
    url.searchParams.set('variant', opt.value);
    window.history.replaceState({}, '', url);
  }
  select.addEventListener('change', update);
})();
