// ===== Anime Tracker Supabase Integration =====
// Supabase Auth + Database for multi-user cloud sync.
// When disabled or offline, falls back to localStorage only.

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

  let supabase = null;
  let _authListener = null;

  // ========== Init ==========

  CLOUD.init = function(config) {
    if (!config || !config.url || !config.anonKey || config.anonKey === 'YOUR_ANON_KEY') {
      console.log('[AnimeCloud] Supabase not configured, using localStorage mode');
      CLOUD.ready = false;
      return false;
    }
    try {
      supabase = window.supabase.createClient(config.url, config.anonKey);

      // Remove previous listener if any
      if (_authListener) {
        _authListener.subscription.unsubscribe();
        _authListener = null;
      }

      // Auth state listener
      const { data: { subscription } } = supabase.auth.onAuthStateChange(function(event, session) {
        if (session && session.user) {
          CLOUD.loggedIn = true;
          CLOUD.uid = session.user.id;
          CLOUD.email = session.user.email || '';
          CLOUD.displayName = session.user.user_metadata?.display_name || session.user.email || '';
          console.log('[AnimeCloud] User signed in:', CLOUD.displayName);
        } else {
          CLOUD.loggedIn = false;
          CLOUD.uid = null;
          CLOUD.email = '';
          CLOUD.displayName = '';
          console.log('[AnimeCloud] User signed out');
        }
        CLOUD._listeners.forEach(function(fn) { try { fn(CLOUD.loggedIn); } catch(e) {} });
      });
      _authListener = { subscription };

      // Restore existing session immediately
      supabase.auth.getSession().then(function({ data: { session } }) {
        if (session && session.user) {
          CLOUD.loggedIn = true;
          CLOUD.uid = session.user.id;
          CLOUD.email = session.user.email || '';
          CLOUD.displayName = session.user.user_metadata?.display_name || session.user.email || '';
        }
        CLOUD._listeners.forEach(function(fn) { try { fn(CLOUD.loggedIn); } catch(e) {} });
      });

      CLOUD.ready = true;
      console.log('[AnimeCloud] Supabase initialized');
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

  CLOUD.getToken = async function() {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session ? session.access_token : null;
  };

  // ========== Auth ==========

  CLOUD.register = async function(email, password, displayName) {
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: { data: { display_name: displayName || email.split('@')[0] } },
    });
    if (error) {
      const err = new Error(error.message);
      if (error.message.includes('already registered') || error.message.includes('already exists')) {
        err.code = 'auth/email-already-in-use';
      } else if (error.message.includes('valid email')) {
        err.code = 'auth/invalid-email';
      } else if (error.message.includes('weak password')) {
        err.code = 'auth/weak-password';
      }
      throw err;
    }
    if (!data.user) throw new Error('注册失败');
    if (data.session) {
      CLOUD.loggedIn = true;
      CLOUD.uid = data.user.id;
      CLOUD.email = data.user.email || '';
      CLOUD.displayName = displayName || email.split('@')[0];
    }
    return { uid: data.user.id, email: data.user.email, displayName: displayName || email.split('@')[0] };
  };

  CLOUD.login = async function(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const err = new Error(error.message);
      if (error.message.includes('Invalid login credentials')) {
        err.code = 'auth/invalid-credential';
      }
      throw err;
    }
    CLOUD.loggedIn = true;
    CLOUD.uid = data.user.id;
    CLOUD.email = data.user.email || '';
    CLOUD.displayName = data.user.user_metadata?.display_name || email;
    return { uid: data.user.id, email: data.user.email, displayName: CLOUD.displayName };
  };

  CLOUD.logout = async function() {
    await supabase.auth.signOut();
  };

  // ========== Data: Anime ==========

  function animeTbl() { return supabase.from('anime_items'); }

  CLOUD.loadAnimeList = async function() {
    if (!CLOUD.loggedIn) return null;
    const { data, error } = await animeTbl().select('*').eq('user_id', CLOUD.uid).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(function(d) {
      return {
        id: d.id,
        title: d.title || '',
        category: d.category || 'japanese_anime',
        status: d.status || 'towatch',
        episodes: d.episodes || 0,
        currentEp: d.current_ep || 0,
        totalEpisodes: d.total_episodes || 0,
        watchedEpisodes: Array.isArray(d.watched_episodes)
          ? d.watched_episodes
          : Array.from({ length: d.current_ep || 0 }, function(_, i) { return i + 1; }),
        cover: d.cover || '',
        url: d.url || '',
        synopsis: d.synopsis || '',
        score: d.score || null,
        genres: d.genres || [],
        covers: d.covers || [],
        year: d.year || null,
        sourceUrl: d.source_url || '',
        folderId: d.folder_id || null,
        notes: d.notes || '',
        createdAt: d.created_at || new Date().toISOString(),
        _fromCloud: true,
      };
    });
  };

  function animeRow(anime) {
    return {
      user_id: CLOUD.uid,
      id: String(anime.id),
      title: anime.title || '',
      category: anime.category || 'japanese_anime',
      status: anime.status || 'towatch',
      episodes: anime.episodes || 0,
      current_ep: Array.isArray(anime.watchedEpisodes) ? anime.watchedEpisodes.length : (anime.currentEp || 0),
      total_episodes: anime.totalEpisodes || 0,
      cover: anime.cover || '',
      url: anime.url || '',
      synopsis: anime.synopsis || '',
      score: anime.score || null,
      genres: anime.genres || [],
      covers: anime.covers || [],
      year: anime.year || null,
      source_url: anime.sourceUrl || '',
      folder_id: anime.folderId || null,
      notes: anime.notes || '',
      updated_at: new Date().toISOString(),
      created_at: anime.createdAt || new Date().toISOString(),
    };
  }

  CLOUD.saveAnime = async function(anime) {
    if (!CLOUD.loggedIn) return;
    const { error } = await animeTbl().upsert(animeRow(anime), { onConflict: 'user_id,id' });
    if (error) throw new Error(error.message);
  };

  CLOUD.deleteAnime = async function(id) {
    if (!CLOUD.loggedIn) return;
    const { error } = await animeTbl().delete().eq('user_id', CLOUD.uid).eq('id', String(id));
    if (error) throw new Error(error.message);
  };

  CLOUD.batchSaveAnime = async function(list) {
    if (!CLOUD.loggedIn) return;
    if (!list || list.length === 0) return;
    const rows = list.map(function(a) { return animeRow(a); });
    const { error } = await animeTbl().upsert(rows, { onConflict: 'user_id,id' });
    if (error) throw new Error(error.message);
  };

  CLOUD.batchDeleteAnime = async function(ids) {
    if (!CLOUD.loggedIn) return;
    for (var i = 0; i < ids.length; i++) {
      const { error } = await animeTbl().delete().eq('user_id', CLOUD.uid).eq('id', String(ids[i]));
      if (error) throw new Error(error.message);
    }
  };

  // ========== Data: Folders ==========

  function folderTbl() { return supabase.from('folders'); }

  CLOUD.loadFolders = async function() {
    if (!CLOUD.loggedIn) return null;
    const { data, error } = await folderTbl().select('*').eq('user_id', CLOUD.uid).order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map(function(d) {
      return { id: d.id, name: d.name || '', icon: d.icon || '📁', createdAt: d.created_at || new Date().toISOString(), _fromCloud: true };
    });
  };

  function folderRow(f) {
    return {
      user_id: CLOUD.uid,
      id: String(f.id),
      name: f.name || '',
      icon: f.icon || '📁',
      created_at: f.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  CLOUD.saveFolder = async function(folder) {
    if (!CLOUD.loggedIn) return;
    const { error } = await folderTbl().upsert(folderRow(folder), { onConflict: 'user_id,id' });
    if (error) throw new Error(error.message);
  };

  CLOUD.deleteFolder = async function(id) {
    if (!CLOUD.loggedIn) return;
    const { error } = await folderTbl().delete().eq('user_id', CLOUD.uid).eq('id', String(id));
    if (error) throw new Error(error.message);
  };

  CLOUD.saveAllFolders = async function(list) {
    if (!CLOUD.loggedIn) return;
    // Delete existing then insert new
    let result = await folderTbl().delete().eq('user_id', CLOUD.uid);
    if (result.error) throw new Error(result.error.message);
    if (list.length > 0) {
      result = await folderTbl().insert(list.map(function(f) { return folderRow(f); }));
      if (result.error) throw new Error(result.error.message);
    }
  };

  // ========== Data: Sources ==========

  function sourceTbl() { return supabase.from('sources'); }

  CLOUD.loadSources = async function() {
    if (!CLOUD.loggedIn) return null;
    const { data, error } = await sourceTbl().select('*').eq('user_id', CLOUD.uid).order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map(function(d) {
      return { id: d.id, name: d.name || '', url: d.url || '', createdAt: d.created_at || new Date().toISOString(), _fromCloud: true };
    });
  };

  function sourceRow(s) {
    return {
      user_id: CLOUD.uid,
      id: String(s.id),
      name: s.name || '',
      url: s.url || '',
      created_at: s.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  CLOUD.saveSource = async function(source) {
    if (!CLOUD.loggedIn) return;
    const { error } = await sourceTbl().upsert(sourceRow(source), { onConflict: 'user_id,id' });
    if (error) throw new Error(error.message);
  };

  CLOUD.deleteSource = async function(id) {
    if (!CLOUD.loggedIn) return;
    const { error } = await sourceTbl().delete().eq('user_id', CLOUD.uid).eq('id', String(id));
    if (error) throw new Error(error.message);
  };

  CLOUD.saveAllSources = async function(list) {
    if (!CLOUD.loggedIn) return;
    let result = await sourceTbl().delete().eq('user_id', CLOUD.uid);
    if (result.error) throw new Error(result.error.message);
    if (list.length > 0) {
      result = await sourceTbl().insert(list.map(function(s) { return sourceRow(s); }));
      if (result.error) throw new Error(result.error.message);
    }
  };

  // ========== Data: Settings ==========

  CLOUD.loadSettings = async function() {
    if (!CLOUD.loggedIn) return null;
    const { data } = await supabase.from('user_settings').select('*').eq('user_id', CLOUD.uid).maybeSingle();
    if (!data) return {};
    return {
      apiKey: data.api_key || '',
      apiProvider: data.api_provider || 'deepseek',
      apiUrl: data.api_url || 'https://api.deepseek.com',
      apiModel: data.api_model || 'deepseek-v4-flash',
      theme: data.theme || 'anime',
    };
  };

  CLOUD.saveSettings = async function(settings) {
    if (!CLOUD.loggedIn) return;
    const row = {
      user_id: CLOUD.uid,
      api_key: settings.apiKey || '',
      api_provider: settings.apiProvider || 'deepseek',
      api_url: settings.apiUrl || 'https://api.deepseek.com',
      api_model: settings.apiModel || 'deepseek-v4-flash',
      theme: settings.theme || 'anime',
      updated_at: new Date().toISOString(),
    };
    await supabase.from('user_settings').upsert(row, { onConflict: 'user_id' });
  };

  // ========== Data: Search History ==========

  CLOUD.loadSearchHistory = async function() {
    if (!CLOUD.loggedIn) return null;
    const { data } = await supabase.from('user_settings').select('search_history').eq('user_id', CLOUD.uid).maybeSingle();
    return (data && data.search_history) || [];
  };

  CLOUD.saveSearchHistory = async function(terms) {
    if (!CLOUD.loggedIn) return;
    await supabase.from('user_settings').upsert({
      user_id: CLOUD.uid,
      search_history: (terms || []).slice(0, 50),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  };

})();
