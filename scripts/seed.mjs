import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
const { MONGODB_URI, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME } = process.env;
if (!MONGODB_URI || !SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) { console.error('Set MONGODB_URI, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD in .env.local'); process.exit(1); }
await mongoose.connect(MONGODB_URI);
const users = mongoose.connection.collection('users');
const email = SEED_ADMIN_EMAIL.toLowerCase();
if (await users.findOne({ email })) { console.log('Super admin already exists:', email); }
else {
  const now = new Date();
  await users.insertOne({ name: SEED_ADMIN_NAME || 'Super Admin', email, passwordHash: await bcrypt.hash(SEED_ADMIN_PASSWORD, 12), role: 'super_admin', active: true, createdAt: now, updatedAt: now });
  console.log('Super admin created:', email);
}
await mongoose.disconnect();
