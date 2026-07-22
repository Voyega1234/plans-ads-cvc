// Public embed script. Paste on the client's website:
//   <script src="https://<hub>/embed.js" data-project="co-journey-visa"></script>
// It captures UTM + gclid/fbclid/ttclid + GA client id, records a click via the
// ingest API, then points every element with [data-line-add] to /line/start.

const SNIPPET = `(function(){
  var s = document.currentScript;
  if(!s){ s = (function(){var a=document.getElementsByTagName('script');return a[a.length-1];})(); }
  var project = s.getAttribute('data-project');
  var hub = s.getAttribute('data-hub') || new URL(s.src).origin;
  if(!project){ console.warn('[LINEHub] missing data-project'); return; }

  function qp(name){
    var m = new RegExp('[?&]'+name+'=([^&#]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\\+/g,' ')) : '';
  }
  function gaClientId(){
    var m = document.cookie.match(/_ga=GA\\d\\.\\d\\.(\\d+\\.\\d+)/);
    return m ? m[1] : '';
  }

  var payload = {
    utm_source: qp('utm_source'), utm_medium: qp('utm_medium'),
    utm_campaign: qp('utm_campaign'), utm_adset: qp('utm_adset'),
    utm_content: qp('utm_content'), utm_term: qp('utm_term'),
    gclid: qp('gclid'), fbclid: qp('fbclid'), ttclid: qp('ttclid'),
    msclkid: qp('msclkid'), twclid: qp('twclid'), scclid: qp('scclid') || qp('sc_click_id'),
    ga_client_id: gaClientId(),
    landing_url: location.href, referrer: document.referrer
  };

  var LS = 'linehub_click_' + project;
  function isLineLink(h){ return /lin\\.ee|line\\.me|liff\\.line|line:\\/\\//i.test(h || ''); }
  function wire(clickId){
    // Remember the click; DO NOT change the LINE button — keep native 1-tap add.
    try { localStorage.setItem(LS, clickId); } catch(e){}
    window.LINEHubClickId = clickId;

    // Record when a visitor actually CLICKS an Add-LINE button (intent), from ANY
    // channel — ads, organic, direct. Fire-and-forget; the button still works.
    function trackLineClick(){
      try {
        // Pass via query string so sendBeacon works cross-origin (a JSON body
        // would need a CORS preflight that beacons can't do → silently dropped).
        var u = hub + '/api/track/' + encodeURIComponent(project) +
          '?event=lineclick&click_id=' + encodeURIComponent(clickId);
        if (navigator.sendBeacon) navigator.sendBeacon(u);
        else fetch(u, { method: 'POST', keepalive: true, mode: 'no-cors' });
      } catch (e) {}
    }
    // Event delegation on the document → catches clicks on ANY LINE button even
    // if it was added to the page after this script ran (GTM, dynamic content).
    document.addEventListener('click', function(e){
      var node = e.target;
      for (var k = 0; k < 6 && node && node.nodeType === 1; k++){
        if (node.getAttribute && !(node.hasAttribute && node.hasAttribute('data-line-skip'))){
          if ((node.hasAttribute && node.hasAttribute('data-line-add')) || isLineLink(node.getAttribute('href'))){
            trackLineClick();
            return;
          }
        }
        node = node.parentNode;
      }
    }, true);

    // Mode 1 (transparent): route [data-line-add] straight to LINE add-friend via
    // /line/start (no LINE Login screen — customer notices nothing).
    var els = document.querySelectorAll('[data-line-add]');
    if (els.length){
      var url = hub + '/line/start?project=' + encodeURIComponent(project) + '&click_id=' + encodeURIComponent(clickId);
      for (var i=0;i<els.length;i++){
        var el = els[i];
        if (el.tagName === 'A'){ el.setAttribute('href', url); }
      }
    }
  }

  var existing = null; try { existing = localStorage.getItem(LS); } catch(e){}
  var hasAd = payload.gclid || payload.fbclid || payload.ttclid || payload.msclkid || payload.twclid || payload.scclid || payload.utm_source;
  if (existing && !hasAd){ wire(existing); return; }

  fetch(hub + '/api/track/' + encodeURIComponent(project), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function(r){ return r.json(); })
  .then(function(d){ if (d && d.clickId) wire(d.clickId); })
  .catch(function(e){ console.warn('[LINEHub] track failed', e); });
})();
`;

export function GET() {
  return new Response(SNIPPET, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=60",
      "access-control-allow-origin": "*",
    },
  });
}
