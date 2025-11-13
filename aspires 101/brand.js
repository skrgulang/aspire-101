/* Centralized brand/logo loader */
(() => {
    // Change these in ONE place when you update the logo:
    const VERSION = "v1"; // bump to force cache refresh
    const LOGO_1X = `pictures/19171758147211_.pic_hd.jpg?${VERSION}`;
    const LOGO_2X = LOGO_1X; // replace with a @2x asset when you have it
    const FAVICON = LOGO_1X;
  
    // Ensure favicon + touch icon exist and point to the logo
    function ensure(rel) {
      let el = document.querySelector(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement("link");
        el.rel = rel;
        document.head.appendChild(el);
      }
      el.href = FAVICON;
    }
    ensure("icon");
    ensure("apple-touch-icon");
  
    // Small brand logos (header/footer)
    document.querySelectorAll("img.brand-logo").forEach(img => {
      img.src = LOGO_1X;
      img.srcset = `${LOGO_1X} 1x, ${LOGO_2X} 2x`;
      if (!img.getAttribute("width"))  img.setAttribute("width", "32");
      if (!img.getAttribute("height")) img.setAttribute("height", "32");
      img.decoding = "async";
      img.loading  = "eager";
    });
  
    // Big hero logo (optional)
    document.querySelectorAll("img.hero-logo").forEach(img => {
      img.src = LOGO_1X;
      img.srcset = `${LOGO_1X} 1x, ${LOGO_2X} 2x`;
      if (!img.getAttribute("width"))  img.setAttribute("width", "84");
      if (!img.getAttribute("height")) img.setAttribute("height", "84");
      img.decoding = "async";
      img.loading  = "lazy";
    });
  })();
  