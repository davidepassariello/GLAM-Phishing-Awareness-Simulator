import { isValidElement, useEffect, useMemo, useRef, useState } from "react";
import {
  BackendError,
  requestReply,
  sendEvents,
  type ServerEvent,
} from "./backend";

type Screen =
  | "intro"
  | "mail"
  | "results"
  | "exited"
  | "archive-page"
  | "construction";
type ActionType =
  | "inizio_sessione"
  | "apri_email"
  | "verifica_link"
  | "click_link"
  | "rispondi"
  | "segnala"
  | "archivia"
  | "ignora"
  | "termina"
  | "esci"
  | "credenziali_inserite"
  | "errore_tecnico"
  | "stop_attivato";

type EventLog = {
  id: string;
  tipo_azione: ActionType;
  id_email: string | null;
  esito: "corretto" | "errato" | "neutro";
  dettaglio: string;
  timestamp: string;
  origine: "client" | "server";
};

type Mail = {
  id: string;
  sender: string;
  address: string;
  initials: string;
  subject: string;
  preview: string;
  time: string;
  date: string;
  color: string;
  recipient?: string;
  destination?: string;
  displayLink?: string;
  body: (renderLink: () => React.ReactNode) => React.ReactNode;
  explanation: string;
};

type ScoreRow = {
  emailId: string;
  actions: string;
  rule: string;
  points: number;
};

type ScoreResult = {
  total: number;
  rows: ScoreRow[];
};

type ConversationTurn = {
  id: string;
  userText: string;
  assistantText: string | null;
  responseNumber: number;
  fallback: boolean;
  stop: boolean;
};

type MailFolder = "inbox" | "junk" | "archive";
type ViewFolder = MailFolder | "sent";

type SentMessage = {
  id: string;
  mail: Mail;
  text: string;
  timestamp: string;
};

export const AVVISO_INIZIALE =
"Questa è una simulazione a scopo di ricerca. Le azioni e i testi delle risposte saranno registrati con un codice di sessione casuale, senza richiedere nome o indirizzo email. Non inserire dati personali né password reali: se necessario, inventali. Ciò che scrivi ai mittenti sarà inviato a un servizio esterno di intelligenza artificiale per generare le risposte. L'ambiente è indipendente e non è affiliato né approvato da Microsoft; i relativi marchi appartengono ai rispettivi titolari. Quando hai concluso, seleziona «Termina e vedi risultati». Se desideri interrompere, seleziona «Esci dalla simulazione»."

const DEBRIEF_TESTI = {
  eyebrow: "SIMULAZIONE COMPLETATA",
  title: "Il tuo percorso: risultati e consigli",
  score: (points: number) => `Punteggio: ${points} su 100`,
  sections: {
    happened: "Cosa è successo",
    next: "Cosa potrebbe succedere dopo",
    actions: "Cosa fare e cosa evitare",
    takeaway: "Promemoria di sicurezza",
  },
  email: {
    label: (index: number) => `Email ${index}`,
    opened: "Hai aperto il messaggio.",
    notOpened: "Non hai aperto il messaggio.",
    verified: "Hai verificato l’indirizzo del collegamento.",
    notVerified: "Non risulta una verifica dell’indirizzo del collegamento.",
    clicked: "Hai aperto il collegamento.",
    notClicked: "Non hai aperto il collegamento.",
    replied: "Hai inviato almeno una risposta.",
    notReplied: "Non hai inviato risposte.",
    decisions: {
      segnala: "Hai segnalato il messaggio come sospetto.",
      archivia: "Hai archiviato il messaggio.",
      ignora:
        "Hai scelto di ignorare questa comunicazione. La decisione è stata registrata, ma non ha contribuito al punteggio.",
      none: "Non risulta una decisione finale tra segnalazione, archiviazione e ignorare.",
    },
    points: (points: number) =>
      `Per questa email sono stati assegnati ${points} ${points === 1 ? "punto" : "punti"}.`,
  },
  revealTitle: "Il tentativo di inganno via posta era la terza email",
  phenomenonBody:
    "Era un tentativo di phishing: un messaggio che finge di arrivare da una persona o da un servizio affidabile per spingerti a cliccare un link o a inserire credenziali.",
  revealBody:
    "Gli indizi utili erano il refuso «Montesnato» nell’oggetto, il collegamento abbreviato, la richiesta di aprire un documento non atteso e il dominio alterato nella barra degli indirizzi del portale («rnicrosoft»).",
  legitimateBody:
    "Le altre quattro email erano legittime. Segnalare per prudenza un messaggio legittimo è un errore comune e comprensibile: l’obiettivo è affinare gradualmente il controllo degli indizi.",
  paths: {
    notOpened:
      "Non hai esaminato il messaggio sospetto. Non è quindi possibile valutare come avresti reagito agli indizi presenti nella comunicazione.",
    openedNoClick:
      "Hai esaminato il messaggio senza aprire il collegamento.",
    reportedNoClick:
      " Hai inoltre segnalato il messaggio come sospetto: questa è stata una decisione prudente e distinta dalla semplice mancata apertura del collegamento.",
    clickNoCredentials:
      "Hai raggiunto il portale contraffatto, ma non hai completato l’accesso. Nel prototipo non sono state registrate credenziali inserite e non è avvenuta alcuna compromissione.",
    credentials:
      "Hai completato l’accesso nel portale simulato. Nell’esercitazione non è avvenuta alcuna autenticazione reale: l’indirizzo è rimasto locale e la password non è stata letta né trasmessa. In un attacco reale, inserire credenziali in un portale contraffatto potrebbe esporre l’account e le informazioni dell’istituzione.",
  },
  simulation: {
    label: "In questa simulazione",
    body: "L’istituzione, i personaggi, le email e il portale sono inventati. La risposta di Marta è generata da un’intelligenza artificiale.",
  },
  hypothetical: {
    label: "In un attacco di questo tipo potrebbe succedere che",
    items: [
      "In alcuni casi l’account potrebbe essere usato per scrivere ai colleghi fingendo di essere la persona coinvolta.",
      "Un filtro potrebbe nascondere alcune risposte o spostarle automaticamente.",
      "La rubrica potrebbe essere cancellata o usata per individuare nuovi destinatari.",
      "Potrebbe provare le stesse credenziali su altri servizi, perché molte persone usano la stessa password in più posti.",
    ],
    reassurance:
      "Un attacco ben costruito può ingannare anche personale attento: non è una questione di intelligenza o di disattenzione.",
  },
  attackerView: {
    label: "Vista dell’attaccante",
    email: "nome.cognome@esempio.it",
    password: "••••••••••",
    note: "Rappresentazione didattica. L'indirizzo è mostrato solo sul tuo schermo e non è stato trasmesso né salvato; la password non è stata letta. In un attacco reale l'attaccante avrebbe ottenuto entrambi.",
  },
  actions: [
    "Non cliccare collegamenti inattesi e non inserire dati in pagine aperte da messaggi dubbi.",
    "Verificare il messaggio con la collega attraverso un altro canale, per esempio con una telefonata o di persona.",
    "Segnalare il messaggio sospetto al servizio informatico.",
    "Non cancellare il messaggio prima di averlo segnalato.",
    "Se hai già inserito le credenziali, cambiare subito la password e avvisare il servizio informatico.",
    "Controlla il dominio, non soltanto HTTPS: anche un sito fraudolento può utilizzare una connessione cifrata. Prima di inserire credenziali, verifica che l’indirizzo appartenga effettivamente al servizio dichiarato.",
  ],
  memoryRulesTitle: "Tre regole facili da ricordare",
  memoryRules: [
    "Fermati davanti a urgenza, documenti inattesi o richieste di accesso.",
    "Verifica con un canale diverso da quello usato nel messaggio.",
    "Segnala prima di cancellare, così chi gestisce la sicurezza può controllare.",
  ],
  takeaway: {
    title: "PHISHING: QUATTRO AZIONI DA RICORDARE",
    subtitle:
      "Un promemoria per riconoscere le richieste sospette e proteggere le informazioni della propria istituzione.",
    actions: [
      {
        number: "01",
        title: "FERMATI",
        body: "Diffida delle richieste inattese o urgenti. Prima di cliccare su un collegamento o inserire credenziali, esamina attentamente il messaggio.",
      },
      {
        number: "02",
        title: "VERIFICA",
        body: "Controlla il mittente e il dominio del collegamento. Se hai dubbi, verifica la richiesta attraverso un canale indipendente, come una telefonata o un contatto diretto.",
      },
      {
        number: "03",
        title: "SEGNALA",
        body: "Comunica i messaggi sospetti al servizio informatico o al referente per la sicurezza della tua istituzione, prima di eliminarli.",
      },
      {
        number: "04",
        title: "REAGISCI",
        body: "Se hai inserito credenziali in una pagina sospetta, cambia immediatamente la password tramite il sito ufficiale e contatta il servizio informatico.",
      },
    ],
    reminder:
      "Nel dubbio, fermati e verifica: pochi secondi di attenzione possono prevenire conseguenze importanti.",
    print: "Stampa o salva come PDF",
  },
  replay: "Rigioca",
} as const;

const mails: Mail[] = [
  {
    id: "email_1",
    sender: "Elena Ferri - Biblioteca Comunale di Valdora",
    address: "prestito.interbibliotecario@bibliotecavaldora.example",
    initials: "EF",
    subject: "Richiesta prestito interbibliotecario – verifica disponibilità",
    preview: "Gentili colleghi, vi scriviamo per verificare la disponibilità...",
    time: "09:42",
    date: "lun 12/01/2026 09:42",
    color: "#c7e0f4",
    explanation:
      "La richiesta di prestito proviene da un indirizzo coerente con la biblioteca indicata ed è compatibile con l’attività dell’archivio.",
    body: () => (
      <>
        <p>Gentili colleghi,</p>
        <p>
          vi scriviamo per verificare la disponibilità in prestito del volume
          «Statuti e ordinamenti del comune di Montesanto (secc. XIV-XV)»,
          richiesto da un nostro utente di ricerca.
        </p>
        <p>
          Potreste confermarci se il volume è disponibile e indicarci eventuali tempi
          e modalità di spedizione? Qualora non fosse possibile concederlo in prestito, 
          vi saremmo grati se poteste segnalarci eventuali alternative per la consultazione.
        </p>
        <p>
          Restiamo in attesa di un vostro riscontro, anche preliminare.
          </p>
        <p>
          Cordialmente,
          <br />
          Elena Ferri
          <br />
          Servizio prestito interbibliotecario
        </p>
      </>
    ),
  },
  {
    id: "email_2",
    sender: "Segreteria di Direzione",
    address: "segreteria@archiviomontesanto.example",
    initials: "SD",
    subject: "Riunione di staff giovedì ore 10:30",
    preview: "Care colleghe e cari colleghi, la riunione di staff di giovedì...",
    time: "09:30",
    date: "lun 12/01/2026 09:30",
    color: "#f6d6c9",
    displayLink: "Ordine del giorno e materiali",
    destination: "https://intranet.archiviomontesanto.example/riunioni/staff",
    explanation:
      "Il collegamento usa il dominio interno dell’istituzione ed è coerente con la comunicazione della Segreteria.",
    body: (renderLink) => (
      <>
        <p>Care colleghe e cari colleghi,</p>
        <p>
          la riunione di giovedì è confermata alle 10:30 in sala
          conferenze (non più alle 9:30). In caso di impossibilità 
          a partecipare, vi invitiamo a comunicarcelo, così da organizzare 
          la sala e predisporre i materiali.
        </p>
        <p>
          Trovate tutto il necessario, come al solito, sul portale:
        </p>
        {renderLink()}
        <p>
          Cordiali saluti,
          <br />
          La Direzione
        </p>
      </>
    ),
  },
  {
    id: "email_3",
    sender: "Marta Rinaldi",
    address: "marta.rinaldi@archiviomontesanto.example",
    initials: "MR",
    subject: "Relazione attività 2026 – Archivio Storico Civico di Montesnato",
    preview: "Ciao a tutti, vi condivido la relazione sulle attività di quest’anno...",
    time: "09:12",
    date: "lun 12/01/2026 09:12",
    color: "#d9d2ec",
    recipient: "Personale",
    displayLink: "Relazione attività 2026.pdf",
    destination: "https://brevi.example/x7Kd2",
    explanation:
      "Il collegamento abbreviato porta fuori dal dominio istituzionale, nonostante il mittente visualizzato sembri interno.",
    body: (renderLink) => (
      <>
        <p>Ciao a tutti,</p>
        <p>
          vi condivido la relazione sulle attività di quest’anno, può servire
          per la riunione di giovedì.
        </p>
        <p>
          È protetta: per aprirla serve accedere con l’account dell’istituzione.
          Fatemi sapere in giornata se riuscite ad aprirla, mi servono i vostri
          commenti.
        </p>
        <p>
          Grazie!
          <br />
          Marta
        </p>
        {renderLink()}
      </>
    ),
  },
  {
    id: "email_4",
    sender: "Luca Bianchi – DigitArchivi S.r.l.",
    address: "l.bianchi@digitarchivi.example",
    initials: "LB",
    subject: "Commessa DA-2026/14: stato di avanzamento",
    preview: "Buongiorno, vi aggiorniamo sulla commessa: sono state digitalizzate...",
    time: "08:55",
    date: "lun 12/01/2026 08:55",
    color: "#d7e8cb",
    explanation:
      "L’aggiornamento del fornitore contiene riferimenti di commessa coerenti e non richiede credenziali o azioni urgenti.",
    body: () => (
      <>

        <p>Buongiorno,</p>
        <p>
          vi aggiorniamo sulla commessa DA-2026/14: sono state
          digitalizzate 38 delle 60 unità archivistiche previste
          (bb. 1-38); le restanti saranno completate entro fine mese.
        </p>
        <p>
          Vorremmo sapere se preferite effettuare una verifica
          intermedia dei materiali già digitalizzati oppure attendere
          il completamento della commessa.
        </p>
        <p>
          Vi chiediamo un breve riscontro sulla soluzione che ritenete
          più opportuna, così da organizzarci per tempo.
        </p>
        <p>
          Resto a disposizione per eventuali chiarimenti.
        </p>
        <p>
          Cordiali saluti,
          <br />
          Luca Bianchi
          <br />
          DigitArchivi S.r.l.
        </p>
      </>
    ),
  },

  {
    id: "email_5",
    sender: "Servizio Informatico",
    address: "servizioinformatico@archiviomontesanto.example",
    initials: "SI",
    subject: "Manutenzione programmata della rete – venerdì dalle 18:00",
    preview: "Colleghe e colleghi, venerdì dalle 18:00 alle 20:00 la rete interna...",
    time: "08:40",
    date: "lun 12/01/2026 08:40",
    color: "#f4dfb8",
    explanation:
      "La comunicazione usa il dominio istituzionale e specifica chiaramente che non è richiesta alcuna azione.",
    body: () => (
      <>
        <p>Colleghe e colleghi,</p>
        <p>
          venerdì dalle 18:00 alle 20:00 la rete interna sarà interessata da una
          manutenzione programmata: possibili brevi interruzioni di connessione
          e della posta.
        </p>
        <p>Non è richiesta alcuna azione.</p>
        <p>
          Per segnalazioni urgenti, interno 214.
          <br />
          Servizio Informatico
        </p>
      </>
    ),
  },
];

function extractText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join(" ");
  }
  if (isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractText(node.props.children);
  }
  return "";
}

const mailSearchIndex = new Map(
  mails.map((mail) => [
    mail.id,
    `${mail.sender} ${mail.subject} ${extractText(
      mail.body(() => mail.displayLink ?? null),
    )}`.toLocaleLowerCase("it"),
  ]),
);

const firstDecisionActions: ActionType[] = [
  "segnala",
  "archivia",
  "ignora",
];

function calculateScore(events: EventLog[]): ScoreResult {
  const rows = mails.map((mail): ScoreRow => {
    const emailEvents = events.filter((event) => event.id_email === mail.id);
    const firstDecisionIndex = emailEvents.findIndex((event) =>
      firstDecisionActions.includes(event.tipo_azione),
    );
    const firstDecision =
      firstDecisionIndex >= 0 ? emailEvents[firstDecisionIndex] : undefined;
    const firstVerifyIndex = emailEvents.findIndex(
      (event) => event.tipo_azione === "verifica_link",
    );
    const firstClickIndex = emailEvents.findIndex(
      (event) => event.tipo_azione === "click_link",
    );
    const linkVerifiedBeforeClick =
      firstVerifyIndex >= 0 &&
      (firstClickIndex < 0 || firstVerifyIndex < firstClickIndex);
    let points = 0;
    const appliedRules: string[] = [];

    if (mail.id === "email_3") {
      if (firstDecision?.tipo_azione === "segnala") {
        const clickedBeforeReport =
          firstClickIndex >= 0 && firstClickIndex < firstDecisionIndex;
        points += clickedBeforeReport ? 25 : 50;
        appliedRules.push(
          clickedBeforeReport
            ? "Prima decisione: segnala, dopo l’apertura del link (+25)"
            : "Prima decisione: segnala, senza precedente apertura del link (+50)",
        );
      } else if (firstDecision) {
        appliedRules.push(
          `Prima decisione: ${firstDecision.tipo_azione}; il messaggio fraudolento non è stato segnalato (+0)`,
        );
      } else {
        appliedRules.push("Nessuna prima decisione registrata (+0)");
      }

      if (linkVerifiedBeforeClick) {
        points += 15;
        appliedRules.push("Indirizzo verificato prima dell’apertura del link (+15)");
      } else {
        appliedRules.push("Indirizzo non verificato prima dell’apertura del link (+0)");
      }
    } else {
      const wasOpened = emailEvents.some(
        (event) => event.tipo_azione === "apri_email",
      );
      if (
        wasOpened &&
        firstDecision?.tipo_azione === "archivia"
      ) {
        points += 5;
        appliedRules.push(
          "Email aperta; prima decisione: archivia (+5)",
        );
      } else if (firstDecision?.tipo_azione === "ignora") {
        appliedRules.push("Prima decisione: ignora (+0)");
      } else if (firstDecision?.tipo_azione === "segnala") {
        appliedRules.push("Prima decisione: segnala; falso positivo (+0)");
      } else if (!firstDecision) {
        appliedRules.push("Nessuna prima decisione registrata (+0)");
      } else {
        appliedRules.push(
          `Prima decisione: ${firstDecision.tipo_azione}, ma email non aperta (+0)`,
        );
      }

      if (mail.id === "email_2") {
        if (linkVerifiedBeforeClick) {
          points += 15;
          appliedRules.push(
            "Indirizzo verificato prima dell’apertura del link (+15)",
          );
        } else {
          appliedRules.push(
            "Indirizzo non verificato prima dell’apertura del link (+0)",
          );
        }
      }
    }

    const actionLabels = emailEvents.map((event) =>
      actionLabel(event.tipo_azione),
    );
    const compactActions = actionLabels.filter(
      (label, index) => index === 0 || label !== actionLabels[index - 1],
    );

    return {
      emailId: mail.id,
      actions:
        compactActions.length > 0
          ? compactActions.join(" → ")
          : "Nessuna azione registrata",
      rule: appliedRules.join("; "),
      points,
    };
  });

  return {
    total: rows.reduce((total, row) => total + row.points, 0),
    rows,
  };
}

function describeEmailDebrief(
  mail: Mail,
  events: EventLog[],
  points: number,
): string {
  const emailEvents = events.filter((event) => event.id_email === mail.id);
  return mail.id === "email_3"
    ? describeFraudulentEmailDebrief(emailEvents, points)
    : describeLegitimateEmailDebrief(mail, emailEvents, points);
}

function describeFraudulentEmailDebrief(
  emailEvents: EventLog[],
  points: number,
): string {
  const copy = DEBRIEF_TESTI.email;
  const actionIndexes = (action: ActionType) =>
    emailEvents.reduce<number[]>((indexes, event, index) => {
      if (event.tipo_azione === action) indexes.push(index);
      return indexes;
    }, []);
  const opened = actionIndexes("apri_email").length > 0;
  const verifyIndexes = actionIndexes("verifica_link");
  const clickIndexes = actionIndexes("click_link");
  const credentialIndexes = actionIndexes("credenziali_inserite");
  const reportIndexes = actionIndexes("segnala");
  const replyCount = actionIndexes("rispondi").length;
  const firstVerifyIndex = verifyIndexes[0] ?? -1;
  const firstClickIndex = clickIndexes[0] ?? -1;
  const firstCredentialIndex = credentialIndexes[0] ?? -1;
  const firstReportIndex = reportIndexes[0] ?? -1;
  const decisionEvents = emailEvents.filter((event) =>
    firstDecisionActions.includes(event.tipo_azione),
  );
  const firstDecision = decisionEvents[0]?.tipo_azione;
  const sentences: string[] = [];

  sentences.push(
    opened
      ? "Hai aperto ed esaminato il messaggio fraudolento."
      : "Non hai esaminato il messaggio fraudolento; dalla sola assenza di apertura non è possibile desumere se avessi riconosciuto la frode.",
  );

  if (firstVerifyIndex >= 0) {
    if (firstClickIndex < 0) {
      sentences.push(
        "Hai verificato l’indirizzo senza aprire il collegamento: è un controllo utile, ma da solo non dimostra il riconoscimento della frode.",
      );
    } else if (firstVerifyIndex < firstClickIndex) {
      sentences.push(
        "Hai verificato l’indirizzo prima del clic; questa verifica ha contribuito al punteggio, anche se in seguito hai aperto il collegamento.",
      );
    } else {
      sentences.push(
        "Hai verificato l’indirizzo soltanto dopo aver aperto il collegamento; il controllo tardivo non ha contribuito al punteggio.",
      );
    }
    if (verifyIndexes.length > 1) {
      sentences.push(
        "Le verifiche ripetute non hanno assegnato ulteriori punti.",
      );
    }
  } else if (firstClickIndex >= 0) {
    sentences.push(
      "Hai aperto il collegamento senza averne prima verificato l’indirizzo.",
    );
  }

  if (firstCredentialIndex >= 0) {
    sentences.push(
      "Hai completato il login simulato. Nel prototipo la password non è stata letta o trasmessa e non è avvenuta alcuna autenticazione reale.",
    );
  } else if (firstClickIndex >= 0) {
    sentences.push(
      "Hai raggiunto il portale contraffatto, ma non hai completato il login e non risultano credenziali simulate inserite.",
    );
  } else if (opened) {
    sentences.push("Non hai aperto il collegamento presente nel messaggio.");
  }

  if (replyCount > 0) {
    sentences.push(
      `Hai inviato ${replyCount === 1 ? "una risposta" : `${replyCount} risposte`} al mittente; lo scambio comunicativo non ha attribuito punti.`,
    );
  }

  if (!firstDecision) {
    sentences.push(
      "Non hai espresso una decisione di gestione tra segnalazione, archiviazione e ignorare.",
    );
  } else if (firstDecision === "segnala") {
    if (
      firstCredentialIndex >= 0 &&
      firstReportIndex > firstCredentialIndex
    ) {
      sentences.push(
        "Hai segnalato correttamente il messaggio fraudolento, ma soltanto dopo aver aperto il collegamento e inserito le credenziali simulate. In una situazione reale sarebbe stato più prudente interrompere il percorso prima di fornire informazioni di accesso.",
      );
    } else if (firstClickIndex >= 0 && firstReportIndex > firstClickIndex) {
      sentences.push(
        "Hai segnalato correttamente il messaggio fraudolento dopo aver aperto il collegamento: la segnalazione è stata appropriata, ma il clic precedente aveva già esposto al portale contraffatto.",
      );
    } else if (firstClickIndex >= 0 && firstReportIndex < firstClickIndex) {
      sentences.push(
        "Hai segnalato correttamente il messaggio prima di aprire il collegamento; il successivo clic è stato un comportamento rischioso distinto dalla decisione iniziale.",
      );
    } else if (
      firstVerifyIndex >= 0 &&
      firstVerifyIndex < firstReportIndex
    ) {
      sentences.push(
        "Dopo aver controllato l’indirizzo, hai segnalato correttamente il messaggio senza aprire il collegamento.",
      );
    } else {
      sentences.push(
        "Hai segnalato correttamente il messaggio fraudolento senza aprire il collegamento.",
      );
    }
  } else if (firstDecision === "archivia") {
    sentences.push(
      "La prima decisione è stata archiviare il messaggio: questa scelta non equivale al riconoscimento del phishing e non ha attribuito punti per la gestione della frode.",
    );
  } else {
    sentences.push(copy.decisions.ignora);
    sentences.push(
      "Ignorare il messaggio non equivale a riconoscere o segnalare il tentativo di phishing.",
    );
  }

  if (firstDecision !== "segnala" && firstReportIndex >= 0) {
    sentences.push(
      "Hai segnalato il messaggio in un momento successivo, ma la prima decisione di gestione è rimasta quella già registrata e la segnalazione successiva non ha aggiunto punti.",
    );
  } else if (firstDecision === "segnala" && reportIndexes.length > 1) {
    sentences.push(
      "Le segnalazioni ripetute non hanno assegnato ulteriori punti.",
    );
  }

  if (decisionEvents.length > 1) {
    sentences.push(
      "Le azioni di gestione successive non hanno sostituito la prima decisione ai fini del punteggio.",
    );
  }

  sentences.push(copy.points(points));
  return sentences.join(" ");
}

function describeLegitimateEmailDebrief(
  mail: Mail,
  emailEvents: EventLog[],
  points: number,
): string {
  const copy = DEBRIEF_TESTI.email;
  const actionIndexes = (action: ActionType) =>
    emailEvents.reduce<number[]>((indexes, event, index) => {
      if (event.tipo_azione === action) indexes.push(index);
      return indexes;
    }, []);
  const opened = actionIndexes("apri_email").length > 0;
  const verifyIndexes = actionIndexes("verifica_link");
  const clickIndexes = actionIndexes("click_link");
  const replyCount = actionIndexes("rispondi").length;
  const firstVerifyIndex = verifyIndexes[0] ?? -1;
  const firstClickIndex = clickIndexes[0] ?? -1;
  const decisionEvents = emailEvents.filter((event) =>
    firstDecisionActions.includes(event.tipo_azione),
  );
  const firstDecision = decisionEvents[0]?.tipo_azione;
  const sentences: string[] = [
    opened
      ? "Hai aperto ed esaminato questa comunicazione legittima."
      : "Non hai aperto questa comunicazione, quindi non risulta esaminata.",
  ];

  if (mail.destination) {
    if (firstVerifyIndex >= 0) {
      if (firstClickIndex < 0 || firstVerifyIndex < firstClickIndex) {
        sentences.push(
          "Hai verificato l’indirizzo prima di un eventuale clic; la prima verifica valida ha contribuito al punteggio.",
        );
      } else {
        sentences.push(
          "Hai verificato l’indirizzo dopo aver già aperto il collegamento; questa verifica tardiva non ha contribuito al punteggio.",
        );
      }
      if (verifyIndexes.length > 1) {
        sentences.push(
          "Le verifiche ripetute non hanno assegnato ulteriori punti.",
        );
      }
    }
    if (firstClickIndex >= 0) {
      sentences.push(
        "Hai aperto il collegamento legittimo contenuto nella comunicazione.",
      );
    } else {
      sentences.push("Non hai aperto il collegamento.");
    }
  }

  if (replyCount > 0) {
    sentences.push(
      `Hai inviato ${replyCount === 1 ? "una risposta" : `${replyCount} risposte`} al mittente; lo scambio comunicativo non ha attribuito punti.`,
    );
  } else {
    sentences.push("Non hai inviato risposte al mittente.");
  }

  if (!firstDecision) {
    sentences.push(
      "Non hai espresso una decisione di gestione tra segnalazione, archiviazione e ignorare.",
    );
  } else if (firstDecision === "archivia") {
    sentences.push(
      opened
        ? "La prima decisione è stata archiviare la comunicazione legittima; l’archiviazione ha contribuito al risultato con 5 punti."
        : "La prima decisione è stata archiviare, ma senza una precedente apertura l’archiviazione non ha contribuito al punteggio.",
    );
  } else if (firstDecision === "ignora") {
    sentences.push(copy.decisions.ignora);
  } else {
    sentences.push(
      "Hai segnalato come sospetta una comunicazione legittima. È un falso positivo comprensibile, ma gli indizi disponibili avrebbero consentito una valutazione più precisa.",
    );
  }

  if (decisionEvents.length > 1) {
    sentences.push(
      "Le azioni di gestione successive non hanno sostituito la prima decisione né assegnato nuovamente i relativi punti.",
    );
  }

  sentences.push(copy.points(points));
  return sentences.join(" ");
}

function describeFraudPathSummary(emailEvents: EventLog[]): string {
  const firstIndex = (action: ActionType) =>
    emailEvents.findIndex((event) => event.tipo_azione === action);
  const opened = firstIndex("apri_email") >= 0;
  const verifyIndex = firstIndex("verifica_link");
  const clickIndex = firstIndex("click_link");
  const credentialIndex = firstIndex("credenziali_inserite");
  const reportIndex = firstIndex("segnala");

  if (!opened) return DEBRIEF_TESTI.paths.notOpened;

  if (credentialIndex >= 0) {
    return `${DEBRIEF_TESTI.paths.credentials}${
      reportIndex > credentialIndex
        ? " Hai poi segnalato il messaggio, dopo aver completato il login simulato."
        : ""
    }`;
  }

  if (clickIndex >= 0) {
    return `${DEBRIEF_TESTI.paths.clickNoCredentials}${
      reportIndex > clickIndex
        ? " Hai poi segnalato il messaggio dopo essere tornato dal portale."
        : reportIndex >= 0 && reportIndex < clickIndex
          ? " La segnalazione era avvenuta prima del clic successivo."
          : ""
    }`;
  }

  return `${DEBRIEF_TESTI.paths.openedNoClick}${
    verifyIndex >= 0
      ? " Hai anche verificato l’indirizzo del collegamento."
      : ""
  }${
    reportIndex >= 0 ? DEBRIEF_TESTI.paths.reportedNoClick : ""
  }`;
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    archive: <><path d="M4 8h16v12H4zM3 4h18v4H3z" /><path d="M9 12h6" /></>,
    shield: <path d="M12 3 5 6v5c0 4.4 2.9 8 7 10 4.1-2 7-5.6 7-10V6zM12 8v5M12 17h.01" />,
    reply: <><path d="m10 8-5 4 5 4" /><path d="M5 12h8c4 0 6 2 6 6" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
    document: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    check: <path d="m5 12 4 4L19 6" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    gear: <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2.2-.7a7 7 0 0 0-.7-1.7l1.1-2-2.1-2.1-2 1.1a7 7 0 0 0-1.7-.7L10.5 2h-3l-.7 2.2a7 7 0 0 0-1.7.7l-2-1.1L1 5.9l1.1 2a7 7 0 0 0-.7 1.7L0 10.5v3l2.2.7a7 7 0 0 0 .7 1.7l-1.1 2L3.9 20l2-1.1a7 7 0 0 0 1.7.7l.9 2.4h3l.7-2.2a7 7 0 0 0 1.7-.7l2 1.1 2.1-2.1-1.1-2a7 7 0 0 0 .7-1.7z" transform="translate(2)" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 18h3" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2c0-3 2-5 6-5s6 2 6 5v2M16 6a3 3 0 0 1 0 6M18 14c2 .7 3 2.2 3 4v2" /></>,
    add: <path d="M12 5v14M5 12h14" />,
    arrowLeft: <path d="m15 18-6-6 6-6M9 12h11" />,
    arrowRight: <path d="m9 6 6 6-6 6M4 12h11" />,
    reload: <path d="M20 7v5h-5M19 12a7 7 0 1 0-2 5" />,
    siteControls: <><path d="M4 7h7M15 7h5M4 17h5M13 17h7" /><circle cx="13" cy="7" r="2" /><circle cx="11" cy="17" r="2" /></>,
    
    key: <><circle cx="8" cy="8" r="4" /><path d="m11 11 9 9M15 15l2-2M17 17l2-2" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    maximize: (
  <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" />
),
minimize: (
  <path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5" />
),
    sent: (
      <path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" />
    ),
      draft: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="m16 5 3 3M9 17l3.5-.7L21 7.8a2.1 2.1 0 0 0-3-3L9.5 13.3 9 17Z" />
    </>
  ),
};

return (
  <svg
    aria-hidden="true"
    className="icon"
    fill="none"
    height={size}
    viewBox="0 0 24 24"
    width={size}
  >
    {paths[name]}
  </svg>
);
}


function AchievementReveal({
  children,
}: {
  children: React.ReactNode;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;

    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.15,
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`achievement-section ${
        visible ? "achievement-visible" : ""
      }`}
      aria-label="Riconoscimenti formativi"
    >
      {children}
    </section>
  );
}


function MicrosoftLogo() {
  return (
    <div className="microsoft-logo" aria-label="Microsoft">
      <span className="microsoft-mark" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>Microsoft</span>
    </div>
  );
}

function BrowserBar({
  address,
  onBack,
  actions,
}: {
  address: string;
  onBack?: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <header className="browser-bar" aria-label="Barra del browser simulata">
      <div className="browser-navigation">
        <button
          aria-label="Indietro"
          className="browser-navigation-button"
          disabled={!onBack}
          onClick={onBack}
          type="button"
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <button
          aria-label="Avanti"
          className="browser-navigation-button"
          disabled
          type="button"
        >
          <Icon name="arrowRight" size={18} />
        </button>
        <button
          aria-label="Ricarica"
          className="browser-navigation-button"
          disabled
          type="button"
        >
          <Icon name="reload" size={17} />
        </button>
      </div>
      <div className="browser-address">
        <Icon name="siteControls" size={16} />
        <span>{address}</span>
      </div>
      {actions && <div className="browser-actions">{actions}</div>}
      <button
        aria-label="Menu del browser"
        className="browser-menu-button"
        disabled
        type="button"
      >
        <Icon name="more" size={18} />
      </button>
    </header>
  );
}

function playMailboxNotification() {
  try {
    const audio = new Audio("/outlook_web_new_mail.mp3");
    audio.volume = 0.7;

    void audio.play().catch(() => {
      // La simulazione continua anche se l'audio è bloccato.
    });
  } catch {
    // Audio non disponibile.
  }
}

function playReplyNotification() {
  try {
    const audio = new Audio(
      "/universfield-email-notification-143029.mp3"
    );
    audio.volume = 0.45;

    void audio.play().catch(() => {
      // La simulazione continua anche senza audio.
    });
  } catch {
    // Audio non disponibile.
  }
}

function randomSessionCode() {
  return `GLAM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("intro");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSentId, setSelectedSentId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [finalScore, setFinalScore] = useState<ScoreResult | null>(null);
  const [sessionCode] = useState(randomSessionCode);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [notice, setNotice] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [readMailIds, setReadMailIds] = useState<Set<string>>(new Set());
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [conversations, setConversations] = useState<
    Record<string, ConversationTurn[]>
  >({});
  const [loadingReplyFor, setLoadingReplyFor] = useState<string | null>(null);
  const [blockedMailIds, setBlockedMailIds] = useState<Set<string>>(new Set());
  const [selectedFolder, setSelectedFolder] = useState<ViewFolder>("inbox");
  const [activeInboxShortcut, setActiveInboxShortcut] = useState<
    "favorites" | "account"
  >("account");
  const [mailFolders, setMailFolders] = useState<Record<string, MailFolder>>(
    () =>
      Object.fromEntries(mails.map((mail) => [mail.id, "inbox"])) as Record<
        string,
        MailFolder
      >,
  );
  const [finishModal, setFinishModal] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarSoundPlayed = useRef(false);
  const [reportModal, setReportModal] = useState(false);
  const [exitModal, setExitModal] = useState(false);
  const [loginStep, setLoginStep] = useState<
    "email" | "password" | "unavailable"
  >("email");
  const [loginLoading, setLoginLoading] = useState<
    "email" | "password" | null
  >(null);
  const [loginPortalInstance, setLoginPortalInstance] = useState(0);
  const [archivePreview, setArchivePreview] = useState<
    "agenda" | "materials" | null
  >(null);
  const [emailPortale, setEmailPortale] = useState("");
  const [emailPerDebrief, setEmailPerDebrief] = useState("");
  const emailCredentialInput = useRef<HTMLInputElement>(null);
  const passwordCredentialInput = useRef<HTMLInputElement>(null);
  const credentialsEventLogged = useRef(false);
  const actionNoticeTimer = useRef<number | null>(null);
  const loginLoadingTimer = useRef<number | null>(null);
  const loginTransitionId = useRef(0);
  const pendingEvents = useRef(
    new Map<string, { event: EventLog; attempt: number }>(),
  );
  const flushingEvents = useRef(false);
  const repliesInFlight = useRef(new Set<string>());
  const blockedMailIdsRef = useRef(new Set<string>());
  const finishingSimulation = useRef(false);
  const selected = mails.find((mail) => mail.id === selectedId) ?? null;
  const selectedConversation = selected
    ? conversations[selected.id] ?? []
    : [];
  const selectedReplyLimitReached = selectedConversation.length >= 4;
  const selectedIsBlocked = selected
    ? blockedMailIds.has(selected.id)
    : false;
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase("it");
  const visibleMails = mails.filter(
    (mail) =>
      mailFolders[mail.id] === selectedFolder &&
      (normalizedSearchQuery === "" ||
        mailSearchIndex.get(mail.id)?.includes(normalizedSearchQuery)),
    );
  // Ricostruisce la Posta inviata dalle risposte già registrate.
  // Non genera eventi e non effettua chiamate al backend.
  const sentMessages = useMemo<SentMessage[]>(() => {
    const turnIndexes = new Map<string, number>();

    return events
      .filter((event) => event.tipo_azione === "rispondi")
      .map((event): SentMessage | null => {
        if (!event.id_email) return null;

        const mail = mails.find(
          (item) => item.id === event.id_email
        );

        if (!mail) return null;

        const index = turnIndexes.get(mail.id) ?? 0;
        turnIndexes.set(mail.id, index + 1);

        const turn = conversations[mail.id]?.[index];

        if (!turn) return null;

        return {
          id: event.id,
          mail,
          text: turn.userText,
          timestamp: event.timestamp,
        };
      })
      .filter((item): item is SentMessage => item !== null)
      .reverse();
  }, [events, conversations]);

  
  // Raggruppa le risposte inviate per email originale.
  const sentConversations = mails
    .map((mail) => {
      const messages = sentMessages.filter(
        (item) => item.mail.id === mail.id
      );

      if (messages.length === 0) return null;

      return {
        id: mail.id,
        mail,
        messages,
        latest: messages[0],
      };
    })
    .filter(
      (item): item is NonNullable<typeof item> => item !== null
    )
    .sort(
      (a, b) =>
        new Date(b.latest.timestamp).getTime() -
        new Date(a.latest.timestamp).getTime()
    );

  const visibleSentConversations = sentConversations.filter(
    (conversation) =>
      `${conversation.mail.sender} ${conversation.mail.address} ${
        conversation.mail.subject
      } ${conversation.messages.map((item) => item.text).join(" ")}`
        .toLocaleLowerCase("it")
        .includes(normalizedSearchQuery)
  );

  const selectedSent =
    sentConversations.find(
      (conversation) => conversation.id === selectedSentId
    ) ?? null;


  const inboxCount = mails.filter(
    (mail) => mailFolders[mail.id] === "inbox",
  ).length;
  const junkCount = mails.filter(
    (mail) => mailFolders[mail.id] === "junk",
  ).length;
  const archiveCount = mails.filter(
    (mail) => mailFolders[mail.id] === "archive",
  ).length;

  const firstDecisions = useMemo(() => {
    const decisions = new Map<string, EventLog>();
    events.forEach((event) => {
      if (
        event.id_email &&
        firstDecisionActions.includes(event.tipo_azione) &&
        !decisions.has(event.id_email)
      ) {
        decisions.set(event.id_email, event);
      }
    });
    return decisions;
  }, [events]);

  useEffect(
    () => () => {
      if (actionNoticeTimer.current !== null) {
        window.clearTimeout(actionNoticeTimer.current);
      }
      if (loginLoadingTimer.current !== null) {
        window.clearTimeout(loginLoadingTimer.current);
      }
    },
    [],
  );

  function showActionNotice(message: string) {
    if (actionNoticeTimer.current !== null) {
      window.clearTimeout(actionNoticeTimer.current);
    }
    setActionNotice(message);
    actionNoticeTimer.current = window.setTimeout(() => {
      setActionNotice("");
      actionNoticeTimer.current = null;
    }, 3000);
  }

  async function flushPendingEvents() {
    if (flushingEvents.current || pendingEvents.current.size === 0) return;
    flushingEvents.current = true;
    let completed = false;
    try {
      const groups = new Map<number, EventLog[]>();
      pendingEvents.current.forEach(({ event, attempt }) => {
        const group = groups.get(attempt) ?? [];
        group.push(event);
        groups.set(attempt, group);
      });
      for (const [attempt, group] of groups) {
        await sendEvents(
          sessionCode,
          attempt,
          group.map((event) => ({
            id: event.id,
            id_email: event.id_email,
            tipo_azione: event.tipo_azione,
            esito: event.esito,
            timestamp: event.timestamp,
          })),
        );
        group.forEach((event) => pendingEvents.current.delete(event.id));
      }
      completed = true;
    } catch {
      // Gli eventi restano in coda e verranno ritentati alla prossima azione.
    } finally {
      flushingEvents.current = false;
      if (completed && pendingEvents.current.size > 0) {
        void flushPendingEvents();
      }
    }
  }

  function logAction(
    type: ActionType,
    mail: Mail | null,
    dettaglio: string,
  ): EventLog {
    let esito: EventLog["esito"] = "neutro";
    if (type === "segnala") {
      esito = mail?.id === "email_3" ? "corretto" : "errato";
    } else if (type === "archivia" || type === "ignora") {
      esito = mail?.id === "email_3" ? "errato" : "corretto";
    } else if (type === "verifica_link") {
      esito = "corretto";
    } else if (
      (type === "click_link" && mail?.id === "email_3") ||
      type === "credenziali_inserite"
    ) {
      esito = "errato";
    }

    const event: EventLog = {
      id: crypto.randomUUID(),
      tipo_azione: type,
      id_email: mail?.id ?? null,
      esito,
      dettaglio,
      timestamp: new Date().toISOString(),
      origine: "client",
    };
    setEvents((current) => [...current, event]);
    pendingEvents.current.set(event.id, { event, attempt: attemptNumber });
    void flushPendingEvents();
    return event;
  }

  function addServerEvent(event: ServerEvent) {
    setEvents((current) => {
      if (current.some((item) => item.id === event.id)) return current;
      return [...current, event as EventLog];
    });
  }

function openCalendar() {
  setCalendarOpen(true);

  if (calendarSoundPlayed.current) return;

  calendarSoundPlayed.current = true;

  try {
    const audio = new Audio("/outlook_notification_sound.mp3");
    audio.volume = 0.55;
    void audio.play().catch(() => {});
  } catch {
    // Il calendario funziona anche senza audio.
  }
}


useEffect(() => {
  const syncFullscreen = () => {
    setIsFullscreen(Boolean(document.fullscreenElement));
  };

  document.addEventListener("fullscreenchange", syncFullscreen);

  return () => {
    document.removeEventListener("fullscreenchange", syncFullscreen);
  };
}, []);

useEffect(() => {
  if (
    (screen === "results" || screen === "exited") &&
    document.fullscreenElement
  ) {
    void document.exitFullscreen().catch(() => {});
  }
}, [screen]);

function toggleFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {});
    return;
  }

  if (document.documentElement.requestFullscreen) {
    void document.documentElement.requestFullscreen().catch(() => {
      // La simulazione resta utilizzabile anche senza schermo intero.
    });
  }
}

function renderFullscreenControl() {
  return (
    <button
      className="fullscreen-floating-control"
      type="button"
      onClick={toggleFullscreen}
      title={
        isFullscreen
          ? "Esci dallo schermo intero (anche con Esc)"
          : "Attiva schermo intero"
      }
      aria-label={
        isFullscreen
          ? "Esci dallo schermo intero"
          : "Attiva schermo intero"
      }
    >
      <Icon
        name={isFullscreen ? "minimize" : "maximize"}
        size={18}
      />
    </button>
  );
}

  
  function begin() {
    if (!accepted) return;
    playMailboxNotification();
    logAction("inizio_sessione", null, "sessione_avviata");
    setScreen("mail");
  }

  function finishSimulation() {
    if (finishingSimulation.current) return;
    finishingSimulation.current = true;
    const finishEvent = logAction("termina", null, "simulazione_terminata");
    setFinalScore(calculateScore([...events, finishEvent]));
    void flushPendingEvents();
    setScreen("results");
  }

  function confirmFinishSimulation() {
    if (finishingSimulation.current) return;
    setFinishModal(false);
    if (screen === "construction") {
      cancelLoginLoading();
      setEmailPortale("");
    }
    finishSimulation();
  }

  function requestFinishSimulation() {
    if (finishingSimulation.current) return;
    if (firstDecisions.size < 5) {
      setFinishModal(true);
      return;
    }
    confirmFinishSimulation();
  }

  function renderFinishConfirmation() {
    if (!finishModal) return null;
    const decisionCount = firstDecisions.size;
    return (
      <Modal onClose={() => setFinishModal(false)}>
        <h2>Vuoi concludere la simulazione?</h2>
        <p>
          Hai registrato una decisione per {decisionCount}{" "}
          {decisionCount === 1 ? "messaggio" : "messaggi"} su 5. Puoi
          terminare la simulazione in qualsiasi momento, anche senza
          aver preso una decisione per tutte le email. Il risultato 
          finale terrà conto soltanto delle azioni effettivamente compiute.
        </p>
        <div className="modal-actions">
          <button
            className="primary-button"
            onClick={confirmFinishSimulation}
          >
            Mostra i risultati
          </button>
          <button onClick={() => setFinishModal(false)}>
            Continua
          </button>
        </div>
      </Modal>
    );
  }

  function openMail(mail: Mail) {
    setSelectedId(mail.id);
    setReadMailIds((current) => {
      if (current.has(mail.id)) return current;
      const updated = new Set(current);
      updated.add(mail.id);
      return updated;
    });
    setReplying(false);
    setNotice(
      blockedMailIdsRef.current.has(mail.id)
        ? "Mittente bloccato. Non puoi più rispondere a questa conversazione."
        : "",
    );
    logAction("apri_email", mail, "messaggio_aperto");
  }


function openFolder(
  folder: ViewFolder,
  inboxShortcut?: "favorites" | "account",
) {
  setSelectedFolder(folder);
  if (inboxShortcut) setActiveInboxShortcut(inboxShortcut);
  setSelectedId(null);
  setSelectedSentId(null);
  setReplying(false);
  setReplyText("");
  setNotice("");
}


  function updateSearchQuery(value: string) {
    setSearchQuery(value);
    if (
      selected &&
      value.trim() !== "" &&
      !mailSearchIndex
        .get(selected.id)
        ?.includes(value.trim().toLocaleLowerCase("it"))
    ) {
      setSelectedId(null);
      setReplying(false);
      setReplyText("");
      setNotice("");
    }
  }

  function decide(action: ActionType, outcome: string) {
    if (!selected) return;
    const selectedMailId = selected.id;
    const wasManaged = firstDecisions.has(selected.id);
    logAction(action, selected, outcome);
    if (action === "archivia") {
      showActionNotice("Messaggio spostato in Archivio");
      setMailFolders((current) => ({
        ...current,
        [selectedMailId]: "archive",
      }));
      if (selectedFolder !== "archive") {
        setSelectedId(null);
        setReplying(false);
        setReplyText("");
        setNotice("");
        return;
      }
    }
    setNotice(
      wasManaged
        ? "Azione registrata."
        : "Decisione registrata. Puoi continuare con gli altri messaggi.",
    );
  }

  function verifyLink(mail: Mail) {
    logAction("verifica_link", mail, "destinazione_visualizzata");
  }

  function clickLink(mail: Mail) {
    if (blockedMailIdsRef.current.has(mail.id)) return;
    logAction("click_link", mail, "collegamento_aperto_nella_simulazione");
    if (mail.id === "email_3") {
      cancelLoginLoading();
      setLoginStep("email");
      setLoginPortalInstance((current) => current + 1);
      setEmailPortale("");
    } else if (mail.id === "email_2") {
      setArchivePreview(null);
    }
    setScreen(mail.id === "email_2" ? "archive-page" : "construction");
  }

  function cancelLoginLoading() {
    loginTransitionId.current += 1;
    if (loginLoadingTimer.current !== null) {
      window.clearTimeout(loginLoadingTimer.current);
      loginLoadingTimer.current = null;
    }
    setLoginLoading(null);
  }

  function returnToMailboxFromLogin() {
    cancelLoginLoading();
    setEmailPortale("");
    setSelectedId("email_3");
    setScreen("mail");
  }

  function advanceSimulatedLogin() {
    if (loginLoadingTimer.current !== null) return;
    const emailInput = emailCredentialInput.current;
    if (!emailInput?.reportValidity()) return;
    setEmailPortale(emailInput.value);
    setLoginLoading("email");
    const transitionId = ++loginTransitionId.current;
    loginLoadingTimer.current = window.setTimeout(() => {
      if (loginTransitionId.current !== transitionId) return;
      loginLoadingTimer.current = null;
      setLoginLoading(null);
      setLoginStep("password");
      window.requestAnimationFrame(() => {
        passwordCredentialInput.current?.focus();
      });
    }, 650);
  }

  function submitSimulatedLogin() {
    if (loginLoadingTimer.current !== null) return;
    const passwordIsValid =
      passwordCredentialInput.current?.reportValidity() ?? false;
    if (!passwordIsValid) return;

    setEmailPerDebrief(emailPortale);
    setLoginLoading("password");
    const transitionId = ++loginTransitionId.current;
    loginLoadingTimer.current = window.setTimeout(() => {
      if (loginTransitionId.current !== transitionId) return;
      loginLoadingTimer.current = null;
      setLoginLoading(null);
      setLoginStep("unavailable");
    }, 1250);

    if (!credentialsEventLogged.current) {
      const fraudulentMail = mails.find((mail) => mail.id === "email_3");
      if (fraudulentMail) {
        credentialsEventLogged.current = true;
        logAction(
          "credenziali_inserite",
          fraudulentMail,
          "credenziali_inserite_nella_simulazione",
        );
      }
    }
  }

  async function sendReply() {
    if (
      !selected ||
      !replyText.trim() ||
      blockedMailIdsRef.current.has(selected.id) ||
      repliesInFlight.current.has(selected.id) ||
      loadingReplyFor === selected.id ||
      (conversations[selected.id]?.length ?? 0) >= 4
    ) {
      return;
    }
    const mail = selected;
    repliesInFlight.current.add(mail.id);
    const text = replyText.trim();
    const replyEvent = logAction(
      "rispondi",
      mail,
      "risposta_inviata_nella_simulazione",
    );
    const turnId = crypto.randomUUID();
    const expectedNumber = (conversations[mail.id]?.length ?? 0) + 1;
    setConversations((current) => ({
      ...current,
      [mail.id]: [
        ...(current[mail.id] ?? []),
        {
          id: turnId,
          userText: text,
          assistantText: null,
          responseNumber: expectedNumber,
          fallback: false,
          stop: false,
        },
      ],
    }));
    setNotice("Azione registrata.");
    setReplying(false);
    setReplyText("");
    setLoadingReplyFor(mail.id);

    try {
      const response = await requestReply({
        sessionId: sessionCode,
        attempt: attemptNumber,
        emailId: mail.id,
        text,
        timestamp: replyEvent.timestamp,
      });
      if (response.evento_server) addServerEvent(response.evento_server);
      const assistantText = response.stop
        ? "Puoi interrompere in qualsiasi momento con il pulsante Esci dalla simulazione"
        : response.testo ?? "Ricevuto, ti rispondo appena posso";
      setConversations((current) => ({
        ...current,
        [mail.id]: (current[mail.id] ?? []).map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                assistantText,
                responseNumber: response.numero_risposta,
                fallback: Boolean(response.fallback),
                stop: Boolean(response.stop),
              }
            : turn,
        ),
      }));
            if (!response.fallback && !response.stop) {
        playReplyNotification();
      }
    } catch (error) {
      if (
        error instanceof BackendError &&
        error.data.evento_server &&
        typeof error.data.evento_server === "object"
      ) {
        addServerEvent(error.data.evento_server as ServerEvent);
      }
      const explicitConfigurationError =
        error instanceof Error &&
        error.message === "missing_anthropic_model";
      setConversations((current) => ({
        ...current,
        [mail.id]: (current[mail.id] ?? []).map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                assistantText: explicitConfigurationError
                  ? "Errore di configurazione: ANTHROPIC_MODEL non disponibile."
                  : "Ricevuto, ti rispondo appena posso",
                fallback: true,
              }
            : turn,
        ),
      }));
    } finally {
      repliesInFlight.current.delete(mail.id);
      setLoadingReplyFor((current) => (current === mail.id ? null : current));
    }
  }

  function reportSuspicious() {
    if (!selected) return;
    const updatedBlockedMailIds = new Set(blockedMailIdsRef.current);
    updatedBlockedMailIds.add(selected.id);
    blockedMailIdsRef.current = updatedBlockedMailIds;
    setBlockedMailIds(updatedBlockedMailIds);
    setMailFolders((current) => ({
      ...current,
      [selected.id]: "junk",
    }));
    setReplying(false);
    setReplyText("");
    decide(
      "segnala",
      selected.id === "email_3"
        ? "segnalato_come_sospetto"
        : "falso_positivo",
    );
    if (selectedFolder === "junk") {
      setNotice(
        "Mittente bloccato. Non puoi più rispondere a questa conversazione.",
      );
    } else {
      setSelectedId(null);
      setNotice("");
    }
    setReportModal(false);
    showActionNotice("Messaggio segnalato e mittente bloccato");
  }

  function restart() {
    void flushPendingEvents();
    setScreen("intro");
    setAccepted(false);
    setEvents([]);
    setFinalScore(null);
    setAttemptNumber((current) => current + 1);
    setSelectedId(null);
    setSelectedSentId(null);
    setNotice("");
    setActionNotice("");
    setSearchQuery("");
    setReadMailIds(new Set());
    if (actionNoticeTimer.current !== null) {
      window.clearTimeout(actionNoticeTimer.current);
      actionNoticeTimer.current = null;
    }
    setReplying(false);
    setReplyText("");
    setConversations({});
    setLoadingReplyFor(null);
    blockedMailIdsRef.current = new Set();
    setBlockedMailIds(new Set());
    setSelectedFolder("inbox");
    setActiveInboxShortcut("account");
    setMailFolders(
      Object.fromEntries(mails.map((mail) => [mail.id, "inbox"])) as Record<
        string,
        MailFolder
      >,
    );
    finishingSimulation.current = false;
    setFinishModal(false);
    setReportModal(false);
    setExitModal(false);
    setLoginStep("email");
    cancelLoginLoading();
    setArchivePreview(null);
    setEmailPortale("");
    setEmailPerDebrief("");
    credentialsEventLogged.current = false;
  }

  if (screen === "intro") {
    return (
      <>
        <main className="welcome-shell">
          <div className="welcome-brand">
            <div className="brand-mark"><Icon name="shield" size={29} /></div>
            <div>
              <strong>Cybersecurity per le Digital Humanities</strong>
              <span>Formazione per le istituzioni culturali</span>
            </div>
          </div>
          <section className="welcome-card">
            <div className="welcome-icon"><Icon name="mail" size={31} /></div>
            <h1>Simulazione di sicurezza informatica</h1>
            <p className="welcome-duration">
              Durata indicativa: 10 minuti · Nessun limite di tempo
            
            </p>
            <p className="welcome-lead">
              Lavori presso l&apos;Archivio Storico Civico di Montesanto. È
              lunedì mattina e apri la posta: leggi le email e, 
              se lo ritieni utile, rispondi ai mittenti.
              <br />
              
              Per valutare i messaggi, clicca «Attendibile · Archivia» se credi
              siano autentici, «Segnala come sospetto» se sospetti una frode 
              oppure «Ignora» se preferisci non esprimere un giudizio. 
              <br /> 
              <br /> 
            </p>
                                              
            <div className="notice-box">
              <Icon name="info" size={20} />
              <div>
                <strong>Prima di iniziare</strong>
                <p>{AVVISO_INIZIALE}</p>
              </div>
            </div>
            <label className="consent">
              <input
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                type="checkbox"
              />
              <span>Ho letto e compreso le informazioni</span>
            </label>
            <button className="start-button" disabled={!accepted} onClick={begin}>
              Inizia
            </button>
            <button
  className="fullscreen-button"
  type="button"
  onClick={toggleFullscreen}
>
  <Icon name={isFullscreen ? "close" : "arrowRight"} size={15} />
  {isFullscreen ? "Esci dallo schermo intero" : "Attiva schermo intero"}
</button>
            <small className="session-preview">
  Codice di sessione · {sessionCode}
</small>

<p className="project-credit">
  Prototipo sviluppato da Davide Passariello · 2026
</p>
</section>
</main>
        <DebugView events={events} />
      </>
    );
  }

  if (screen === "exited") {
    return (
      <>
        <main className="end-shell">
          <section className="end-card compact">
            <div className="end-icon"><Icon name="mail" size={30} /></div>
            <h1>Hai interrotto la simulazione</h1>
            <p>
              Grazie per aver partecipato. I dati registrati fino a questo punto
              sono associati a un codice di sessione casuale, senza nome né
              indirizzo email.
            </p>
            <button className="primary-button" onClick={restart}>Ricomincia</button>
          </section>
        </main>
        <DebugView events={events} />
      </>
    );
  }

  if (screen === "archive-page") {
    return (
      <>
        <main className="archive-site">
          <BrowserBar
            address={
              archivePreview === "agenda"
                ? "https://intranet.archiviomontesanto.example/riunioni/ordine-del-giorno.pdf"
                : "https://intranet.archiviomontesanto.example/riunioni"
            }
            onBack={() => {
              if (archivePreview === null) {
                setScreen("mail");
              } else {
                setArchivePreview(null);
              }
            }}
          />
          <header className="archive-site-header">
            <div className="archive-site-mark">AS</div>
            <div>
              <strong>Archivio Storico Civico di Montesanto</strong>
              <span>Area riservata al personale</span>
            </div>
          </header>
          <nav>Intranet <span>/</span> Riunioni <span>/</span> Staff</nav>
          <section
            className={
              archivePreview === "agenda" ? "pdf-viewer-container" : undefined
            }
          >
            {archivePreview === "agenda" ? (
              <>
                <div className="pdf-viewer">
                  <div className="pdf-viewer-toolbar">
                    <strong>Ordine_del_giorno.pdf</strong>
                    <div aria-label="Stato del documento">
                      <span>1 / 1</span>
                      <span>100%</span>
                    </div>
                  </div>
                  <div className="pdf-viewer-viewport">
                    <article
                      aria-label="Anteprima del documento Ordine del giorno"
                      className="pdf-sheet"
                    >
                      <p className="pdf-institution">
                        ARCHIVIO STORICO CIVICO DI MONTESANTO
                      </p>
                      <h1>ORDINE DEL GIORNO</h1>
                      <p className="pdf-meeting">
                        Riunione di staff - Giovedì, ore 10:30
                      </p>
                      <ol>
                        <li>1) Comunicazioni della Direzione.</li>
                        <li>
                          2) Aggiornamento sulle attività e sui progetti
                          dell&apos;archivio.
                        </li>
                        <li>
                          3) Organizzazione dei servizi e delle attività del
                          personale.
                        </li>
                        <li>4) Varie ed eventuali.</li>
                      </ol>
                    </article>
                  </div>
                </div>
              </>
            ) : archivePreview === null ? (
              <>
                <p className="eyebrow">RIUNIONE DI STAFF</p>
                <h1>Ordine del giorno e materiali</h1>
                <p className="archive-date">
                  Giovedì, ore 10:30 · Sala conferenze
                </p>
                <button
                  className="archive-document"
                  onClick={() => setArchivePreview("agenda")}
                  type="button"
                >
                  <Icon name="document" size={22} />
                  <span>
                    <strong>Ordine del giorno</strong>
                    <span>Aggiornato dalla Segreteria di Direzione</span>
                  </span>
                </button>
                <button
                  className="archive-document"
                  onClick={() => setArchivePreview("materials")}
                  type="button"
                >
                  <Icon name="document" size={22} />
                  <span>
                    <strong>Materiali per la riunione</strong>
                    <span>Documenti di lavoro</span>
                  </span>
                </button>
              </>
            ) : (
              <article className="archive-preview">
                <button
                  className="archive-preview-back"
                  onClick={() => setArchivePreview(null)}
                  type="button"
                >
                  <Icon name="arrowLeft" size={16} />
                  Ordine del giorno e materiali
                </button>
                <p className="eyebrow">DOCUMENTO INTERNO</p>
                <h1>Materiali per la riunione</h1>
                <ul>
                  <li>1) Sintesi delle attività in corso.</li>
                  <li>2) Aggiornamenti organizzativi.</li>
                  <li>3) Documentazione di supporto alla riunione.</li>
                </ul>
              </article>
            )}
            <button className="primary-button" onClick={() => setScreen("mail")}>
              Torna alla posta
            </button>
          </section>
        </main>
        {renderFullscreenControl()}
        <DebugView events={events} />
      </>
    );
  }

  if (screen === "construction") {
    return (
      <>
        <main className="login-page">
          <BrowserBar
            actions={
              <div className="login-simulation-actions">
              <button
                className="finish-button"
                onClick={requestFinishSimulation}
              >
                Termina e vedi risultati
              </button>
              <button className="exit-button" onClick={() => setExitModal(true)}>
                Esci dalla simulazione
              </button>
              </div>
            }
            address="https://login.rnicrosoftonline.com/oauth2/authorize"
            onBack={returnToMailboxFromLogin}
          />

          <div className="login-background-shape shape-one" />
          <div className="login-background-shape shape-two" />

          <div className="login-center" key={loginPortalInstance}>
            <section
              aria-hidden={loginStep !== "email"}
              className="login-card login-step"
              hidden={loginStep !== "email"}
            >
              <MicrosoftLogo />
              <h1>Accedi</h1>
              <input
                aria-label="Inserisci l'indirizzo di posta elettronica"
                autoComplete="off"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                data-lpignore="true"
                name="campo_a"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    advanceSimulatedLogin();
                  }
                }}
                placeholder="Inserisci l'indirizzo di posta elettronica"
                ref={emailCredentialInput}
                required
                type="email"
              />
              <small className="login-reminder">
                Simulazione: usa dati inventati
              </small>
              <p className="login-account-copy">
                Se non si ha un account,{" "}
                <button className="login-link" type="button">
                  fare clic qui per crearne uno.
                </button>
              </p>
              <button className="login-link login-help-link" type="button">
                Problemi di accesso all&apos;account?
              </button>
              <div className="login-actions">
                <button
                  className="login-secondary-button"
                  onClick={returnToMailboxFromLogin}
                  type="button"
                >
                  Indietro
                </button>
                <button
                  className="login-primary-button"
                  disabled={loginLoading === "email"}
                  onClick={advanceSimulatedLogin}
                  type="button"
                >
                  {loginLoading === "email" ? (
                    <span
                      aria-label="Caricamento"
                      className="login-spinner"
                      role="status"
                    />
                  ) : (
                    "Avanti"
                  )}
                </button>
              </div>
            </section>

            <section
              aria-hidden={loginStep !== "password"}
              className="login-card login-step"
              hidden={loginStep !== "password"}
            >
              <MicrosoftLogo />
              <div className="login-account-row">
                <button
                  aria-label="Indietro"
                  className="login-back-button"
                  onClick={() => {
                    cancelLoginLoading();
                    setLoginStep("email");
                  }}
                  type="button"
                >
                  <Icon name="arrowLeft" size={18} />
                </button>
                <span>{emailPortale}</span>
              </div>
              <h1>Immettere la password</h1>
              <input
                aria-label="Password"
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                data-lpignore="true"
                name="campo_b"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitSimulatedLogin();
                  }
                }}
                placeholder="Password"
                ref={passwordCredentialInput}
                required
                spellCheck={false}
                type="text"
              />
              <small className="login-reminder">
                Simulazione: usa dati inventati
              </small>
              <button className="login-link login-help-link" type="button">
                Ho dimenticato la password
              </button>
              <button className="login-link login-help-link" type="button">
                Usa il volto, l&apos;impronta digitale, il PIN o la chiave di
                sicurezza
              </button>
              <div className="login-actions">
                <button
                  className="login-primary-button"
                  disabled={loginLoading === "password"}
                  onClick={submitSimulatedLogin}
                  type="button"
                >
                  {loginLoading === "password" ? (
                    <span
                      aria-label="Caricamento"
                      className="login-spinner"
                      role="status"
                    />
                  ) : (
                    "Accedi"
                  )}
                </button>
              </div>
            </section>

            <section
              aria-hidden={loginStep !== "unavailable"}
              className="login-card login-step login-unavailable"
              hidden={loginStep !== "unavailable"}
            >
              <MicrosoftLogo />
              <h1>Non è stato possibile aprire il documento. Riprova più tardi.</h1>
              <button
                className="login-primary-button"
                onClick={returnToMailboxFromLogin}
                type="button"
              >
                Torna alla posta
              </button>
            </section>

            <button
              className="login-options-card"
              hidden={loginStep !== "email"}
              type="button"
            >
              <Icon name="key" size={22} />
              <span>Opzioni di accesso</span>
            </button>
          </div>

          <footer className="login-footer">
            <button type="button">Condizioni per l&apos;utilizzo</button>
            <button type="button">Privacy e cookie</button>
            <button type="button">Accessibilità</button>
            <button aria-label="Altre informazioni" type="button">
              ...
            </button>
          </footer>
        </main>
        {renderFinishConfirmation()}
        {exitModal && (
          <Modal onClose={() => setExitModal(false)}>
            <h2>Uscire dalla simulazione?</h2>
            <p>
              I progressi di questa sessione verranno interrotti e non sarà
              calcolato né mostrato alcun punteggio.
            </p>
            <div className="modal-actions">
              <button
                className="danger-button"
                onClick={() => {
                  cancelLoginLoading();
                  logAction("esci", null, "simulazione_interrotta");
                  setEmailPortale("");
                  setEmailPerDebrief("");
                  setScreen("exited");
                  setExitModal(false);
                }}
              >
                Esci dalla simulazione
              </button>
              <button onClick={() => setExitModal(false)}>Continua</button>
            </div>
          </Modal>
        )}
        <DebugView events={events} />
        {renderFullscreenControl()}
      </>
    );
  }

  if (screen === "results") {
    const scoreResult = finalScore ?? calculateScore(events);
    const emailThreeEvents = events.filter(
      (event) => event.id_email === "email_3",
    );
    const enteredCredentials = emailThreeEvents.some(
      (event) => event.tipo_azione === "credenziali_inserite",
    );
    const pathSummary = describeFraudPathSummary(emailThreeEvents);
    
const observerBadge = mails.some((mail) => {
  const actions = events.filter(
    (event) => event.id_email === mail.id
  );

  const verifyIndex = actions.findIndex(
    (event) => event.tipo_azione === "verifica_link"
  );

  const clickIndex = actions.findIndex(
    (event) => event.tipo_azione === "click_link"
  );

  return (
    verifyIndex >= 0 &&
    (clickIndex === -1 || verifyIndex < clickIndex)
  );
});

const fraudActions = events.filter(
  (event) => event.id_email === "email_3"
);

const firstFraudDecision = fraudActions.find(
  (event) =>
    event.tipo_azione === "segnala" ||
    event.tipo_azione === "archivia" ||
    event.tipo_azione === "ignora"
);

const reportIndex = fraudActions.findIndex(
  (event) => event.tipo_azione === "segnala"
);

const clickIndex = fraudActions.findIndex(
  (event) => event.tipo_azione === "click_link"
);

const reporterBadge =
  firstFraudDecision?.tipo_azione === "segnala" &&
  reportIndex >= 0 &&
  (clickIndex === -1 || reportIndex < clickIndex);
const earnedBadgeCount =
  Number(observerBadge) + Number(reporterBadge);
    return (
      <>
        <main className="results-shell">
          <article className="debrief">
            <header className="debrief-hero">
              <p className="eyebrow">{DEBRIEF_TESTI.eyebrow}</p>
              <h1>{DEBRIEF_TESTI.title}</h1>
              
<div className="debrief-metrics">
  <div className="debrief-metric">
    <strong>{scoreResult.total}<small>/100</small></strong>
    <span>Punteggio</span>
  </div>

  <div className="debrief-metric">
    <strong>{firstDecisions.size}<small>/5</small></strong>
    <span>Decisioni registrate</span>
  </div>

  <div className="debrief-metric">
    <strong>
      {events.filter(
        (event) => event.tipo_azione === "verifica_link"
      ).length}
    </strong>
    <span>Verifiche dei link</span>
  </div>

  <div className="debrief-metric">
    <strong>
      {events.filter(
        (event) => event.tipo_azione === "rispondi"
      ).length}
    </strong>
    <span>Risposte inviate</span>
  </div>
</div>

            </header>
            
  <AchievementReveal>
  <div className="achievement-intro">
    <div className="achievement-intro-icon">
      <Icon name="star" size={23} />
    </div>

    <div>
      
<h2>
  {earnedBadgeCount === 2
    ? "Complimenti! Hai sbloccato entrambi i riconoscimenti."
    : earnedBadgeCount === 1
      ? "Un riconoscimento conquistato!"
      : "Ogni esperienza è un'occasione per imparare"}
</h2>

<p>
  {earnedBadgeCount === 2
    ? "Hai verificato un collegamento in modo preventivo e segnalato tempestivamente il messaggio fraudolento: due comportamenti importanti per la sicurezza."
    : earnedBadgeCount === 1
      ? "Hai messo in pratica un comportamento prudente. Scopri quale altro riconoscimento puoi conquistare."
      : "Non hai sbloccato riconoscimenti in questo tentativo. Scopri quali comportamenti puoi allenare per migliorare."}
</p>

    </div>
  </div>

  <div className="achievement-grid">
    <div
      className={`achievement-card observer-badge ${
        observerBadge ? "earned" : ""
      }`}
    >
      <div className="achievement-emblem">
        <Icon name="search" size={34} />
      </div>

      <strong>Osservatore attento</strong>

      <span className="achievement-status">
        <Icon name={observerBadge ? "check" : "lock"} size={14} />
        {observerBadge ? "Ottenuto" : "Da conquistare"}
      </span>

      <p>
        {observerBadge
          ? "Hai verificato un collegamento prima di un eventuale clic."
          : "Controlla l'indirizzo di un collegamento prima di aprirlo."}
      </p>
    </div>

    <div
      className={`achievement-card reporter-badge ${
        reporterBadge ? "earned" : ""
      }`}
    >
      <div className="achievement-emblem">
        <Icon name="shield" size={34} />
      </div>

      <strong>Segnalazione tempestiva</strong>

      <span className="achievement-status">
        <Icon name={reporterBadge ? "check" : "lock"} size={14} />
        {reporterBadge ? "Ottenuto" : "Da conquistare"}
      </span>

      <p>
        {reporterBadge
          ? "Hai segnalato il phishing prima di aprirne il collegamento."
          : "Segnala un messaggio fraudolento prima di aprirne il collegamento."}
      </p>
    </div>
  </div>
</AchievementReveal>


            <section className="debrief-section">
              <div className="debrief-section-heading">
                <span>1</span>
                <h2>{DEBRIEF_TESTI.sections.happened}</h2>
              </div>
              <div className="debrief-email-list">
                {mails.map((mail, index) => {
                  const row = scoreResult.rows.find(
                    (result) => result.emailId === mail.id,
                  );
                  const points = row?.points ?? 0;
                  return (
                    <article className="debrief-email-card" key={mail.id}>
                      <div className="debrief-email-number">
                        {DEBRIEF_TESTI.email.label(index + 1)}
                      </div>
                      <h3>{mail.subject}</h3>
                      <p>{describeEmailDebrief(mail, events, points)}</p>
                    </article>
                  );
                })}
              </div>
              <aside className="debrief-reveal">
                <Icon name="shield" size={23} />
                <div>
                  <h3>{DEBRIEF_TESTI.revealTitle}</h3>
                  <p>{DEBRIEF_TESTI.phenomenonBody}</p>
                  <p>{DEBRIEF_TESTI.revealBody}</p>
                  <p>{DEBRIEF_TESTI.legitimateBody}</p>
                </div>
              </aside>
            </section>

            <section className="debrief-section">
              <div className="debrief-section-heading">
                <span>2</span>
                <h2>{DEBRIEF_TESTI.sections.next}</h2>
              </div>
              <p className="debrief-path-summary">{pathSummary}</p>
              <div className="debrief-scenario-grid">
                <article className="debrief-scenario simulation">
                  <h3>{DEBRIEF_TESTI.simulation.label}</h3>
                  <p>{DEBRIEF_TESTI.simulation.body}</p>
                </article>
                <article className="debrief-scenario hypothetical">
                  <h3>{DEBRIEF_TESTI.hypothetical.label}</h3>
                  <ul>
                    {DEBRIEF_TESTI.hypothetical.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="debrief-reassurance">
                    {DEBRIEF_TESTI.hypothetical.reassurance}
                  </p>
                </article>
              </div>
              {enteredCredentials && (
                <aside className="attacker-view">
                  <div className="attacker-view-label">
                    {DEBRIEF_TESTI.attackerView.label}
                  </div>
                  <div className="attacker-fields" aria-hidden="true">
                    <span>
                      {emailPerDebrief || DEBRIEF_TESTI.attackerView.email}
                    </span>
                    <span>{DEBRIEF_TESTI.attackerView.password}</span>
                  </div>
                  <p>{DEBRIEF_TESTI.attackerView.note}</p>
                </aside>
              )}
            </section>

            <section className="debrief-section">
              <div className="debrief-section-heading">
                <span>3</span>
                <h2>{DEBRIEF_TESTI.sections.actions}</h2>
              </div>
              <ul className="debrief-action-list">
                {DEBRIEF_TESTI.actions.map((item) => (
                  <li key={item}>
                    <Icon name="check" size={17} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="memory-rules">
                <h3>{DEBRIEF_TESTI.memoryRulesTitle}</h3>
                <ol>
                  {DEBRIEF_TESTI.memoryRules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ol>
              </div>
            </section>

            <section className="takeaway-card">
              <div className="debrief-section-heading">
                <span>4</span>
                <h2>{DEBRIEF_TESTI.sections.takeaway}</h2>
              </div>
              <div className="takeaway-sheet">
                <header className="takeaway-sheet-header">
                  <div className="takeaway-shield">
                    <Icon name="shield" size={26} />
                  </div>
                  <div>
                    <h3>{DEBRIEF_TESTI.takeaway.title}</h3>
                    <p>{DEBRIEF_TESTI.takeaway.subtitle}</p>
                  </div>
                </header>
                <div className="takeaway-grid">
                  {DEBRIEF_TESTI.takeaway.actions.map((action) => (
                    <article className="takeaway-action" key={action.number}>
                      <div className="takeaway-action-heading">
                        <span>{action.number}</span>
                        <h4>{action.title}</h4>
                      </div>
                      <p>{action.body}</p>
                    </article>
                  ))}
                </div>
                <div className="takeaway-reminder">
                  <strong>{DEBRIEF_TESTI.takeaway.reminder}</strong>
                </div>
              </div>
              <button
                className="print-button"
                onClick={() => window.print()}
                type="button"
              >
                <Icon name="document" size={17} />
                {DEBRIEF_TESTI.takeaway.print}
              </button>
            </section>

            <footer className="debrief-actions">
              <button className="primary-button" onClick={restart} type="button">
                {DEBRIEF_TESTI.replay}
              </button>
            </footer>
          </article>
        </main>
        <DebugView events={events} />
      </>
    );
  }

  return (
    <div className="outlook">
      <BrowserBar address="https://outlook.office.example/mail/" />
      <header className="topbar">
        <button className="app-grid" aria-label="Applicazioni">
          {Array.from({ length: 9 }).map((_, index) => <i key={index} />)}
        </button>
        <strong className="outlook-title">Outlook</strong>
        <label className="search">
          <Icon name="search" size={16} />
          <input
            aria-label="Cerca nelle email"
            onChange={(event) => updateSearchQuery(event.target.value)}
            placeholder="Cerca"
            type="search"
            value={searchQuery}
          />
        </label>
        <div className="top-spacer" />
        <span className="managed-count">
          Decisioni registrate: {firstDecisions.size} su 5
        </span>
        <button className="top-icon" aria-label="Impostazioni"><Icon name="gear" size={19} /></button>
        <div
          className="profile"
          title="Marco Conti - marco.conti@archiviomontesanto.example"
        >
          MC
        </div>
      </header>

      <nav className="tabbar">
        <button className="hamburger"><Icon name="menu" size={18} /></button>
        <span>File</span>
        <span className="active">Home</span>
        <span>Visualizza</span>
        <span>Guida</span>
        <div className="tab-spacer" />
        <span className="session-code">{sessionCode}</span>
      </nav>

      <div className="commandbar">
        <button className="new-message"><Icon name="mail" size={16} /> Nuovo messaggio <Icon name="chevron" size={14} /></button>
        <ToolbarButton icon="trash" label="Elimina" />
        <ToolbarButton
          disabled={!selected}
          icon="archive"
          label="Attendibile · Archivia"
          title="Contrassegna come attendibile e sposta in Archivio"
          onClick={() => decide("archivia", "messaggio_archiviato")}
        />
        <ToolbarButton
          disabled={!selected}
          icon="shield"
          label="Segnala come sospetto"
          title="Sposta in Posta indesiderata e blocca il mittente"
          onClick={() => selected && setReportModal(true)}
        />
        <ToolbarButton
          icon="reply"
          label="Rispondi"
          disabled={
            !selected ||
            selectedIsBlocked ||
            selectedReplyLimitReached ||
            loadingReplyFor === selected.id
          }
          onClick={() =>
            selected &&
            !selectedIsBlocked &&
            !selectedReplyLimitReached &&
            loadingReplyFor !== selected.id &&
            setReplying(true)
          }
        />
        <button className="toolbar-more" disabled><Icon name="more" /></button>
        <div className="command-spacer" />
        <button className="finish-button" onClick={requestFinishSimulation}>
          Termina e vedi risultati
        </button>
        <button className="exit-button" onClick={() => setExitModal(true)}>
          Esci dalla simulazione
        </button>
      </div>

      <div className="workspace">
        <aside className="app-rail">
          <button className="rail-active"><Icon name="mail" size={20} /></button>
          <button aria-label="Apri calendario: 1 evento in programma" title="Calendario · 1 evento in programma" className="calendar-rail-button" onClick={openCalendar} type="button" > <Icon name="calendar" size={20} /> <span className="calendar-badge" aria-hidden="true"> 1 </span> </button>
          <button aria-label="Contatti"><Icon name="users" size={20} /></button>
          <button aria-label="Attività"><Icon name="check" size={20} /></button>
          <div className="rail-spacer" />
          <button aria-label="Aggiungi applicazione"><Icon name="add" size={20} /></button>
        </aside>

        <aside className="folders">
          <div className="folder-section">
            <strong><Icon name="chevron" size={14} /> Preferiti</strong>
            <Folder
              active={
                selectedFolder === "inbox" &&
                activeInboxShortcut === "favorites"
              }
              icon="mail"
              label="Posta in arrivo"
              count={String(inboxCount)}
              onClick={() => openFolder("inbox", "favorites")}
            />
            <Folder
  active={selectedFolder === "sent"}
  icon="sent"
  label="Posta inviata"
  count={sentMessages.length > 0 ? String(sentMessages.length) : undefined}
  onClick={() => openFolder("sent")}
/>
            <Folder icon="draft" label="Bozze" />
          </div>
          <div className="account-title">
            <Icon name="chevron" size={14} />
            <span>marco.conti@archiviomontesanto.example</span>
          </div>
          <div className="folder-list">
            <Folder
              active={
                selectedFolder === "inbox" &&
                activeInboxShortcut === "account"
              }
              icon="mail"
              label="Posta in arrivo"
              count={String(inboxCount)}
              onClick={() => openFolder("inbox", "account")}
            />
            <Folder
              active={selectedFolder === "junk"}
              icon="shield"
              label="Posta indesiderata"
              count={junkCount > 0 ? String(junkCount) : undefined}
              onClick={() => openFolder("junk")}
            />
            <Folder icon="draft" label="Bozze" />
            <Folder
  active={selectedFolder === "sent"}
  icon="sent"
  label="Posta inviata"
  count={sentMessages.length > 0 ? String(sentMessages.length) : undefined}
  onClick={() => openFolder("sent")}
/>
            <Folder icon="trash" label="Posta eliminata" />
            <Folder
              active={selectedFolder === "archive"}
              icon="archive"
              label="Archivio"
              count={archiveCount > 0 ? String(archiveCount) : undefined}
              onClick={() => openFolder("archive")}
            />
            <Folder icon="document" label="Note" />
          </div>
        </aside>

        <section className="message-list">
          <div className="list-tabs">
            <span className="active">Evidenziata</span><span>Altra</span>
            <div /><Icon name="more" size={18} />
          </div>
          <div className="sort-row">
            <strong>Oggi</strong><span>Per data</span>
          </div>
          

{selectedFolder === "sent" ? (
  visibleSentConversations.map((conversation) => (
    <button
      className={`message-card ${
        selectedSentId === conversation.id ? "selected" : ""
      }`}
      key={conversation.id}
      onClick={() => {
        setSelectedId(null);
        setSelectedSentId(conversation.id);
        setReplying(false);
        setNotice("");
      }}
    >
      <span
        className="avatar"
        style={{ background: "#d7e8f5" }}
      >
        MC
      </span>

      <span className="message-copy">
        <span className="sender-line">
          <strong>A: {conversation.mail.sender}</strong>
          <time>
            {new Date(conversation.latest.timestamp).toLocaleTimeString(
              "it-IT",
              {
                hour: "2-digit",
                minute: "2-digit",
              }
            )}
          </time>
        </span>

        <span className="subject-line">
          RE: {conversation.mail.subject}
          {conversation.messages.length > 1 &&
            ` (${conversation.messages.length})`}
        </span>

        <span className="preview-line">
          {conversation.latest.text}
        </span>
      </span>
    </button>
  ))

) : (
  visibleMails.map((mail) => (
    <button
      className={`message-card ${
        readMailIds.has(mail.id) ? "" : "unread"
      } ${selectedId === mail.id ? "selected" : ""}`}
      key={mail.id}
      onClick={() => openMail(mail)}
    >
      <span
        className="avatar"
        style={{ background: mail.color }}
      >
        {mail.initials}
      </span>

      <span className="message-copy">
        <span className="sender-line">
          <strong>{mail.sender}</strong>
          <time>{mail.time}</time>
        </span>

        <span className="subject-line">
          {mail.subject}
        </span>

        <span className="preview-line">
          {mail.preview}
        </span>
      </span>
    </button>
  ))
)}

          {(selectedFolder === "sent"
  ? visibleSentConversations.length === 0
  : visibleMails.length === 0) && (
  <div className="no-search-results">
    {normalizedSearchQuery ? (
      <div className="empty-state-content">
        <img
          src="/empty-search.svg"
          alt=""
          className="empty-state-image"
        />
        <strong>Non è stato trovato nulla.</strong>
        <span>Prova con un'altra parola chiave.</span>
      </div>
    ) : (
      <div className="empty-state-content">
        <strong>Nessun messaggio in questa cartella</strong>
      </div>
    )}
  </div>
)}
        </section>

        
<main className="reading-pane">
  {selectedFolder === "sent" && selectedSent ? (
    <>
      <div className="subject-header">
        <h1>RE: {selectedSent.mail.subject}</h1>
      </div>

      <article className="mail-card">
        <header className="mail-meta">
          <span
            className="avatar large"
            style={{ background: "#d7e8f5" }}
          >
            MC
          </span>

          <div>
            <strong>Marco Conti</strong>
            <span>
              &lt;marco.conti@archiviomontesanto.example&gt;
            </span>
            <small>
              A: {selectedSent.mail.sender} &lt;{selectedSent.mail.address}&gt;
            </small>
          </div>
        </header>

        <div className="mail-body">
          <p className="muted-copy">
            Messaggio originale
          </p>

          
{selectedSent.mail.body(() =>
  selectedSent.mail.destination ? (
    <TrackedMailLink
      mail={selectedSent.mail}
      disabled={blockedMailIds.has(selectedSent.mail.id)}
      onClick={() => clickLink(selectedSent.mail)}
      onVerify={() => verifyLink(selectedSent.mail)}
    />
  ) : null
)}

        </div>
      </article>

      
<section
  className="conversation-thread"
  aria-label="Conversazione"
>
  {(conversations[selectedSent.mail.id] ?? []).map((turn) => (
    <div className="conversation-turn" key={turn.id}>

      <div className="conversation-message user-message">
        <strong>Tu</strong>
        <p>{turn.userText}</p>
      </div>

      <div className="conversation-message sender-message">
        <span
          className="avatar"
          style={{ background: selectedSent.mail.color }}
        >
          {selectedSent.mail.initials}
        </span>

        <div>
          <strong>{selectedSent.mail.sender}</strong>

          {turn.assistantText === null ? (
            <p className="typing-indicator" role="status">
              <span>Sta scrivendo</span>
              <span className="typing-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </p>
          ) : (
            <p>{turn.assistantText}</p>
          )}
          
{selectedSent.mail.id === "email_3" &&
  turn.responseNumber === 2 &&
  turn.assistantText && (
    <TrackedMailLink
      mail={selectedSent.mail}
      disabled={blockedMailIds.has(selectedSent.mail.id)}
      onClick={() => clickLink(selectedSent.mail)}
      onVerify={() => verifyLink(selectedSent.mail)}
    />
  )}

        </div>
      </div>

    </div>
  ))}
</section>

    </>
  ) : selected ? (

            <>
              <div className="subject-header">
                <h1>{selected.subject}</h1>
                <button aria-label="Aggiungi ai preferiti"><Icon name="star" size={18} /></button>
              </div>
              {notice && (
                <div className="neutral-notice">
                  <Icon name="info" size={16} /><span>{notice}</span>
                  <button onClick={() => setNotice("")}><Icon name="close" size={14} /></button>
                </div>
              )}
              <article className="mail-card">
                <header className="mail-meta">
                  <span className="avatar large" style={{ background: selected.color }}>{selected.initials}</span>
                  <div>
                    <strong>{selected.sender}</strong>
                    <span>&lt;{selected.address}&gt;</span>
                    <small>A: {selected.recipient ?? "marco.conti@archiviomontesanto.example"}</small>
                  </div>
                  <div className="mail-actions">
                    <button
                      disabled={selectedIsBlocked || selectedReplyLimitReached || loadingReplyFor === selected.id}
                      onClick={() => setReplying(true)}
                    ><Icon name="reply" size={16} /> Rispondi</button>
                    <button
                      disabled={selectedIsBlocked || selectedReplyLimitReached || loadingReplyFor === selected.id}
                      onClick={() => setReplying(true)}
                    ><Icon name="reply" size={16} /> Rispondi a tutti</button>
                    <button aria-label="Altre azioni"><Icon name="more" /></button>
                    <time>{selected.date}</time>
                  </div>
                </header>
                <div className="mail-body">
                  {selected.body(() => (
                    <TrackedMailLink
                      mail={selected}
                      disabled={selectedIsBlocked}
                      onClick={() => clickLink(selected)}
                      onVerify={() => verifyLink(selected)}
                    />
                  ))}
                </div>
              </article>

              {selectedConversation.length > 0 && (
                <section className="conversation-thread">
                  {selectedConversation.map((turn) => (
                    <div className="conversation-turn" key={turn.id}>
                      <div className="conversation-message user-message">
                        <strong>Tu</strong>
                        <p>{turn.userText}</p>
                      </div>
                      <div className="conversation-message sender-message">
                        <span
                          className="avatar"
                          style={{ background: selected.color }}
                        >
                          {selected.initials}
                        </span>
                        <div>
                          <strong>{selected.sender}</strong>
                          
                {turn.assistantText === null ? (
                  <p className="typing-indicator" role="status">
                    <span>Sta scrivendo</span>
                    <span className="typing-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                </span>
              </p>
            ) : (
              <p>{turn.assistantText}</p>
            )}

                          {selected.id === "email_3" &&
                            turn.responseNumber === 2 &&
                            turn.assistantText && (
                              <TrackedMailLink
                                mail={selected}
                                disabled={selectedIsBlocked}
                                onClick={() => clickLink(selected)}
                                onVerify={() => verifyLink(selected)}
                              />
                            )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {selectedReplyLimitReached &&
                    selectedConversation.every((turn) => turn.assistantText) && (
                      <div className="conversation-closed">
                        {selected.sender}: Ti aggiorno appena possibile
                      </div>
                    )}
                </section>
              )}

              {replying && !selectedIsBlocked ? (
                <section className="reply-composer">
                  <div className="composer-head">
                    <strong>Rispondi</strong>
                    <button onClick={() => setReplying(false)}><Icon name="close" size={17} /></button>
                  </div>
                  <div className="recipient">A: <strong>{selected.sender}</strong> &lt;{selected.address}&gt;</div>
                  <textarea
                    autoFocus
                    onChange={(event) => setReplyText(event.target.value)}
                    maxLength={500}
                    placeholder="Scrivi un messaggio"
                    value={replyText}
                  />
                  <div className="composer-footer">
                    <button className="send-button" disabled={!replyText.trim()} onClick={sendReply}>
                      Invia
                    </button>
                    <button onClick={() => setReplying(false)}><Icon name="trash" size={17} /></button>
                  </div>
                </section>
              ) : (
                <div className="quick-actions">
                  {!selectedIsBlocked && !selectedReplyLimitReached && (
                    <button
                      disabled={loadingReplyFor === selected.id}
                      onClick={() => setReplying(true)}
                    ><Icon name="reply" size={17} /> Rispondi</button>
                  )}
                  <button
  title="Contrassegna come attendibile e sposta in Archivio"
  onClick={() => decide("archivia", "messaggio_archiviato")}
>
  <Icon name="archive" size={17} /> Attendibile · Archivia
</button>
                  <button
  title="Nessun giudizio sull'attendibilità"
  onClick={() => decide("ignora", "messaggio_ignorato")}
>
  <Icon name="close" size={17} /> Ignora
</button>
                  <button
  title="Sposta in Posta indesiderata e blocca il mittente"
  onClick={() => setReportModal(true)}
>
  <Icon name="shield" size={17} /> Segnala come sospetto
</button>
                </div>
              )}
            </>
          ) : (
            <div className="empty-reading-pane">
  <div className="empty-state-content">
    <img
      src="/empty-mail.svg"
      alt=""
      className="empty-state-image"
    />
    <strong>Seleziona un elemento da leggere</strong>
    <span>Nessun elemento selezionato</span>
  </div>
</div>
          )}
        </main>
      </div>

      {actionNotice && (
        <div className="action-notice" role="status">
          <Icon name="info" size={16} />
          <span>{actionNotice}</span>
        </div>
      )}

      {renderFinishConfirmation()}
      
{calendarOpen && (
  <Modal onClose={() => setCalendarOpen(false)}>
    <div className="calendar-popup">
      <div className="calendar-popup-heading">
        <Icon name="calendar" size={23} />
        <div>
          <h2>Calendario</h2>
          <span>Archivio Storico Civico di Montesanto</span>
        </div>
      </div>

      <div className="calendar-event">
        <div className="calendar-date">
          <span>GIO</span>
          <strong>15</strong>
          <span>GEN</span>
        </div>

        <div className="calendar-event-info">
          <h3>Riunione di staff</h3>
          <p>Giovedì 15 gennaio 2026</p>
          <p>10:30 · Sala conferenze</p>
          <p>Si prega di confermare la propria presenza.</p>
        </div>
      </div>

      <p className="calendar-organizer">
        Organizzatore: Segreteria di Direzione
      </p>

      <div className="modal-actions">
        <button
          className="primary-button"
          onClick={() => setCalendarOpen(false)}
          type="button"
        >
          Chiudi
        </button>
      </div>
    </div>
  </Modal>
)}

      {reportModal && (
        <Modal onClose={() => setReportModal(false)}>
          <h2>Segnala come sospetto</h2>
          <p>
            La segnalazione di messaggi sospetti consente di proteggere le
            informazioni personali dell'utente e di altre persone.
          </p>
          <div className="modal-info">
            <Icon name="info" size={18} />
            <span>Questo mittente verrà bloccato in modo da interrompere la ricezione di messaggi di posta elettronica.</span>
          </div>
          <div className="modal-actions">
            <button className="primary-button" onClick={reportSuspicious}>Segnala e blocca</button>
            <button onClick={() => setReportModal(false)}>Annulla</button>
          </div>
        </Modal>
      )}

      {exitModal && (
        <Modal onClose={() => setExitModal(false)}>
          <h2>Uscire dalla simulazione?</h2>
          <p>
            I progressi di questa sessione verranno interrotti e non sarà
            calcolato né mostrato alcun punteggio.
          </p>
          <div className="modal-actions">
            <button
              className="danger-button"
              onClick={() => {
                logAction("esci", null, "simulazione_interrotta");
                setEmailPortale("");
                setEmailPerDebrief("");
                setScreen("exited");
                setExitModal(false);
              }}
            >
              Esci
            </button>
            <button onClick={() => setExitModal(false)}>Continua</button>
          </div>
        </Modal>
      )}
      {renderFullscreenControl()}
      <DebugView events={events} />
    </div>
  );
}

function DebugView({ events }: { events: EventLog[] }) {
  const [open, setOpen] = useState(false);
  const debugEnabled =
    new URLSearchParams(window.location.search).get("debug") === "1";

  if (!debugEnabled) return null;

  if (!open) {
    return (
      <button className="debug-trigger" onClick={() => setOpen(true)}>
        Debug
      </button>
    );
  }

  const result = calculateScore(events);

  return (
    <>
      <button className="debug-trigger active" onClick={() => setOpen(false)}>
        Debug
      </button>
      <aside className="debug-view">
        <button
          aria-label="Chiudi pannello debug"
          className="debug-close"
          onClick={() => setOpen(false)}
        >
          <Icon name="close" size={16} />
        </button>
        <h2>Debug simulazione</h2>
        <section>
          <h3>Registro eventi completo</h3>
          <div className="debug-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>tipo_azione</th>
                  <th>id_email</th>
                  <th>esito</th>
                  <th>dettaglio</th>
                  <th>origine</th>
                  <th>timestamp</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr><td colSpan={6}>Nessun evento registrato.</td></tr>
                ) : (
                  events.map((event, index) => (
                    <tr key={`${event.timestamp}-${index}`}>
                      <td>{event.tipo_azione}</td>
                      <td>{event.id_email ?? "—"}</td>
                      <td>{event.esito}</td>
                      <td>{event.dettaglio}</td>
                      <td>{event.origine}</td>
                      <td>{event.timestamp}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h3>Calcolo del punteggio</h3>
          <div className="debug-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Regola applicata</th>
                  <th>Punti</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => {
                  const mail = mails.find((item) => item.id === row.emailId);
                  return (
                    <tr key={row.emailId}>
                      <td>{row.emailId}<br /><small>{mail?.subject}</small></td>
                      <td>{row.rule}</td>
                      <td>{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2}>Totale</th>
                  <th>{result.total} / 100</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </aside>
    </>
  );
}

function actionLabel(action: ActionType) {
  const labels: Record<ActionType, string> = {
    inizio_sessione: "inizio sessione",
    apri_email: "apertura",
    verifica_link: "verifica del link",
    click_link: "apertura del link",
    rispondi: "risposta",
    segnala: "segnalazione",
    archivia: "archiviazione",
    ignora: "ignora",
    termina: "termine simulazione",
    esci: "uscita",
    credenziali_inserite: "inserimento credenziali",
    errore_tecnico: "errore tecnico",
    stop_attivato: "arresto richiesto",
  };
  return labels[action];
}

function TrackedMailLink({
  mail,
  disabled,
  onClick,
  onVerify,
}: {
  mail: Mail;
  disabled?: boolean;
  onClick: () => void;
  onVerify: () => void;
}) {
  const [showAddress, setShowAddress] = useState(false);
  const timer = useRef<number | null>(null);

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  useEffect(() => clearTimer, []);

  function startHover() {
    if (disabled) return;
    clearTimer();
    timer.current = window.setTimeout(() => {
      setShowAddress(true);
      onVerify();
      timer.current = null;
    }, 1000);
  }

  function endHover() {
    setShowAddress(false);
    clearTimer();
  }

  function showOnTouch() {
    if (disabled) return;
    const willShow = !showAddress;
    setShowAddress(willShow);
    if (willShow) onVerify();
  }

  return (
    <span className="tracked-link-row">
      <span
        aria-disabled={disabled}
        className={`tracked-mail-link${disabled ? " disabled" : ""}`}
        onClick={disabled ? undefined : onClick}
        onMouseEnter={startHover}
        onMouseLeave={endHover}
        role={disabled ? undefined : "link"}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(event) => {
          if (!disabled && event.key === "Enter") onClick();
        }}
      >
        {mail.displayLink}
        {showAddress && <span className="link-hover-card">{mail.destination}</span>}
      </span>
      <button
        className="touch-link-address"
        disabled={disabled}
        onClick={showOnTouch}
      >
        Mostra indirizzo
      </button>
    </span>
  );
}


function ToolbarButton({
  icon,
  label,
  title,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  title?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className="toolbar-button"
      title={title}
      disabled={disabled || !onClick}
      onClick={onClick}
    >
      <Icon name={icon} size={17} />
      {label}
      <Icon name="chevron" size={12} />
    </button>
  );
}


function Folder({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active?: boolean;
  icon: string;
  label: string;
  count?: string;
  onClick?: () => void;
}) {
  return (
    <button
      className={`folder ${active ? "active" : ""}`}
      disabled={!onClick}
      onClick={onClick}
    >
      <Icon name={icon} size={16} /><span>{label}</span>{count && <small>{count}</small>}
    </button>
  );
}


function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;

    // Porta il focus all'interno della finestra.
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) return;

      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), ' +
          'select:not([disabled]), textarea:not([disabled]), ' +
          '[tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.getClientRects().length > 0);

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (
          document.activeElement === first ||
          !modalRef.current.contains(document.activeElement)
        ) {
          event.preventDefault();
          last.focus();
        }
      } else if (
        document.activeElement === last ||
        !modalRef.current.contains(document.activeElement)
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);

      // Ripristina il focus sul controllo che aveva aperto il popup.
      if (previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Finestra di dialogo"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          className="modal-close"
          aria-label="Chiudi"
          onClick={onClose}
          type="button"
        >
          <Icon name="close" />
        </button>
        {children}
      </section>
    </div>
  );
}
