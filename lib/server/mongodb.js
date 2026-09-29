import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI");

// Reuse one client per process. In dev the module is re-evaluated on every
// HMR reload, so the promise is cached on `global` to avoid leaking clients.
if (!global._mongoClientPromise) {
  global._mongoClientPromise = new MongoClient(uri).connect();
}

export default global._mongoClientPromise;
export { DB_NAME } from './db';
