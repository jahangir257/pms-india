import mongoose from 'mongoose';
const g = globalThis;
g._mongo = g._mongo || { conn: null, promise: null };
export async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured');
  if (g._mongo.conn) return g._mongo.conn;
  g._mongo.promise = g._mongo.promise || mongoose.connect(uri, { bufferCommands: false, maxPoolSize: 20 });
  try { g._mongo.conn = await g._mongo.promise; } catch (e) { g._mongo.promise = null; throw e; }
  return g._mongo.conn;
}
