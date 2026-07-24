/* Shared by the website and the admin dashboard: the font menu offered in the
   Logo panel, in the spirit of a word-processor font picker.

   Two kinds of entry:
   - system families, which cost nothing to use and fall back sensibly on
     machines that lack them (Calibri/Cambria are Windows-only, for instance);
   - Google families, which are only fetched when one is actually chosen, so a
     33-entry menu never turns into 33 font downloads. The site already loads
     Cormorant Garamond and Jost, so those are flagged as preloaded.

   The site reads whatever the admin saved, so nothing here is trusted blindly:
   `brandFontStack` only returns a stack for a name that exists in this list,
   which keeps an arbitrary string from reaching an inline style attribute. */
(function (root) {
  var FONTS = [
    // --- the site's own faces ---
    { name: 'Cormorant Garamond', stack: "'Cormorant Garamond', Georgia, serif", google: 'Cormorant+Garamond:wght@300;400;500;600', preloaded: true },
    { name: 'Jost', stack: "'Jost', 'Helvetica Neue', Arial, sans-serif", google: 'Jost:wght@300;400;500', preloaded: true },

    // --- system families (no download) ---
    { name: 'Arial', stack: "Arial, Helvetica, sans-serif" },
    { name: 'Calibri', stack: "Calibri, 'Segoe UI', Candara, sans-serif" },
    { name: 'Cambria', stack: "Cambria, Georgia, 'Times New Roman', serif" },
    { name: 'Candara', stack: "Candara, 'Segoe UI', Optima, sans-serif" },
    { name: 'Courier New', stack: "'Courier New', Courier, monospace" },
    { name: 'Garamond', stack: "Garamond, 'Apple Garamond', Baskerville, serif" },
    { name: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
    { name: 'Impact', stack: "Impact, Haettenschweiler, 'Arial Black', sans-serif" },
    { name: 'Palatino', stack: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
    { name: 'Segoe UI', stack: "'Segoe UI', Tahoma, Geneva, sans-serif" },
    { name: 'Tahoma', stack: "Tahoma, Geneva, Verdana, sans-serif" },
    { name: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
    { name: 'Trebuchet MS', stack: "'Trebuchet MS', 'Lucida Grande', sans-serif" },
    { name: 'Verdana', stack: "Verdana, Geneva, sans-serif" },

    // --- Google families (fetched on demand) ---
    { name: 'Cinzel', stack: "'Cinzel', Georgia, serif", google: 'Cinzel:wght@400;500;600' },
    { name: 'Dancing Script', stack: "'Dancing Script', cursive", google: 'Dancing+Script:wght@400;500;600' },
    { name: 'EB Garamond', stack: "'EB Garamond', Garamond, serif", google: 'EB+Garamond:wght@400;500;600' },
    { name: 'Great Vibes', stack: "'Great Vibes', cursive", google: 'Great+Vibes' },
    { name: 'Italiana', stack: "'Italiana', Georgia, serif", google: 'Italiana' },
    { name: 'Josefin Sans', stack: "'Josefin Sans', sans-serif", google: 'Josefin+Sans:wght@300;400;500;600' },
    { name: 'Lato', stack: "'Lato', Arial, sans-serif", google: 'Lato:wght@300;400;700' },
    { name: 'Libre Baskerville', stack: "'Libre Baskerville', Georgia, serif", google: 'Libre+Baskerville:wght@400;700' },
    { name: 'Lora', stack: "'Lora', Georgia, serif", google: 'Lora:wght@400;500;600' },
    { name: 'Marcellus', stack: "'Marcellus', Georgia, serif", google: 'Marcellus' },
    { name: 'Montserrat', stack: "'Montserrat', Arial, sans-serif", google: 'Montserrat:wght@300;400;500;600' },
    { name: 'Parisienne', stack: "'Parisienne', cursive", google: 'Parisienne' },
    { name: 'Playfair Display', stack: "'Playfair Display', Georgia, serif", google: 'Playfair+Display:wght@400;500;600' },
    { name: 'Poppins', stack: "'Poppins', Arial, sans-serif", google: 'Poppins:wght@300;400;500;600' },
    { name: 'Raleway', stack: "'Raleway', Arial, sans-serif", google: 'Raleway:wght@300;400;500;600' },
    { name: 'Tenor Sans', stack: "'Tenor Sans', Arial, sans-serif", google: 'Tenor+Sans' },
  ];

  // The sizes a word processor offers, extended at the top end because a
  // wordmark is display type, not body copy.
  var SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 44, 48, 54, 60, 72, 84, 96];

  function find(name) {
    if (!name) return null;
    for (var i = 0; i < FONTS.length; i++) {
      if (FONTS[i].name === name) return FONTS[i];
    }
    return null;
  }

  // An unknown name yields '' so the element simply keeps the stylesheet's font.
  function brandFontStack(name) {
    var f = find(name);
    return f ? f.stack : '';
  }

  // Adds the stylesheet link for a Google family once, the first time it is used.
  function ensureBrandFont(name) {
    var f = find(name);
    if (!f || !f.google || f.preloaded) return;
    var id = 'gf-' + f.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    if (document.getElementById(id)) return;
    var link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + f.google + '&display=swap';
    document.head.appendChild(link);
  }

  // Sizes arrive from the admin as strings; anything outside the sane range is
  // dropped rather than clamped, so the stylesheet default wins instead.
  function brandFontSize(value) {
    var n = parseInt(value, 10);
    if (!n || n < 8 || n > 200) return 0;
    return n;
  }

  root.BRAND_FONTS = FONTS;
  root.BRAND_FONT_SIZES = SIZES;
  root.brandFontStack = brandFontStack;
  root.ensureBrandFont = ensureBrandFont;
  root.brandFontSize = brandFontSize;
})(window);
