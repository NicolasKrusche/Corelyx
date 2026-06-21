# Corelyx — Datenschutz & EU AI Act (Investor-Briefing)

**Stand:** 2026-06-14 · **Zweck:** Legal-Track-Vorbereitung. Jede Aussage ist auf ein Repo-Artefakt rückführbar (DPIA_CORELYX, AI_SYSTEM_INVENTORY, SUBPROCESSORS, ROPA, SECURITY, legal.ts).

> **Grundregel der Sprache:** Wir sagen **„Compliance-Infrastruktur"** / **„ausgelegt auf"** — nie „GDPR-konform" / „AI-Act-konform" als Absolutum. Finale Konformität hängt vom Use-Case, der Konfiguration, den Providern und der Rolle des Kunden ab. Genau so ist es auch in euren öffentlichen Dokumenten formuliert — bleibt konsistent.

---

## TEIL A — DATENSCHUTZ (DSGVO / GDPR)

### A.1 Rollen & Rechtsgrundlagen
- **Corelyx ist Auftragsverarbeiter** für Kundeninhalte (der Kunde ist Verantwortlicher und wählt die Integrationen) — **und Verantwortlicher** für eigene Konto-/Abrechnungsdaten. Beide Rollen sind in getrennten ROPAs dokumentiert (`ROPA_CONTROLLER.md`, `ROPA_PROCESSOR.md`).
- **Rechtsgrundlagen:** Art. 6(1)(b) (Erbringung der bestellten Automatisierung), 6(1)(f) (Sicherheit/Zuverlässigkeit), 6(1)(c) (Abrechnung/Steuer).
- **Art.-9-Daten (besondere Kategorien):** Corelyx verarbeitet sie **nicht absichtlich**, sie können aber **inzidentell** in E-Mail-/Dokumenteninhalten auftauchen. Die **Art.-9(2)-Bedingung trägt der Kunde**. Wir bieten Kontrollen, um das zu vermeiden (s. u.).

### A.2 Datenkategorien (was tatsächlich verarbeitet wird)
| Kategorie | Inhalt | Speicherung / Schutz |
|---|---|---|
| Konto-/Identität | E-Mail, Passwort-Hash bzw. Google-Sign-In-Profil | Supabase EU, RLS-getrennt |
| Workflow-Definitionen & Prompts | Vom Nutzer gebaute Graphen/Schemata | Supabase EU |
| Connection-Metadaten | Provider, Scopes — **keine** Tokens | Supabase EU |
| OAuth-Tokens & API-Keys | verschlüsselt, opaque referenziert | **Supabase Vault**, nie ans Frontend |
| Run-/Betriebs-Metadaten | Node-Status, Outputs, Approvals, Fehler | Audit-Trail |
| **Workflow-Inhalte (transient)** | E-Mail-Bodies, Dokumente, Formular-Antworten — ggf. inzidentell Art. 9 | nur während des Laufs; default **metadata-only** geloggt |

### A.3 Datenfluss (Art. 35(7)(a))
1. **Trigger:** Webhook (z. B. Gmail Pub/Sub → `/api/webhooks/gmail`, OIDC-verifiziert) / Zeitplan / manuell.
2. **Web-App (Vercel, EU):** matcht aktive Trigger, dispatcht an die Runtime.
3. **Runtime (Railway, EU):** führt Nodes aus; Connector-Nodes rufen die verbundenen Dienste des Kunden; **Agent-Nodes senden Prompt-Inhalt an einen LLM-Provider**.
4. **Vor** Verlassen der EU-Infrastruktur: **strukturierte Pseudonymisierung** (`engine/pii.py`) — E-Mail, Telefon, IBAN, IP, nationale IDs, Kreditkarten → stabile Platzhalter (`[EMAIL_1]`). Mapping bleibt **nur im Prozess-Speicher** des Laufs, wird nie persistiert/übertragen. Secrets werden **destruktiv** geschwärzt und nie zurückersetzt.
5. **Ergebnis zurück;** Ausführungslogs **metadata-only by default** (`db.py`), Inhalt nicht aufbewahrt.

### A.4 Technische & organisatorische Maßnahmen (Art. 32)
- TLS 1.3 in transit, AES-256 at rest
- Postgres **RLS** auf allen Kundendaten (Mandantentrennung)
- Secrets nur serverseitig (Vault), nie an Frontend
- **E-Mail-2FA auf API-Routen**; gefälschte Auth-Header werden blockiert (jüngste Commits)
- OIDC-verifizierte Webhooks, signierte interne Calls
- Zentrales Audit-Logging, koordinierte Schwachstellen-Offenlegung mit Patch-SLAs (24h–90d)

### A.5 Aufbewahrung (Storage Limitation)
- Betriebslogs **90 Tage** · Ausführungs-Payloads **30 Tage** · Runs **90 Tage**
- Inzidentelle IPs in Diagnoselogs **≤ 7 Tage** anonymisiert (automatisierter Job)
- Secrets bei Disconnect/Account-Löschung gepurged; Abrechnung nach gesetzlichen Fristen

### A.6 Betroffenenrechte & Transparenz
- Self-Service: Löschung (Account/Programme/Connections), Export
- Art. 18 `processing_restricted`-Flag; DSAR/DSR-Routen
- Veröffentlicht: Privacy Policy, **DPA ohne Sales-Call**, `/subprocessors` & `/data-residency` (aus Code gerendert), DPIA-Template für Kunden
- Subprozessor-Vorankündigung: **30 Tage**

### A.7 Subprozessoren (EU-Status)
**Immer EU & unkritisch:** Supabase (Frankfurt), Vercel (FRA/DUB), Railway (AMS).
**Bedingt/US:** Resend (nur Transaktionsmails, keine Workflow-Inhalte), Stripe (kein Karten-Storage), Inngest (nur Event-Metadaten), Google (Sign-In + optionale Connectors).
**KI-Provider:** Default-Platform-Key über **OpenRouter (US)**; optional BYOK (Anthropic/OpenAI/Google/Mistral).

---

## TEIL B — EU AI ACT

### B.1 Unsere Einordnung: **Deployer, nicht Provider**
- Corelyx **trainiert/finetuned kein Modell** → wir bleiben in AI-Act-Terminologie **Deployer** eines General-Purpose-AI-Modells, **nicht Provider**.
- **Keine automatisierte Entscheidung mit Rechtswirkung:** KI-Output löst nur das aus, was der Kunde im Workflow definiert hat — und ein Mensch kann jede folgenreiche Aktion gaten.

### B.2 Die zwei dokumentierten KI-Systeme (`AI_SYSTEM_INVENTORY.md`)
**System 1 — Genesis (Workflow-Graph-Generator)**
- **Risiko:** *Minimal*. Allzweck-Werkzeug, keine Entscheidung mit rechtlicher/ähnlich erheblicher Wirkung.
- **Daten ans Modell:** sanitisierte Workflow-Beschreibung + Connection-Namen/Scopes (keine Tokens).
- **Art. 14 (menschliche Aufsicht):** KI-Programme werden `is_active=false` erzeugt, nicht-wegklickbares Review-Banner, „AI-generated"-Badge; Aktivierung nur per expliziter Nutzeraktion; **kein API-Pfad**, der ein aktives KI-Programm in einem Call erzeugt.
- **Art. 50 (Transparenz):** `metadata.genesis_model` im Schema, Modell wird in der UI angezeigt.

**System 2 — Agent-Node-Executor (Runtime)**
- **Risiko:** *abhängig vom Kunden-Workflow.* Bei Annex-III-Domänen (Beschäftigung, Kredit, Gesundheit, Bildung, kritische Infrastruktur, Strafverfolgung, Migration, Justiz) ist **der Kunde** der Deployer des Hochrisiko-Systems.
- **Art. 14:** `requires_approval`-Flag pausiert den Lauf, erzeugt eine Approval-Task; die Runtime prüft den Approval-Status in der DB, **nicht per API umgehbar**; protokolliert Identität, Entscheidung, Zeitstempel, Input-Snapshot.
- **Injection-Schutz:** `_injection_guard`-System-Header neutralisiert Prompt-Injection aus Connector-Daten.

### B.3 Verbotene Praktiken (Art. 5)
In den ToS verboten: Social Scoring, Echtzeit-Biometrie-Identifikation im öffentlichen Raum, Emotionserkennung am Arbeitsplatz, Predictive Policing, unterschwellige Manipulation. Annex-III-Nutzung **ohne aktives Approval-Gate** ist in den ToS untersagt.

### B.4 AI Literacy (Art. 4) & GPAI-Pflichten
- UI zeigt das verwendete Modell, Review-Banner, und Doku stellt klar: „KI-Output kann falsch/unvollständig sein."
- Genesis nutzt einen **regulatorischen Pre-Filter** (GDPR/AI-Act/NIS2), bevor generiert wird → Output ist von Anfang an compliance-bewusst.

### B.5 Risikoregister (aus der DPIA, gekürzt)
| Risiko | Maßnahmen | Restrisiko |
|---|---|---|
| Art.-9-Daten an US-LLM ohne DPA (Platform-Key/OpenRouter) | Redaktion, metadata-only, Warnung, **EU-only-Modus**, BYOK | **Mittel** → niedrig sobald OpenRouter-DPA / EU-Default |
| Dritte (E-Mail-Absender) ohne Einwilligung | Auftragsverarbeiter auf Weisung; Redaktion; Inhalt nicht aufbewahrt | Mittel |
| Internationaler Transfer ohne Garantie | EU-Infra; per-Provider DPA/SCC im Register; eu_only-Enforcement | Mittel (OpenRouter) → niedrig mit DPA |
| Modell trainiert auf Prompts | Provider-DPAs (no-train); Register-Feld `trains_on_customer_data` | Mittel (OpenRouter „unknown") |

---

## TEIL C — DIE EHRLICHEN LÜCKEN (hier wird geprüft)

> Diese vier kommen vom Legal-Investor. Antwort = **Fakt + Einordnung + Plan**. Wir legen sie selbst offen, weil sie in unseren eigenen öffentlichen Docs stehen.

### 🔴 C.1 Default-KI-Pfad: OpenRouter (US), **keine gegengezeichnete DPA/SCC**
**Fakt:** Steht so in DPIA und `/subprocessors` als Haupt-Restrisiko des Transfers.
**Antwort:** „Wir legen es selbst offen statt es zu verstecken. Drei Dinge begrenzen es heute: Pseudonymisierung **vor** Verlassen der EU-Runtime, **metadata-only**-Logging (kein Inhalt gespeichert), und **EU-only-Workspace-Modus**, der den Pfad zur Laufzeit blockiert. Wer eine signierte DPA braucht, nutzt **BYOK** mit EU-fähigem Key. Fix in Arbeit: Enterprise-DPA + bestätigtes EU-Routing mit OpenRouter — **oder** Platform-Default auf ein EU-gehostetes Modell mit DPA. Bis dahin behaupten wir **nicht**, der Platform-Key sei EU-resident, und raten ab, Art.-9-Daten darüber zu routen." **→ Das ist DIE Frage. Kalt beherrschen.**

### 🔴 C.2 Rechtsstruktur noch leicht (Einzelunternehmer-artig, DPO „TBA")
**Fakt:** Entity-Felder env-gesteuert in `legal.ts`; österreichisches Recht, österreichische DSB; DPO noch nicht benannt.
**Antwort:** „Wir haben produkt-first gebaut, um den Wedge zu validieren. Inkorporation (vmtl. AT-GmbH) und Benennung/Beauftragung eines DPO sind near-term und Teil der Mittelverwendung. Die Compliance-**Dokumentation** ist der Struktur bereits voraus — bei einem compliance-getriebenen Produkt die bewusste Reihenfolge."

### 🟠 C.3 PII-Redaktion ist heuristisch (Regex/NER)
**Fakt:** Strukturierte Identifier zuverlässig; Namen nur über On-Server-**NER** (Backend muss im Prod-Image installiert sein — offener Punkt); Freitext bleibt.
**Antwort:** „Wir nennen es nie eine Garantie, sondern Defense-in-Depth. Strukturierte IDs werden zuverlässig gefangen; Namen über serverseitige NER im Strict-Tier; das echte Sicherheitsnetz ist, dass **der Nutzer steuert, was er routet** + Approval-Gates + EU-only. Grenzen stehen explizit in DPIA und Privacy Policy."

### 🟠 C.4 „Minimal-Risk" — selbstdienlich?
**Fakt:** Wir stufen Genesis selbst als minimal-risk ein und schieben Hochrisiko-Pflichten auf den Kunden-als-Deployer.
**Antwort:** „Es ist die rechtlich korrekte Aufteilung, schriftlich begründet. Wir sind Deployer von GPAI, treffen keine Entscheidung mit Rechtswirkung — der Nutzer baut den Workflow, ein Mensch kann jede folgenreiche Aktion gaten. Baut ein Kunde etwas in einer Annex-III-Domäne, wird **er** zum Hochrisiko-Deployer — und unsere ToS verlangen dort ein Approval-Gate."

### 🟡 C.5 Google Restricted Scopes
**Fakt:** CASA-Verifizierung für Gmail-Restricted-Scopes **noch offen** → faktisch ~100-Nutzer-Cap.
**Antwort:** „Unter dem Unverified-App-Cap reicht es für Pilot. CASA ist ein geplantes Gate vor dem Skalieren — Prozess-/Kostenpunkt, kein technischer Blocker."

---

## TEIL D — OFFENE TODOs MIT DSGVO-/AI-ACT-BEZUG (aus TODO.md & DPIA §5)
1. **OpenRouter Enterprise-DPA + EU-Routing** signieren → danach `provider-registry.ts` und `legal.ts` aktualisieren, Privacy-Seite §8 anpassen. Caveat: EU-Routing hilft nur, wenn die genutzten Modell-Endpunkte selbst EU-gehostet sind.
2. **Neue EU-Workspaces default `eu_only`** — bereits implementiert.
3. **Google OAuth / CASA** vor Überschreiten des 100-Nutzer-Caps abschließen.
4. **`/subprocessors`, Privacy Policy, DPIA synchron halten** bei jeder Provider-Änderung.
5. **NER-Backend im Prod-Runtime-Image** installieren (Namens-Pseudonymisierung scharfschalten).
6. **DPO benennen**, `LEGAL_LAST_UPDATED` und Impressum-Felder pflegen.

---
*Quellen: DPIA_CORELYX.md (Review 2026-06-04), AI_SYSTEM_INVENTORY.md, SUBPROCESSORS.md, ROPA_CONTROLLER/PROCESSOR.md, SECURITY.md, legal.ts, TODO.md. Bei „woher wisst ihr das?" → Datei zeigen.*
