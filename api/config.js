export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
  };

  const backendUrl = process.env.BACKEND_URL || 'https://whiteboard-real-time-1.onrender.com';

  res
    .set('Cache-Control', 'no-store')
    .type('application/javascript')
    .send(
      `window.__FIREBASE_CONFIG__ = ${JSON.stringify(firebaseConfig)};\nwindow.BACKEND_URL = ${JSON.stringify(backendUrl)};`
    );
}
