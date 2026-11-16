// Visit counting with GoatCounter (https://www.goatcounter.com).
// GoatCounter sets no cookies, stores nothing in the browser and does not keep
// IP addresses. It records the page, the referring site, browser, system,
// screen width, language and country, added up per hour.
//
// CODE below is the first part of the dashboard address,
// https://brodylister.goatcounter.com. If you reuse this site, change it to
// your own GoatCounter code or remove this file's script tag from both pages.
// Set to 'YOURCODE' or leave empty, this file does nothing.
//
// To leave your own visits out, open the site once with #toggle-goatcounter
// at the end of the address, on each of your devices.
(function () {
  'use strict';

  var CODE = 'brodylister';

  if (!CODE || CODE === 'YOURCODE') return;

  window.goatcounter = {
    endpoint: 'https://' + CODE + '.goatcounter.com/count',
    // The front page is reached both as "/" and as "/index.html".
    // Count them as one page.
    path: function (p) { return p.replace(/\/index\.html(?=$|\?)/, '/'); }
  };

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  document.head.appendChild(s);
})();
