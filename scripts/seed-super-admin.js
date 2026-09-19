require("dotenv").config();
const { db } = require("../dist/db/index.js");
const { users } = require("../dist/db/schema.js");
const bcrypt = require("bcrypt");

async function main() {
  try {
    const passwordHash = await bcrypt.hash("SuperAdmin123!", 12);

    await db.insert(users).values({
      email: "superadmin@taprobaneticket.com",
      passwordHash,
      role: "SUPER_ADMIN",
    });

    console.log("Super admin created successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Error seeding super admin:", err);
    process.exit(1);
  }
}

main();
