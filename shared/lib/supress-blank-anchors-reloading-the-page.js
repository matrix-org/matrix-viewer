'use strict';

// For any `<a href="">` (anchor with a blank href), instead of reloading the
// page just remove the hash. Also cleanup whenever the hash changes for
// whatever reason.
//
// For example, when closing the lightbox by clicking the close "x" icon, it
// would reload the page instead of SPA because `href=""` will cause a page
// navigation if we didn't have this code. Also cleanup whenever the hash is
// emptied out (like when pressing escape in the lightbox).
function supressBlankAnchorsReloadingThePage() {
  const eventHandler = {
    clearHash() {
      // Cause a `hashchange` event to be fired
      document.location.hash = '';
      // Cleanup the leftover `#` left on the URL
      window.history.replaceState(null, null, window.location.pathname);
    },
    handleEvent(e) {
      // For any `<a href="">` (anchor with a blank href), instead of reloading
      // the page just remove the hash.
      if (e.type === 'click') {
        // Traverse up the DOM and see whether the click is a child of an anchor element
        let target = e.target;
        while (
          target &&
          // We use `nodeName` here because it's compatible with any Element (HTML or SVG)
          target.nodeName !== 'A'
        ) {
          target = target.parentNode;
        }

        if (target?.tagName?.toLowerCase() === 'a' && target?.getAttribute('href') === '') {
          this.clearHash();
          // Prevent the page navigation (reload)
          e.preventDefault();
        }
      }
      // Also cleanup whenever the hash is emptied out (like when pressing escape in the lightbox)
      else if (e.type === 'hashchange' && document.location.hash === '') {
        this.clearHash();
      }
    },
  };

  document.addEventListener('click', eventHandler);
  window.addEventListener('hashchange', eventHandler);
}

module.exports = supressBlankAnchorsReloadingThePage;
