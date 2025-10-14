// database.js (Discord)
const admin = require("firebase-admin");

let serviceAccount;
if (process.env.FIREBASE_KEY) {
  serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
} else {
  serviceAccount = require("./serviceAccountKey.json"); // local dev
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://mybot-d79df-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

async function setData(path, value) {
  try {
    await db.ref(path).set(value);
    return true;
  } catch (err) {
    console.error("Error setting data:", err);
    return false;
  }
}

async function getData(path) {
  try {
    const snapshot = await db.ref(path).once("value");
    return snapshot.exists() ? snapshot.val() : null;
  } catch (err) {
    console.error("Error getting data:", err);
    return null;
  }
}

async function updateData(path, value) {
  try {
    await db.ref(path).update(value);
    return true;
  } catch (err) {
    console.error("Error updating data:", err);
    return false;
  }
}

async function deleteData(path) {
  try {
    await db.ref(path).remove();
    return true;
  } catch (err) {
    console.error("Error deleting data:", err);
    return false;
  }
}

module.exports = { setData, getData, updateData, deleteData };
