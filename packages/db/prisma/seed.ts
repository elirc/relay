import { prisma } from "../src/index";

/**
 * Dev seed: one org, one dev user (member of it), and the demo relay under that org. Connections are
 * created at runtime via the OAuth connect flow, so none are seeded here.
 */
async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "demo-org" },
    update: {},
    create: { id: "demo-org", name: "Demo Org" },
  });

  const user = await prisma.user.upsert({
    where: { email: "dev@relay.test" },
    update: {},
    create: { email: "dev@relay.test", name: "Dev User" },
  });

  await prisma.membership.upsert({
    where: { userId_orgId: { userId: user.id, orgId: org.id } },
    update: {},
    create: { userId: user.id, orgId: org.id, role: "ADMIN" },
  });

  const relay = await prisma.relay.upsert({
    where: { id: "demo-relay" },
    update: {},
    create: { id: "demo-relay", orgId: org.id, name: "Demo relay — webhook → HTTP notify" },
  });

  console.log(`seeded org=${org.name} user=${user.email} relay=${relay.name}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
