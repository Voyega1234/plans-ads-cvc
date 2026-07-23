// Post-deploy smoke test — run right after a Vercel deploy finishes.
//
//   node scripts/smoke-deploy.js [baseUrl]
//   (default baseUrl: https://mercy-cvc.vercel.app)
//
// Everything checked here is reachable WITHOUT logging in, so it can run
// unattended. It cannot verify the logged-in pages — use the manual checklist in
// DEPLOY_REPORT.md for those. Exit code 1 = something is wrong, do not hand over.
const BASE = (process.argv[2] || 'https://mercy-cvc.vercel.app').replace(/\/$/, '');

// A server-side render crash produces Next.js's built-in error screen. Since this
// build ships src/app/error.tsx, seeing EITHER the built-in text or our own card
// means a page threw — both are treated as a failure.
const CRASH = /server-side exception|Application error:|หน้านี้โหลดไม่สำเร็จ|ระบบขัดข้องชั่วคราว/i;

const checks = [
  {
    name: 'embed.js served (tracking script reachable by client sites)',
    url: '/embed.js',
    ok: (r, body) => r.status === 200 && /data-project|addEventListener/.test(body),
  },
  {
    name: 'embed.js is JavaScript, not an HTML error page',
    url: '/embed.js',
    ok: (r) => (r.headers.get('content-type') || '').includes('javascript'),
  },
  {
    name: 'track endpoint alive (rejects GET, so the route compiled)',
    url: '/api/track/__smoke_test__',
    ok: (r) => r.status === 405 || r.status === 404 || r.status === 400,
  },
  {
    name: 'unknown project slug 404s cleanly (no server crash)',
    url: '/t/__smoke_test_no_such_project__',
    ok: (r, body) => r.status === 404 && !CRASH.test(body),
  },
  {
    name: 'app root redirects to login (middleware healthy, jose resolved)',
    url: '/line-tracking',
    ok: (r) => r.status === 307 || r.status === 302,
  },
  {
    name: 'login page renders without a server exception',
    url: '/auth/signin',
    ok: (r, body) => r.status === 200 && !CRASH.test(body),
  },
  {
    name: 'protected API returns 401 JSON, not a crash',
    url: '/api/chat',
    ok: (r) => r.status === 401 || r.status === 405,
  },
  {
    // This route is outside the login gate and processes the conversion queue,
    // so an unauthenticated caller must be turned away. 503 means CRON_SECRET
    // was never set on the deployment — the route is closed, but so is the
    // cron, so conversions would stop being sent. Treat that as a failure.
    name: 'conversion cron rejects unauthenticated callers (and CRON_SECRET is set)',
    url: '/api/conversions/process',
    ok: (r) => r.status === 401,
    hint: (r) =>
      r.status === 503
        ? 'CRON_SECRET ยังไม่ได้ตั้งบน Vercel — cron จะไม่ทำงาน ไป Settings → Environment Variables แล้วเพิ่ม CRON_SECRET'
        : r.status === 200
          ? 'route นี้เปิดสาธารณะอยู่ — ใครก็สั่งประมวลผลคิวได้'
          : null,
  },
];

(async () => {
  console.log('Smoke testing:', BASE, '\n');
  let failed = 0;
  for (const c of checks) {
    let line;
    try {
      const res = await fetch(BASE + c.url, { redirect: 'manual' });
      const body = await res.text();
      const pass = c.ok(res, body);
      if (!pass) failed++;
      line = `${pass ? 'PASS' : 'FAIL'}  [${res.status}] ${c.name}`;
      if (!pass) {
        line += `\n        -> ${BASE}${c.url}`;
        const hint = c.hint && c.hint(res, body);
        if (hint) line += `\n        -> ${hint}`;
      }
    } catch (e) {
      failed++;
      line = `FAIL  [network] ${c.name}\n        -> ${e.message}`;
    }
    console.log(line);
  }
  console.log('');
  if (failed) {
    console.log(`${failed} check(s) FAILED — investigate before handing over.`);
    console.log('If a page crashed, open Vercel -> Logs and search the digest shown on screen.');
    process.exit(1);
  }
  console.log('All public-surface checks PASSED.');
  console.log('Still to do by hand (needs @convertcake.com login): section 6 of DEPLOY_REPORT.md.');
})();
