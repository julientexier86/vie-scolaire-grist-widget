# Vie scolaire AED sur Grist — Mode d'emploi de mise en service

Collège Jean Jaurès, Gençay — version du widget : **v2** — rédigé le 22 novembre 2026

## 1. Ce que vous avez

| Élément | Où | Statut |
|---|---|---|
| Document Grist de production « Vie scolaire AED - production » | grist.numerique.gouv.fr (id iCLP5NARBrc5) | Prêt : tables, règles d'accès (50), postes et semaines types initialisés. Vous êtes seul propriétaire. |
| Document de test « socle de test fictif » | id 9HYvyMrVATUp | Données fictives, pour s'entraîner sans risque. |
| Widget v2 | https://julientexier86.github.io/vie-scolaire-grist-widget/v2/cpe-pilote.html | En ligne et vérifié (empreintes identiques aux sources). |
| Code, README détaillé, licence AGPL, notices | https://forge.apps.education.fr/texierjulien/vie-scolaire-grist (privé) | Étiquettes v1.0.0 et v2.0.0. |

Une seule adresse de widget pour tout le monde : un CPE ou un personnel de direction voit l'espace complet, un AED est redirigé automatiquement vers son espace.

## 2. Mise en service en 6 étapes (environ 30 minutes)

**Étape 1 — Brancher le widget sur le document de production (5 min)**
1. Ouvrez « Vie scolaire AED - production ».
2. Sur la page du widget, ouvrez le panneau de configuration (icône ⚙ / « Widget personnalisé »).
3. Dans **URL du widget**, collez : `https://julientexier86.github.io/vie-scolaire-grist-widget/v2/cpe-pilote.html`
4. Niveau d'accès : **Accès complet au document** (obligatoire).
5. Grist affiche un avertissement de sécurité : lisez-le, puis confirmez. C'est normal : le widget lit et écrit dans le document.

**Étape 2 — Inviter les propriétaires (CPE et direction) (5 min)**
1. Bouton Partager → ajoutez chaque CPE et personnel de direction avec le rôle **Propriétaire**.
2. Seuls les propriétaires voient les données RH (dossiers, heures, congés) et la table `Comptes`.

**Étape 3 — Créer les comptes AED (5 min)**
1. Ouvrez la table **Comptes** (réservée aux propriétaires).
2. Une ligne par AED : colonne `email` = adresse professionnelle exacte de l'AED (celle de son compte Grist/ProConnect), colonne `aed_source_id` = identifiant de sa fiche dans la table AED.
3. Invitez chaque AED au document avec le rôle **Lecteur** (le widget gère ce qu'ils peuvent modifier ; les règles d'accès cachent les données RH).
4. Ne mettez rien de confidentiel dans la colonne `note` de `Comptes` : l'AED lit sa propre ligne.

**Étape 4 — Charger les vraies données (10 min, quand vous avez l'export)**
Suivez `docs/procedure-import.md` du dépôt Forge : export de l'ancienne application → `analyser-export` pour contrôler → import. Tant que vous n'avez pas d'export, saisissez directement dans le widget : l'équipe AED, les semaines et les répartitions.

**Étape 5 — Contrôle avec un vrai compte AED (5 min, indispensable)**
1. En tant que propriétaire, ouvrez le document « en tant que » l'AED (Partager → Voir en tant que, ou demandez à un AED de se connecter).
2. Vérifiez : son nom s'affiche en gras dans l'espace AED ; il ne peut modifier que sa propre répartition ; aucune donnée RH ne s'affiche.
3. Si le bandeau rouge « Votre compte n'est pas encore relié à une fiche AED » apparaît : l'e-mail ou l'`aed_source_id` de la table `Comptes` est incorrect.

**Étape 6 — Annoncer à l'équipe**
Envoyez les notices : `notice-cpe` (CPE/direction) et `notice-aed` (AED). Elles sont dans le dépôt (`docs/notices/`, versions HTML dans `site/notices/`) et dans votre dossier `outputs/vie-scolaire-grist/notices/` sur le Mac.

## 3. Au quotidien

**CPE / direction (espace complet)** : onglets planning, répartition des AED sur les postes, semaines types, heures et congés, impressions. Toute modification est enregistrée dans Grist et visible aussitôt par les collègues.

**AED (espace personnel)** : consultation du planning de la semaine, choix de sa propre répartition ; les listes des collègues sont grisées.

**Ajouter ou retirer un AED** : ajouter la fiche dans la table AED, puis une ligne dans `Comptes` et l'invitation au document. Pour un départ : retirer la ligne de `Comptes` et l'accès au document.

**Sauvegarde** : menu du document Grist → Télécharger → Grist (.grist) ou Excel, à faire chaque période de vacances. L'historique du document permet de revenir en arrière.

## 4. Dépannage

| Symptôme | Cause probable | Que faire |
|---|---|---|
| Widget blanc ou « accès refusé » | Accès complet non activé ou avertissement non confirmé | Étape 1, points 4 et 5 |
| Un AED voit l'espace CPE | Il a le rôle Propriétaire | Passez-le en Lecteur |
| Un CPE est redirigé vers l'espace AED | Il n'est pas Propriétaire | Passez-le en Propriétaire |
| Bandeau rouge « compte non relié » | Ligne `Comptes` absente ou e-mail différent | Corrigez l'e-mail et l'`aed_source_id` |
| Modifications d'un collègue écrasées | Deux personnes ont changé le même champ en même temps (le dernier gagne) | Se coordonner ; rechargez la page avant de modifier |
| Les boutons mot de passe / déconnexion n'existent plus | Comptes gérés par Grist | Normal |

## 5. Limites à connaître

- **Pas encore essayé avec de vraies données ni avec un vrai AED dans l'interface** : tout a été validé sur données fictives et, côté AED, au niveau des droits (« Voir en tant que »). D'où l'étape 5.
- **Impressions PDF et Excel** : non testées en conditions réelles ; vérifiez-les une fois avec vos données.
- **Import** non atomique : en cas d'échec, relancez-le sur un document vide.
- **Dépendance externe** : le widget charge la bibliothèque de Grist depuis docs.getgrist.com ; une panne de ce site bloque le widget.
- **Hébergement actuel** : GitHub (public, versions figées). Le projet Forge est privé : Grist ne peut pas y charger le widget. Pour basculer plus tard : rendre le projet Forge public, puis remplacer l'URL du widget par `https://texierjulien.forge.apps.education.fr/vie-scolaire-grist/v2/cpe-pilote.html`.

## 6. Démarches administratives à ne pas oublier

- Informer le **délégué à la protection des données** académique (données RH des AED : heures, congés).
- Faire valider la **licence AGPL-3.0** (logiciel créé par un agent : droits de l'État) par la DANE ou le rectorat avant de rendre le projet Forge public.

## 7. Mises à jour futures

Ne modifiez jamais un dossier de version publié. Une évolution = un nouveau dossier (`v3/`) ; pour l'adopter, changez l'URL du widget (étape 1). Pour revenir en arrière, remettez l'URL de la version précédente.
