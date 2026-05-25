// ===== Anime Tracker Firebase Integration =====
// Provides auth + Firestore data storage for multi-user GitHub Pages deployment.
// When disabled, falls back to localStorage + server auth.

(function() {
  'use strict';

  const CLOUD = window.AnimeCloud = {
    ready: false,
    loggedIn: false,
    uid: null,
    displayName: '',
    email: '',
    _listeners: [],
  };

  let db = null;
  let auth = null;

  // ========== Init ==========

  CLOUD.init = function(config) {
    if (!config || !config.apiKey || config.apiKey === 'YOUR_API_KEY') {
      console.log('[AnimeCloud] Firebase not configured, using localStorage mode');
      CLOUD.ready = false;
      return false;
    }
    try {
      firebase.initializeApp(config);
      auth = firebase.auth();
      db = firebase.firestore();
      // Enable offline persistence
      db.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
        if (err.code === 'failed-precondition') {
          console.warn('[AnimeCloud] Multiple tabs open, persistence disabled');
        }
      });

      // Auth state listener
      auth.onAuthStateChanged(function(user) {
        if (user) {
          CLOUD.loggedIn = true;
          CLOUD.uid = user.uid;
          CLOUD.email = user.email || '';
          CLOUD.displayName = user.displayName || user.email || '';
          console.log('[AnimeCloud] User signed in:', CLOUD.displayName);
        } else {
          CLOUD.loggedIn = false;
          CLOUD.uid = null;
          CLOUD.email = '';
          CLOUD.displayName = '';
          console.log('[AnimeCloud] User signed out');
        }
        // Notify listeners
        CLOUD._listeners.forEach(function(fn) { try { fn(CLOUD.loggedIn); } catch(e) {} });
      });

      CLOUD.ready = true;
      console.log('[AnimeCloud] Firebase initialized');
      return true;
    } catch(e) {
      console.error('[AnimeCloud] Init error:', e.message);
      CLOUD.ready = false;
      return false;
    }
  };

  CLOUD.onAuthChange = function(fn) {
    CLOUD._listeners.push(fn);
  };

  // ========== Auth ==========

  CLOUD.register = async function(email, password, displayName) {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: displayName || email });
    return { uid: cred.user.uid, email: cred.user.email, displayName: displayName || email };
  };

  CLOUD.login = async function(email, password) {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return { uid: cred.user.uid, email: cred.user.email, displayName: cred.user.displayName || email };
  };

  CLOUD.logout = async function() {
    await auth.signOut();
  };

  // ========== Data: Anime ==========

  function animeCol() {
    return db.collection('users').doc(CLOUD.uid).collection('anime');
  }

  CLOUD.loadAnimeList = async function() {
    if (!CLOUD.loggedIn) return null;
    const snap = await animeCol().orderBy('createdAt', 'desc').get();
    return snap.docs.map(function(d) {
      const data = d.data();
      return Object.assign({}, data, { id: d.id, _fromCloud: true });
    });
  };

  CLOUD.saveAnime = async function(anime) {
    if (!CLOUD.loggedIn) return;
    const doc = { title: anime.title || '', category: anime.category || 'japanese_anime', status: anime.status || 'towatch', episodes: anime.episodes || 0, currentEp: anime.currentEp || 0, totalEpisodes: anime.totalEpisodes || 0, cover: anime.cover || '', url: anime.url || '', synopsis: anime.synopsis || '', score: anime.score || null, genres: anime.genres || [], year: anime.year || null, sourceUrl: anime.sourceUrl || '', folderId: anime.folderId || null, notes: anime.notes || '', updatedAt: new Date().toISOString(), createdAt: anime.createdAt || new Date().toISOString() };
    await animeCol().doc(anime.id).set(doc);
  };

  CLOUD.deleteAnime = async function(id) {
    if (!CLOUD.loggedIn) return;
    await animeCol().doc(id).delete();
  };

  CLOUD.batchSaveAnime = async function(list) {
    if (!CLOUD.loggedIn) return;
    const batch = db.batch();
    const col = animeCol();
    list.forEach(function(a) {
      batch.set(col.doc(a.id), { title: a.title || '', category: a.category || 'japanese_anime', status: a.status || 'towatch', episodes: a.episodes || 0, currentEp: a.currentEp || 0, totalEpisodes: a.totalEpisodes || 0, cover: a.cover || '', url: a.url || '', synopsis: a.synopsis || '', score: a.score || null, genres: a.genres || [], year: a.year || null, sourceUrl: a.sourceUrl || '', folderId: a.folderId || null, notes: a.notes || '', updatedAt: new Date().toISOString(), createdAt: a.createdAt || new Date().toISOString() });
    });
    await batch.commit();
  };

  CLOUD.batchDeleteAnime = async function(ids) {
    if (!CLOUD.loggedIn) return;
    const batch = db.batch();
    const col = animeCol();
    ids.forEach(function(id) { batch.delete(col.doc(id)); });
    await batch.commit();
  };

  // ========== Data: Folders ==========

  function folderCol() {
    return db.collection('users').doc(CLOUD.uid).collection('folders');
  }

  CLOUD.loadFolders = async function() {
    if (!CLOUD.loggedIn) return null;
    const snap = await folderCol().orderBy('createdAt', 'asc').get();
    return snap.docs.map(function(d) { return Object.assign({}, d.data(), { id: d.id, _fromCloud: true }); });
  };

  CLOUD.saveFolder = async function(folder) {
    if (!CLOUD.loggedIn) return;
    await folderCol().doc(folder.id).set({ name: folder.name || '', icon: folder.icon || '📁', createdAt: folder.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
  };

  CLOUD.deleteFolder = async function(id) {
    if (!CLOUD.loggedIn) return;
    await folderCol().doc(id).delete();
  };

  CLOUD.saveAllFolders = async function(list) {
    if (!CLOUD.loggedIn) return;
    const batch = db.batch();
    const col = folderCol();
    list.forEach(function(f) {
      batch.set(col.doc(f.id), { name: f.name || '', icon: f.icon || '📁', createdAt: f.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
    });
    await batch.commit();
  };

  // ========== Data: Sources ==========

  function sourceCol() {
    return db.collection('users').doc(CLOUD.uid).collection('sources');
  }

  CLOUD.loadSources = async function() {
    if (!CLOUD.loggedIn) return null;
    const snap = await sourceCol().orderBy('createdAt', 'asc').get();
    return snap.docs.map(function(d) { return Object.assign({}, d.data(), { id: d.id, _fromCloud: true }); });
  };

  CLOUD.saveSource = async function(source) {
    if (!CLOUD.loggedIn) return;
    await sourceCol().doc(source.id).set({ name: source.name || '', url: source.url || '', createdAt: source.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
  };

  CLOUD.deleteSource = async function(id) {
    if (!CLOUD.loggedIn) return;
    await sourceCol().doc(id).delete();
  };

  CLOUD.saveAllSources = async function(list) {
    if (!CLOUD.loggedIn) return;
    const batch = db.batch();
    const col = sourceCol();
    list.forEach(function(s) {
      batch.set(col.doc(s.id), { name: s.name || '', url: s.url || '', createdAt: s.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
    });
    await batch.commit();
  };

  // ========== Data: Settings ==========

  CLOUD.loadSettings = async function() {
    if (!CLOUD.loggedIn) return null;
    const doc = await db.collection('users').doc(CLOUD.uid).collection('settings').doc('prefs').get();
    return doc.exists ? doc.data() : {};
  };

  CLOUD.saveSettings = async function(settings) {
    if (!CLOUD.loggedIn) return;
    await db.collection('users').doc(CLOUD.uid).collection('settings').doc('prefs').set(Object.assign({}, settings, { updatedAt: new Date().toISOString() }), { merge: true });
  };

  // ========== Data: Search History ==========

  CLOUD.loadSearchHistory = async function() {
    if (!CLOUD.loggedIn) return null;
    const doc = await db.collection('users').doc(CLOUD.uid).collection('settings').doc('searchHistory').get();
    return doc.exists ? (doc.data().terms || []) : [];
  };

  CLOUD.saveSearchHistory = async function(terms) {
    if (!CLOUD.loggedIn) return;
    await db.collection('users').doc(CLOUD.uid).collection('settings').doc('searchHistory').set({ terms: terms.slice(0, 50), updatedAt: new Date().toISOString() });
  };

})();
