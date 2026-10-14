import dns from 'node:dns';
import mongoose from 'mongoose';
import config from './env.js';

// Some home/office routers refuse the DNS SRV queries Node uses for
// `mongodb+srv://` (MongoDB Atlas) connection strings, producing errors like
// "querySrv ECONNREFUSED". When that happens we retry against public resolvers.
const PUBLIC_DNS = ['8.8.8.8', '1.1.1.1', '1.0.0.1'];
const DNS_ERRORS = /querySrv|queryTxt|ENOTFOUND|EAI_AGAIN|ETIMEOUT/i;

function usePublicDns() {
  try {
    dns.setServers(PUBLIC_DNS);
    return true;
  } catch {
    return false;
  }
}

export async function connectDB(uri = config.mongoUri) {
  mongoose.set('strictQuery', true);

  const options = { serverSelectionTimeoutMS: 10000 };

  try {
    await mongoose.connect(uri, options);
    return mongoose.connection;
  } catch (err) {
    const message = String(err?.message || '');
    const isSrv = String(uri).startsWith('mongodb+srv://');
    if (isSrv && DNS_ERRORS.test(message) && usePublicDns()) {
      await mongoose.disconnect().catch(() => {});
      await mongoose.connect(uri, options);
      return mongoose.connection;
    }
    throw err;
  }
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

export default connectDB;
