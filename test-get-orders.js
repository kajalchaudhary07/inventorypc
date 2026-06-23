import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

const cfg = {
  apiKey: "AIzaSyCKu9aA60cAt4qvm9m63hPIIryYMQOHXgo",
  authDomain: "purecuts-11a7c.firebaseapp.com",
  projectId: "purecuts-11a7c",
  storageBucket: "purecuts-11a7c.firebasestorage.app",
  messagingSenderId: "285724819496",
  appId: "1:285724819496:web:aec9d12d0eba297b13b51d",
};

const app = initializeApp(cfg);
const db = getFirestore(app);

const q = query(collection(db, "orders"), limit(3));
const snap = await getDocs(q);
snap.forEach(d => {
  console.log("ORDER ID:", d.id);
  console.log("DATA:", JSON.stringify(d.data(), null, 2));
});
process.exit(0);
