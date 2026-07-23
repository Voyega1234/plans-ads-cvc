const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const ws = await prisma.ltWorkspace.upsert({
    where: { id: 'demo-ws' }, update: {}, create: { id: 'demo-ws', name: 'Demo Workspace' },
  });
  async function proj(id, name, client, slug) {
    return prisma.project.upsert({
      where: { id }, update: {},
      create: { id, agencyId: ws.id, name, clientName: client, slug, businessType: 'clinic', status: 'LIVE', defaultConversionValue: 0 },
    });
  }
  const A = await proj('demo-proj-a', 'คลินิกเดโม A', 'ลูกค้า A', 'demo-a');
  const B = await proj('demo-proj-b', 'ร้านเดโม B', 'ลูกค้า B', 'demo-b');
  // a few leads so dashboards show data
  for (const [p, chans] of [[A, ['Paid Search','Organic Search','Direct']], [B, ['Paid Social','Direct']]]) {
    for (let i = 0; i < chans.length; i++) {
      await prisma.lead.create({ data: {
        projectId: p.id, displayName: `Lead ${p.slug}-${i}`, channelGroup: chans[i],
        status: i === 0 ? 'PAID' : (i === 1 ? 'QUALIFIED' : 'NEW'), value: i === 0 ? 1500 : 0, currency: 'THB',
      }});
    }
  }
  console.log('seeded: workspace + 2 projects (A=%s, B=%s) + leads', A.id, B.id);
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
