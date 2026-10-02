const env = require("../config/env");

let app = null;
let database = null;

const COLLECTIONS = Object.freeze({
  accounts: "aigc_accounts",
  sessions: "aigc_auth_sessions",
  states: "aigc_user_states",
  drafts: "aigc_goal_drafts",
});

function getDatabase() {
  if (!env.persistence.isCloudbase) return null;
  if (!database) {
    const cloudbase = require("@cloudbase/node-sdk");
    app = cloudbase.init({
      env: env.cloudbase.envId,
      accessKey: String(process.env.CLOUDBASE_APIKEY || "").trim() || undefined,
    });
    database = app.database();
  }
  return database;
}

async function getDocument(collectionName, id) {
  const result = await getDatabase().collection(collectionName).doc(String(id)).get();
  return result && Array.isArray(result.data) && result.data.length ? result.data[0] : null;
}

async function setDocument(collectionName, id, value) {
  const payload = { ...value };
  delete payload._id;
  await getDatabase().collection(collectionName).doc(String(id)).set(payload);
}

async function updateDocument(collectionName, id, value) {
  await getDatabase().collection(collectionName).doc(String(id)).update(value);
}

async function initializeCloudbase() {
  if (!env.persistence.isCloudbase) return;
  const db = getDatabase();
  for (const name of Object.values(COLLECTIONS)) {
    try {
      await db.createCollection(name);
    } catch (error) {
      const message = String(error && (error.message || error.errMsg) || "");
      const code = String(error && error.code || "");
      if (!/exist|already/i.test(message) && !/EXIST/i.test(code)) throw error;
    }
  }
}

function closeCloudbase() {
  app = null;
  database = null;
}

module.exports = {
  COLLECTIONS,
  getDatabase,
  getDocument,
  setDocument,
  updateDocument,
  initializeCloudbase,
  closeCloudbase,
};
