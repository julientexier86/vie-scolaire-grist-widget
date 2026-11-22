/* Conversion entre l'état de l'ancienne application (objet JSON « etat ») et les tables du socle Grist.
 * - tablesVersEtat(tables)  : lit des tables Grist (lignes brutes) et reconstitue l'état.
 * - etatVersTables(etat)    : produit les lignes cibles de chaque table (types Grist).
 * - calculerActions(actuel, cible, options) : différences à appliquer, en deux phases ordonnées.
 * - donneesPourAed(etat)    : projection sans données RH pour l'espace AED.
 * Aucun accès réseau : les entrées/sorties sont assurées par backend-grist.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EtatGrist = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
  const RATTRAPAGE_DEFAUT = {Maladie: false, Formation: false, 'Grève': false, "Garde d'enfant": false, 'Convenance personnelle': true, Autre: true};
  const PERIODES_ETUDE = [['08:30', '09:25'], ['09:25', '10:40'], ['10:40', '11:35'], ['11:35', '12:30'], ['12:30', '13:30'], ['13:30', '14:25'], ['14:25', '15:35'], ['15:35', '16:30']];
  // T texte, D date, B booléen, N nombre, A quelconque
  const TABLES = {
    AED: {k: ['source_id'], t: {source_id: 'T', nom: 'T'}},
    DossiersRH: {rh: 1, k: ['aed_source_id'], t: {aed_source_id: 'T', quotite: 'N', contrat_type: 'T', contrat_debut: 'A', contrat_fin: 'A', statut_depuis: 'A', telephone: 'A', email: 'A', urgence: 'A', donnees_completes_json: 'T'}},
    Postes: {k: ['source_id'], t: {source_id: 'T', nom: 'T', couleur: 'N', donnees_completes_json: 'T'}},
    SemainesTypes: {k: ['source_id'], t: {source_id: 'T', nom: 'T', active: 'B'}},
    CreneauxTypes: {leaf: 1, k: ['semaine_source_id', 'aed_source_id', 'jour', 'debut'], t: {semaine_source_id: 'T', aed_source_id: 'T', jour: 'T', debut: 'T', fin: 'T', poste_source_id: 'T'}},
    SemainesDerogatoires: {k: ['lundi'], t: {lundi: 'D'}},
    CreneauxDerogatoires: {leaf: 1, k: ['lundi', 'aed_source_id', 'jour', 'debut'], t: {lundi: 'D', aed_source_id: 'T', jour: 'T', debut: 'T', fin: 'T', poste_source_id: 'T'}},
    AbsencesRH: {rh: 1, leaf: 1, k: ['source_id'], t: {source_id: 'T', aed_source_id: 'T', debut: 'D', fin: 'D', motif: 'T', note: 'T', rattraper: 'B', statut: 'T', donnees_completes_json: 'T'}},
    EcrituresHeures: {rh: 1, leaf: 1, k: ['source_id'], t: {source_id: 'T', aed_source_id: 'T', date: 'D', heures: 'N', motif: 'T', note: 'T', donnees_completes_json: 'T'}},
    Contrats: {rh: 1, leaf: 1, k: ['aed_source_id', 'source_id'], t: {aed_source_id: 'T', source_id: 'T', type: 'T', debut: 'D', fin: 'D', quotite: 'N', fin_essai: 'A', note: 'A', donnees_completes_json: 'T'}},
    Entretiens: {rh: 1, leaf: 1, k: ['aed_source_id', 'source_id'], t: {aed_source_id: 'T', source_id: 'T', date: 'D', realise: 'B', compte_rendu: 'T', donnees_completes_json: 'T'}},
    Formations: {rh: 1, leaf: 1, k: ['aed_source_id', 'source_id'], t: {aed_source_id: 'T', source_id: 'T', nom: 'T', date: 'D', validite: 'D', note: 'A', donnees_completes_json: 'T'}},
    Observations: {rh: 1, leaf: 1, k: ['aed_source_id', 'source_id'], t: {aed_source_id: 'T', source_id: 'T', date: 'D', texte: 'T', donnees_completes_json: 'T'}},
    AbsencesHebdomadaires: {leaf: 1, k: ['aed_source_id', 'jour'], t: {aed_source_id: 'T', jour: 'T'}},
    Indisponibilites: {leaf: 1, k: ['aed_source_id', 'jour', 'debut'], t: {aed_source_id: 'T', jour: 'T', debut: 'T', fin: 'T'}},
    Besoins: {leaf: 1, k: ['source_id'], t: {source_id: 'T', poste_source_id: 'T', jour: 'T', debut: 'T', fin: 'T', nombre: 'N', donnees_completes_json: 'T'}},
    EffectifsEtude: {leaf: 1, k: ['jour', 'periode_index'], t: {jour: 'T', periode_index: 'N', effectif: 'N'}},
    Repartitions: {leaf: 1, k: ['date', 'bande', 'aed_source_id'], t: {date: 'D', bande: 'T', aed_source_id: 'T', sous_poste: 'T'}},
    SousPostes: {k: ['bande', 'libelle'], t: {bande: 'T', libelle: 'T'}},
    Vacances: {leaf: 1, k: ['source_id'], t: {source_id: 'T', nom: 'T', debut: 'D', fin: 'D', donnees_completes_json: 'T'}},
    Parametres: {rh: 1, k: ['cle'], t: {cle: 'T', valeur_json: 'T'}},
    Reglages: {k: [], t: {titre: 'A', debut_annee: 'D', fin_annee: 'D', zone: 'T', alternance_mode: 'T', semaine_paire: 'T', semaine_impaire: 'T', poste_etude: 'A', poste_midi: 'A', midi_debut: 'T', midi_fin: 'T', capacite_principale: 'N', capacite_annexe: 'N', semaines_travaillees: 'N'}},
    PeriodesEtude: {k: ['periode_index'], t: {periode_index: 'N', debut: 'T', fin: 'T'}}
  };
  const MIROIR_EXCLUS = new Set(['titre', 'posteEtude', 'posteMidi', 'capaPrincipale', 'capaAnnexe', 'semainesTravaillees']); // déjà portées par Reglages
  const CLES_STRUCTURELLES = new Set(['aeds', 'postes', 'semaines', 'planning', 'derogations', 'absencesAn', 'heuresJournal', 'repartitions', 'sousPostesMidi', 'sousPostesEtude']);

  // ---------- Valeurs ----------
  const vide = v => v === undefined || v === null || v === '';
  function isoVersSecondes(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s + 'T00:00:00Z');
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s ? d.valueOf() / 1000 : s;
  }
  function versGrist(type, v) {
    if (type === 'B') return v === true || v === 'true' || v === 1;
    if (vide(v)) return type === 'T' ? '' : null;
    if (type === 'D') return isoVersSecondes(v);
    if (type === 'N') return typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v;
    if (type === 'T') return typeof v === 'string' ? v : String(v);
    return v;
  }
  function depuisGrist(type, v) {
    if (type === 'B') return !!v;
    if (vide(v)) return '';
    if (type === 'D') return typeof v === 'number' ? new Date(v * 1000).toISOString().slice(0, 10) : v;
    return v;
  }
  const canon = v => vide(v) ? '' : typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
  const cle = (def, row) => def.k.map(c => canon(row[c])).join('\u0001');
  const json = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(c => [c, x[c]])) : x);
  const analyser = s => { try { const v = JSON.parse(s); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } };

  // ---------- Créneaux ----------
  const heure = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const minutes = h => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(h)); return m ? +m[1] * 60 + +m[2] : NaN; };
  function planningVersLignes(plan, prefixe) {
    const lignes = [];
    for (const [aid, jours] of Object.entries(plan || {})) for (const [jour, crans] of Object.entries(jours || {})) {
      const idx = Object.keys(crans || {}).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < 132 && crans[n]).sort((a, b) => a - b);
      for (let i = 0; i < idx.length;) {
        const premier = idx[i], poste = crans[premier]; let dernier = premier; i++;
        while (i < idx.length && idx[i] === dernier + 1 && crans[idx[i]] === poste) { dernier = idx[i]; i++; }
        lignes.push({...prefixe, aed_source_id: aid, jour, debut: heure(450 + premier * 5), fin: heure(450 + (dernier + 1) * 5), poste_source_id: String(poste)});
      }
    }
    return lignes;
  }
  function lignesVersPlanning(lignes, plan) {
    for (const r of lignes) {
      const a = (r.minutes_debut - 450) / 5, b = (r.minutes_fin - 450) / 5;
      const cases = ((plan[r.aed_source_id] ||= {})[r.jour] ||= {});
      for (let i = a; i < b; i++) cases[i] = r.poste_source_id;
    }
    return plan;
  }
  function creneauxEnPlanning(rows, planFor) {
    for (const r of rows) {
      const plan = planFor(r); if (!plan) continue;
      const a = minutes(r.debut), b = minutes(r.fin);
      if (!(a >= 450 && b <= 1110 && a < b && (a - 450) % 5 === 0 && (b - 450) % 5 === 0)) continue;
      const cases = ((plan[r.aed_source_id] ||= {})[r.jour] ||= {});
      for (let i = (a - 450) / 5; i < (b - 450) / 5; i++) cases[i] = r.poste_source_id;
    }
  }

  // ---------- Lecture : tables -> état ----------
  function lignes(tables, nom) {
    const def = TABLES[nom];
    const src = tables[nom];
    if (!Array.isArray(src)) return null;
    return src.map(r => { const o = {id: r.id}; for (const [c, t] of Object.entries(def.t)) o[c] = depuisGrist(t, r[c]); return o; });
  }
  function posee(obj, champ, valeur, base) { if (valeur !== '' || (base && champ in base)) obj[champ] = valeur; }

  function tablesVersEtat(tables) {
    const L = n => lignes(tables, n);
    const aedL = L('AED') || [], posteL = L('Postes') || [], semL = L('SemainesTypes') || [];
    const rhVisible = !!L('DossiersRH');
    const param = {};
    for (const r of L('Parametres') || []) { try { param[r.cle] = JSON.parse(r.valeur_json); } catch (e) { /* ignoré */ } }
    const etat = {};
    for (const [k, v] of Object.entries(param)) if (!CLES_STRUCTURELLES.has(k)) etat[k] = v;
    etat.version = 2;

    // Réglages
    const g = (L('Reglages') || [])[0] || {};
    if (g.titre !== undefined) etat.titre = g.titre;
    etat.posteEtude = g.poste_etude || ''; etat.posteMidi = g.poste_midi || '';
    etat.capaPrincipale = g.capacite_principale === '' ? undefined : g.capacite_principale;
    etat.capaAnnexe = g.capacite_annexe === '' ? undefined : g.capacite_annexe;
    etat.semainesTravaillees = g.semaines_travaillees === '' ? undefined : g.semaines_travaillees;
    const reg = {...(param.reglages && typeof param.reglages === 'object' ? param.reglages : {})};
    reg.debutAnnee = g.debut_annee || ''; reg.finAnnee = g.fin_annee || ''; reg.zone = g.zone || '';
    reg.midiDebut = g.midi_debut || ''; reg.midiFin = g.midi_fin || '';
    reg.alternance = {...(reg.alternance || {}), mode: g.alternance_mode || 'active', semainePaire: g.semaine_paire || '', semaineImpaire: g.semaine_impaire || ''};
    const vacBase = new Map(((param.reglages || {}).vacances || []).map(v => [v && v.id, v]));
    reg.vacances = (L('Vacances') || []).map(r => ({...(vacBase.get(r.source_id) || {}), ...analyser(tables.Vacances.find(x => x.id === r.id).donnees_completes_json), id: r.source_id, nom: r.nom, du: r.debut, au: r.fin}));
    etat.reglages = reg;

    // Postes, semaines
    etat.postes = posteL.map(r => { const o = {...analyser(tables.Postes.find(x => x.id === r.id).donnees_completes_json), id: r.source_id, nom: r.nom}; posee(o, 'couleur', r.couleur, o); return o; });
    const plans = new Map(); etat.semaines = semL.map(r => { const p = {}; plans.set(r.source_id, p); return {id: r.source_id, nom: r.nom, planning: p}; });
    creneauxEnPlanning(L('CreneauxTypes') || [], r => plans.get(r.semaine_source_id));
    const active = semL.find(r => r.active) || semL[0];
    etat.semaineActive = active ? active.source_id : '';
    etat.planning = active ? plans.get(active.source_id) : {};
    etat.derogations = {};
    for (const r of L('SemainesDerogatoires') || []) etat.derogations[r.lundi] = {};
    creneauxEnPlanning(L('CreneauxDerogatoires') || [], r => etat.derogations[r.lundi]);

    // AED et RH
    const dossiers = new Map((L('DossiersRH') || []).map(r => [r.aed_source_id, r]));
    const brutDossier = new Map((tables.DossiersRH || []).map(r => [r.aed_source_id, r.donnees_completes_json]));
    const sous = {contrats: 'Contrats', entretiens: 'Entretiens', formations: 'Formations', obs: 'Observations'};
    const champsSous = {
      Contrats: r => ({type: r.type, du: r.debut, au: r.fin, quotite: r.quotite, finEssai: r.fin_essai, note: r.note}),
      Entretiens: r => ({date: r.date, realise: r.realise, cr: r.compte_rendu}),
      Formations: r => ({nom: r.nom, date: r.date, validite: r.validite, note: r.note}),
      Observations: r => ({date: r.date, texte: r.texte})
    };
    const rhRows = {};
    for (const [, nom] of Object.entries(sous)) {
      const rows = L(nom) || []; const brut = tables[nom] || [];
      rhRows[nom] = rows.map(r => ({r, base: analyser((brut.find(x => x.id === r.id) || {}).donnees_completes_json)}));
    }
    etat.aeds = aedL.map(r => {
      const d = dossiers.get(r.source_id);
      const a = rhVisible ? analyser(brutDossier.get(r.source_id)) : {};
      a.id = r.source_id; a.nom = r.nom;
      if (rhVisible && d) {
        posee(a, 'quotite', d.quotite, a); posee(a, 'contratType', d.contrat_type, a); posee(a, 'contratDebut', d.contrat_debut, a);
        posee(a, 'contratFin', d.contrat_fin, a); posee(a, 'statutDepuis', d.statut_depuis, a); posee(a, 'telephone', d.telephone, a); posee(a, 'email', d.email, a);
        a.rh = {...(a.rh || {})}; posee(a.rh, 'urgence', d.urgence, a.rh);
        for (const [cleSous, nom] of Object.entries(sous)) {
          const items = rhRows[nom].filter(x => x.r.aed_source_id === r.source_id).map(({r: l, base}) => {
            const o = {...base, id: l.source_id}; const champs = champsSous[nom](l);
            for (const [c, v] of Object.entries(champs)) posee(o, c, v, base); return o;
          });
          if (items.length || cleSous in a.rh) a.rh[cleSous] = items;
        }
      }
      return a;
    });
    if (rhVisible) {
      etat.absencesAn = (L('AbsencesRH') || []).map(r => ({...analyser(tables.AbsencesRH.find(x => x.id === r.id).donnees_completes_json), id: r.source_id, aedId: r.aed_source_id, du: r.debut, au: r.fin, motif: r.motif, note: r.note, rattraper: r.rattraper, statut: r.statut}));
      etat.heuresJournal = (L('EcrituresHeures') || []).map(r => ({...analyser(tables.EcrituresHeures.find(x => x.id === r.id).donnees_completes_json), id: r.source_id, aedId: r.aed_source_id, date: r.date, heures: r.heures, motif: r.motif, note: r.note}));
    }

    // Opérationnel
    etat.absences = {};
    for (const r of L('AbsencesHebdomadaires') || []) (etat.absences[r.aed_source_id] ||= {})[r.jour] = 1;
    etat.indispos = {};
    for (const r of L('Indisponibilites') || []) {
      const a = minutes(r.debut), b = minutes(r.fin); if (!(a >= 450 && b > a)) continue;
      const cases = ((etat.indispos[r.aed_source_id] ||= {})[r.jour] ||= {});
      for (let i = (a - 450) / 5; i < (b - 450) / 5; i++) cases[i] = 1;
    }
    etat.besoins = (L('Besoins') || []).map(r => ({...analyser(tables.Besoins.find(x => x.id === r.id).donnees_completes_json), id: r.source_id, posteId: r.poste_source_id, jour: r.jour, debut: r.debut, fin: r.fin, n: r.nombre}));
    etat.effectifs = {};
    for (const r of L('EffectifsEtude') || []) { const arr = etat.effectifs[r.jour] ||= Array(PERIODES_ETUDE.length).fill(''); if (r.periode_index >= 0) arr[r.periode_index] = r.effectif; }
    etat.sousPostesMidi = []; etat.sousPostesEtude = [];
    for (const r of L('SousPostes') || []) (r.bande === 'midi' ? etat.sousPostesMidi : etat.sousPostesEtude).push(r.libelle);
    etat.repartitions = {};
    for (const r of L('Repartitions') || []) (((etat.repartitions[r.date] ||= {})[r.bande] ||= {}))[r.aed_source_id] = r.sous_poste;
    for (const k of Object.keys(etat)) if (etat[k] === undefined) delete etat[k];
    return etat;
  }

  // ---------- Écriture : état -> lignes cibles ----------
  function etatVersTables(etat, options) {
    const rh = !(options && options.sansRH);
    const T = {}; for (const n of Object.keys(TABLES)) T[n] = [];
    const add = (nom, v) => { const o = {}; for (const [c, t] of Object.entries(TABLES[nom].t)) o[c] = versGrist(t, v[c]); T[nom].push(o); };
    const str = v => vide(v) ? '' : String(v);
    for (const a of etat.aeds || []) {
      if (!a || vide(a.id)) throw new Error('AED sans identifiant');
      add('AED', {source_id: str(a.id), nom: a.nom});
      if (!rh) continue;
      const r = a.rh || {};
      add('DossiersRH', {aed_source_id: str(a.id), quotite: a.quotite, contrat_type: a.contratType ?? 'CDD', contrat_debut: a.contratDebut, contrat_fin: a.contratFin, statut_depuis: a.statutDepuis ?? a.contratDebut, telephone: a.telephone, email: a.email, urgence: r.urgence, donnees_completes_json: json(a)});
      for (const row of r.contrats || []) add('Contrats', {aed_source_id: str(a.id), source_id: row.id, type: row.type, debut: row.du, fin: row.au, quotite: row.quotite, fin_essai: row.finEssai, note: row.note, donnees_completes_json: json(row)});
      for (const row of r.entretiens || []) add('Entretiens', {aed_source_id: str(a.id), source_id: row.id, date: row.date, realise: row.realise, compte_rendu: row.cr, donnees_completes_json: json(row)});
      for (const row of r.formations || []) add('Formations', {aed_source_id: str(a.id), source_id: row.id, nom: row.nom, date: row.date, validite: row.validite, note: row.note, donnees_completes_json: json(row)});
      for (const row of r.obs || []) add('Observations', {aed_source_id: str(a.id), source_id: row.id, date: row.date, texte: row.texte, donnees_completes_json: json(row)});
    }
    for (const p of etat.postes || []) { if (vide(p && p.id)) throw new Error('Poste sans identifiant'); add('Postes', {source_id: str(p.id), nom: p.nom, couleur: p.couleur, donnees_completes_json: json(p)}); }
    for (const s of etat.semaines || []) {
      if (vide(s && s.id)) throw new Error('Semaine sans identifiant');
      add('SemainesTypes', {source_id: str(s.id), nom: s.nom, active: s.id === etat.semaineActive});
      for (const l of planningVersLignes(s.planning, {semaine_source_id: str(s.id)})) add('CreneauxTypes', l);
    }
    for (const [lundi, plan] of Object.entries(etat.derogations || {})) {
      add('SemainesDerogatoires', {lundi});
      for (const l of planningVersLignes(plan, {lundi})) add('CreneauxDerogatoires', l);
    }
    if (rh) {
      for (const x of etat.absencesAn || []) add('AbsencesRH', {source_id: x.id, aed_source_id: x.aedId, debut: x.du, fin: x.au, motif: x.motif, note: x.note, rattraper: 'rattraper' in x && x.rattraper !== undefined ? x.rattraper : (RATTRAPAGE_DEFAUT[x.motif] ?? true), statut: x.statut || 'Déclarée', donnees_completes_json: json(x)});
      for (const x of etat.heuresJournal || []) add('EcrituresHeures', {source_id: x.id, aed_source_id: x.aedId, date: x.date, heures: x.heures, motif: x.motif, note: x.note, donnees_completes_json: json(x)});
    }
    for (const [aid, jours] of Object.entries(etat.absences || {})) for (const [jour, v] of Object.entries(jours || {})) if (v) add('AbsencesHebdomadaires', {aed_source_id: aid, jour});
    for (const [aid, jours] of Object.entries(etat.indispos || {})) for (const [jour, crans] of Object.entries(jours || {})) {
      const idx = Object.keys(crans || {}).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < 132 && crans[n]).sort((a, b) => a - b);
      for (let i = 0; i < idx.length;) { const p = idx[i]; let d = p; i++; while (i < idx.length && idx[i] === d + 1) { d = idx[i]; i++; } add('Indisponibilites', {aed_source_id: aid, jour, debut: heure(450 + p * 5), fin: heure(450 + (d + 1) * 5)}); }
    }
    for (const b of etat.besoins || []) add('Besoins', {source_id: b.id, poste_source_id: b.posteId, jour: b.jour, debut: b.debut, fin: b.fin, nombre: b.n, donnees_completes_json: json(b)});
    for (const [jour, valeurs] of Object.entries(etat.effectifs || {})) (valeurs || []).forEach((v, i) => add('EffectifsEtude', {jour, periode_index: i, effectif: v}));
    for (const [d, bandes] of Object.entries(etat.repartitions || {})) for (const [bande, gens] of Object.entries(bandes || {})) for (const [aid, sp] of Object.entries(gens || {})) add('Repartitions', {date: d, bande, aed_source_id: aid, sous_poste: sp});
    for (const [bande, k] of [['midi', 'sousPostesMidi'], ['etude', 'sousPostesEtude']]) for (const sp of etat[k] || []) add('SousPostes', {bande, libelle: sp});
    const r = etat.reglages || {}, alt = r.alternance || {};
    for (const v of r.vacances || []) add('Vacances', {source_id: v.id, nom: v.nom, debut: v.du, fin: v.au, donnees_completes_json: json(v)});
    add('Reglages', {titre: etat.titre, debut_annee: r.debutAnnee, fin_annee: r.finAnnee, zone: r.zone, alternance_mode: ['active', 'paireImpaire'].includes(alt.mode) ? alt.mode : 'active', semaine_paire: alt.semainePaire, semaine_impaire: alt.semaineImpaire, poste_etude: etat.posteEtude, poste_midi: etat.posteMidi, midi_debut: r.midiDebut || '11:35', midi_fin: r.midiFin || '13:30', capacite_principale: etat.capaPrincipale || 50, capacite_annexe: etat.capaAnnexe || 20, semaines_travaillees: etat.semainesTravaillees || 41});
    PERIODES_ETUDE.forEach(([debut, fin], i) => add('PeriodesEtude', {periode_index: i, debut, fin}));
    if (rh) for (const [k, v] of Object.entries(etat)) if (!CLES_STRUCTURELLES.has(k) && !MIROIR_EXCLUS.has(k) && v !== undefined) add('Parametres', {cle: k, valeur_json: json(v)});
    return T;
  }


  // ---------- Cohérence avant écriture ----------
  // Équivalent de l'intention de l'ancienne application (« les créneaux associés seront effacés ») :
  // quand un AED, un poste ou une semaine disparaît, ce qui s'y rapportait ailleurs disparaît aussi,
  // faute de quoi Grist (qui contrôle les références) refuserait l'enregistrement.
  function purger(etat) {
    const e = JSON.parse(JSON.stringify(etat));
    const aeds = new Set((e.aeds || []).map(a => a.id)), postes = new Set((e.postes || []).map(p => p.id));
    const nettoyer = plan => {
      for (const aid of Object.keys(plan || {})) {
        if (!aeds.has(aid)) { delete plan[aid]; continue; }
        for (const jour of Object.keys(plan[aid] || {})) {
          const crans = plan[aid][jour] || {};
          for (const [cr, pid] of Object.entries(crans)) if (!postes.has(pid)) delete crans[cr];
        }
      }
    };
    for (const s of e.semaines || []) nettoyer(s.planning);
    for (const d of Object.values(e.derogations || {})) nettoyer(d);
    if (e.planning && !(e.semaines || []).some(s => s.planning === e.planning)) nettoyer(e.planning);
    for (const k of ['absences', 'indispos']) for (const aid of Object.keys(e[k] || {})) if (!aeds.has(aid)) delete e[k][aid];
    for (const k of ['absencesAn', 'heuresJournal']) if (Array.isArray(e[k])) e[k] = e[k].filter(x => aeds.has(x.aedId));
    if (Array.isArray(e.besoins)) e.besoins = e.besoins.filter(b => postes.has(b.posteId));
    for (const bandes of Object.values(e.repartitions || {})) for (const gens of Object.values(bandes || {})) for (const aid of Object.keys(gens || {})) if (!aeds.has(aid)) delete gens[aid];
    return e;
  }

  // ---------- Différences ----------
  // actuel : {table: [{id, ...colonnes Grist}]} ; cible : sortie d'etatVersTables.
  function calculerActions(actuel, cible, options) {
    const sansRH = !!(options && options.sansRH);
    const phase1 = [], phase2 = [], phase3 = new Map(), resume = {ajouts: 0, modifications: 0, suppressions: 0};
    const protege = new Set((options && options.tablesIgnorees) || ['PeriodesEtude']);
    const base = options && options.base; // lignes cibles au dernier chargement : fusion à trois voies
    for (const [nom, def] of Object.entries(TABLES)) {
      if (protege.has(nom) || (sansRH && def.rh) || !Array.isArray(actuel[nom])) continue;
      const existants = new Map(), doublons = [];
      for (const r of actuel[nom]) { const c = cle(def, r); if (existants.has(c)) doublons.push(r.id); else existants.set(c, r); }
      const cibles = new Map(); for (const r of cible[nom]) { const c = cle(def, r); if (cibles.has(c)) throw new Error(`${nom} : clé en double (${c.replace(/\u0001/g, ' / ')})`); cibles.set(c, r); }
      const anciens = base && base[nom] ? new Map(base[nom].map(r => [cle(def, r), r])) : null;
      const ajouts = [], retraits = anciens ? [] : [...doublons];
      const inutile = r => nom === 'EffectifsEtude' && vide(r.effectif); // une case vide n'a pas besoin de ligne
      for (const [c, r] of cibles) {
        const e = existants.get(c);
        if (!e) { if (!inutile(r)) ajouts.push(r); continue; }
        const ref = (anciens && anciens.get(c)) || e;
        const diff = {};
        for (const col of Object.keys(def.t)) {
          const change = canon(ref[col]) !== canon(r[col]) || (def.t[col] === 'N' && typeof r[col] === 'string' && r[col] !== ref[col]);
          if (change && (canon(e[col]) !== canon(r[col]) || (def.t[col] === 'N' && typeof r[col] === 'string'))) diff[col] = r[col];
        }
        if (Object.keys(diff).length) { phase2.push(['UpdateRecord', nom, e.id, diff]); resume.modifications++; }
      }
      // Avec une base, seules les lignes que l'utilisateur a réellement retirées sont supprimées.
      for (const [c, e] of existants) if (!cibles.has(c) && (!anciens || anciens.has(c))) retraits.push(e.id);
      if (retraits.length) { const a = ['BulkRemoveRecord', nom, retraits]; if (def.leaf) phase1.push(a); else phase3.set(nom, a); resume.suppressions += retraits.length; }
      if (ajouts.length) {
        const colonnes = {}; for (const col of Object.keys(def.t)) colonnes[col] = ajouts.map(r => r[col]);
        phase2.push(['BulkAddRecord', nom, ajouts.map(() => null), colonnes]); resume.ajouts += ajouts.length;
      }
    }
    // Les lignes dont d'autres dépendent (AED, postes, semaines…) ne sont retirées qu'une fois leurs
    // dépendances parties et les références mises à jour ; une table par enregistrement, dans cet ordre.
    const ordre = ['DossiersRH', 'SemainesDerogatoires', 'SemainesTypes', 'Postes', 'AED', 'SousPostes', 'Parametres'];
    const phases3 = [...phase3.keys()].sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b)).map(n => [phase3.get(n)]);
    return {phases: [phase1, phase2, ...phases3].filter(p => p.length), resume};
  }

  // ---------- Espace AED ----------
  function donneesPourAed(e) {
    if (!e) return null;
    return {
      titre: e.titre, aeds: (e.aeds || []).map(a => ({id: a.id, nom: a.nom})), postes: e.postes,
      semaines: (e.semaines || []).map(s => ({id: s.id, nom: s.nom, planning: s.planning || {}})), semaineActive: e.semaineActive,
      derogations: e.derogations || {}, repartitions: e.repartitions || {}, posteEtude: e.posteEtude, posteMidi: e.posteMidi,
      sousPostesEtude: e.sousPostesEtude || [], sousPostesMidi: e.sousPostesMidi || [],
      reglages: {debutAnnee: e.reglages && e.reglages.debutAnnee, finAnnee: e.reglages && e.reglages.finAnnee, vacances: (e.reglages && e.reglages.vacances) || [], alternance: (e.reglages && e.reglages.alternance) || {}, midiDebut: e.reglages && e.reglages.midiDebut, midiFin: e.reglages && e.reglages.midiFin},
      absences: (e.absencesAn || []).map(a => ({aedId: a.aedId, du: a.du, au: a.au}))
    };
  }

  // ---------- Écriture d'une affectation (espace AED) ----------
  function actionRepartition(actuel, {date, bande, aedId, sousPoste}) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('date invalide');
    if (!['midi', 'etude'].includes(bande)) throw new Error('bande invalide');
    if (!(actuel.AED || []).some(r => r.source_id === aedId)) throw new Error('AED inconnu');
    if (sousPoste && !(actuel.SousPostes || []).some(r => r.bande === bande && r.libelle === sousPoste)) throw new Error('sous-poste inconnu');
    const secondes = isoVersSecondes(date);
    const ex = (actuel.Repartitions || []).find(r => r.date === secondes && r.bande === bande && r.aed_source_id === aedId);
    if (!sousPoste) return ex ? [['RemoveRecord', 'Repartitions', ex.id]] : [];
    return ex ? (ex.sous_poste === sousPoste ? [] : [['UpdateRecord', 'Repartitions', ex.id, {sous_poste: sousPoste}]]) : [['AddRecord', 'Repartitions', null, {date: secondes, bande, aed_source_id: aedId, sous_poste: sousPoste}]];
  }

  return {TABLES, tablesVersEtat, etatVersTables, calculerActions, purger, donneesPourAed, actionRepartition, versGrist, depuisGrist};
});
