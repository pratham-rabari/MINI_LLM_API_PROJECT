
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import serviceAccount from "./serviceAccount.json" with { type: "json" };

const app = initializeApp({
  credential: cert(serviceAccount),
});

export const auth = getAuth(app);
