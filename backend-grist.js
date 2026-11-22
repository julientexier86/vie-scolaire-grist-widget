/* Remplace le serveur de l'ancienne application par le document Grist.
 * Chargé avant les scripts de cpe.html et aed.html : les appels fetch("/api/...") sont traités ici.
 * Sans widget Grist (page ouverte seule ou servie par l'ancien serveur), rien n'est modifié.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./etat-grist.js'));
  else root.BackendGrist = factory(root.EtatGrist);
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';

  const NOMS = Object.keys(G.TABLES);
  const MSG_COMPTES = 'Les comptes et les mots de passe sont gérés par Grist (partage du document).';
  const rep = (corps, statut) => ({statut: statut || 200, corps});

  // Lundis (secondes UTC, minuit) de l'année scolaire absents de SemainesReelles. Grist n'ayant pas de
  // planificateur, cette liste sert à compléter la table à l'ouverture du widget.
  const JOUR = 86400, SEMAINE = 7 * JOUR;
  function lundisManquants(debut, fin, existants) {
    if (!Number.isFinite(debut) || !Number.isFinite(fin) || fin < debut) return [];
    const pris = new Set((existants || []).map(Number));
    const j = new Date(debut * 1000).getUTCDay(); // 0 = dimanche
    let l = Math.floor(debut / JOUR) * JOUR - ((j + 6) % 7) * JOUR;
    const res = [];
    for (; l <= fin; l += SEMAINE) if (!pris.has(l)) res.push(l);
    return res;
  }

  // io : { lire(nom) -> Promise<[{id,...}]> (rejet si accès refusé), appliquer(actions) -> Promise }
  function creer(io) {
    let completee = false;
    let base = null; // lignes cibles au dernier chargement/enregistrement (fusion à trois voies)

    async function lireTout() {
      const res = await Promise.all(NOMS.map(n => io.lire(n).then(r => [n, r], () => [n, null])));
      const t = {};
      for (const [n, r] of res) if (r) t[n] = r;
      if (!t.AED || !t.Postes) throw new Error('Tables du document inaccessibles');
      return t;
    }
    const rhLisible = t => !!t.DossiersRH;

    // Ajoute les lundis manquants. Silencieux en cas de refus : la planification n'en dépend pas.
    async function completerSemaines() {
      try {
        const [reg, sem] = await Promise.all([io.lire('Reglages'), io.lire('SemainesReelles')]);
        const r = reg && reg[0]; if (!r) return 0;
        const manquants = lundisManquants(Number(r.debut_annee), Number(r.fin_annee), sem.map(x => x.lundi));
        if (!manquants.length) return 0;
        await io.appliquer([['BulkAddRecord', 'SemainesReelles', manquants.map(() => null), {lundi: manquants}]]);
        return manquants.length;
      } catch (e) { return 0; }
    }

    async function etat() {
      const t = await lireTout();
      const e = G.tablesVersEtat(t);
      base = G.etatVersTables(e, {sansRH: !rhLisible(t)});
      return {e, t};
    }

    async function appliquer(phases) {
      for (const p of phases) await io.appliquer(p);
    }
    function messageErreur(err) {
      const m = String((err && err.message) || err || '');
      if (/Blocked by (row )?(create|update|delete|read)? ?access rules|access rules/i.test(m)) return 'Enregistrement refusé par les règles du document Grist (valeur invalide ou action non autorisée) : ' + m;
      return m || 'Erreur inconnue';
    }

    async function traiter(methode, chemin, corps) {
      try {
        if (chemin === '/api/moi') {
          const t = await lireTout();
          const cpe = rhLisible(t);
          if (cpe && !completee) { completee = true; await completerSemaines(); }
          return rep({login: 'grist', nom: 'Utilisateur Grist', role: cpe ? 'cpe' : 'aed'});
        }
        if (chemin === '/api/etat' && methode === 'GET') {
          const {e, t} = await etat();
          if (!rhLisible(t)) return rep({erreur: 'accès réservé aux propriétaires du document'}, 403);
          return rep(e);
        }
        if (chemin === '/api/etat' && methode === 'PUT') {
          if (!corps || !Array.isArray(corps.aeds) || !Array.isArray(corps.postes)) return rep({erreur: 'données invalides'}, 400);
          const t = await lireTout();
          if (!rhLisible(t)) return rep({erreur: 'accès réservé aux propriétaires du document'}, 403);
          const cible = G.etatVersTables(corps);
          const plan = G.calculerActions(t, cible, {base: base || undefined});
          await appliquer(plan.phases);
          base = cible;
          return rep({ok: true, ...plan.resume});
        }
        if (chemin === '/api/repartitions' && methode === 'GET') {
          const t = await lireTout();
          const e = G.tablesVersEtat({AED: t.AED, Postes: t.Postes, SemainesTypes: t.SemainesTypes || [], Repartitions: t.Repartitions || [], SousPostes: t.SousPostes || []});
          if (base) base.Repartitions = G.etatVersTables(e, {sansRH: true}).Repartitions;
          return rep(e.repartitions);
        }
        if (chemin === '/api/repartition' && methode === 'POST') {
          const t = await lireTout();
          const actions = G.actionRepartition(t, corps || {});
          if (actions.length) await io.appliquer(actions);
          const t2 = await lireTout();
          const e = G.tablesVersEtat({AED: t2.AED, Postes: t2.Postes, SemainesTypes: [], Repartitions: t2.Repartitions || [], SousPostes: t2.SousPostes || []});
          if (base) base.Repartitions = G.etatVersTables(e, {sansRH: true}).Repartitions;
          return rep({ok: true, repartitions: e.repartitions});
        }
        if (chemin === '/api/aed/data') {
          const t = await lireTout();
          return rep(G.donneesPourAed(G.tablesVersEtat(t)));
        }
        if (chemin === '/api/comptes' && methode === 'GET') return rep([]);
        if (chemin === '/api/journal') return rep([]);
        if (chemin === '/api/deconnexion') return rep({ok: true});
        if (chemin.startsWith('/api/comptes') || chemin === '/api/mdp') return rep({erreur: MSG_COMPTES}, 400);
        return rep({erreur: 'route inconnue'}, 404);
      } catch (err) {
        return rep({erreur: messageErreur(err)}, /inaccessibles/.test(String(err && err.message)) ? 503 : /invalide|inconnu/.test(String(err && err.message)) ? 400 : 403);
      }
    }
    return {traiter};
  }

  // ---------- Installation dans le navigateur (widget Grist) ----------
  function ioWidget(grist) {
    return {
      async lire(nom) {
        const c = await grist.docApi.fetchTable(nom);
        const cols = Object.keys(c), n = (c.id || []).length, lignes = [];
        for (let i = 0; i < n; i++) { const r = {}; for (const k of cols) r[k] = c[k][i]; lignes.push(r); }
        return lignes;
      },
      appliquer(actions) { return grist.docApi.applyUserActions(actions); }
    };
  }
  function installer(fenetre) {
    if (!fenetre.grist || fenetre.self === fenetre.top) return false;
    fenetre.grist.ready({requiredAccess: 'full'});
    const back = creer(ioWidget(fenetre.grist));
    const natif = fenetre.fetch.bind(fenetre);
    const style = fenetre.document.createElement('style');
    style.textContent = '#btn-comptes,#btn-mdp,#btn-deco,button[onclick="deconnexion()"]{display:none!important}';
    fenetre.document.head.appendChild(style);
    function avertir(texte) {
      const d = fenetre.document.createElement('div');
      d.setAttribute('role', 'alert');
      d.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#7f1d1d;color:#fff;padding:10px 16px;border-radius:10px;font:13px system-ui;z-index:99999;max-width:80vw;box-shadow:0 6px 20px #0004';
      d.textContent = texte; fenetre.document.body.appendChild(d); setTimeout(() => d.remove(), 9000);
    }
    fenetre.fetch = async function (url, opts) {
      const chemin = typeof url === 'string' ? url : (url && url.url) || '';
      if (!chemin.startsWith('/api/')) return natif(url, opts);
      const methode = ((opts && opts.method) || 'GET').toUpperCase();
      let corps; try { corps = opts && opts.body ? JSON.parse(opts.body) : undefined; } catch (e) { corps = undefined; }
      const r = await back.traiter(methode, chemin.split('?')[0], corps);
      if (r.statut >= 400 && r.corps && r.corps.erreur && !/\/api\/(moi|comptes|mdp|journal)/.test(chemin) && methode !== 'GET') avertir(r.corps.erreur);
      return new fenetre.Response(JSON.stringify(r.corps), {status: r.statut, headers: {'Content-Type': 'application/json'}});
    };
    return true;
  }
  if (typeof window !== 'undefined' && window.grist) installer(window);
  return {creer, installer, ioWidget, lundisManquants};
});
