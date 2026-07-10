import { prisma } from "../src/index";

/**
 * Dev seed: one demo relay for the S01 walking skeleton. The relay's single action is hardcoded in
 * the engine for now (it becomes real config once the connector SDK lands in S03).
 */
async function main() {
  const relay = await prisma.relay.upsert({
    where: { id: "demo-relay" },
    update: {},
    create: { id: "demo-relay", name: "Demo relay — webhook → HTTP notify" },
  });
  console.log(`seeded relay: ${relay.name} (${relay.id})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
