# Orario Galatina Normalizer

Piccolo progetto web statico per caricare un file `.xlsx` o `.csv` con una griglia di orario simile al modello allegato e produrre un nuovo file normalizzato.

## Funzioni

- Colonne standard `Lun1..Ven6`
- 19 righe classe configurabili
- Celle vuote evidenziate in viola
- Celle con due o più insegnanti evidenziate in rosso
- Export in `.xlsx` e `.csv`
- Il martedi viene sempre normalizzato nelle colonne `Mar1..Mar6`, anche quando il file sorgente usa date come intestazione
- Se il file contiene più tabelle, viene elaborata solo la prima: le tabelle successive sono riconosciute da una riga vuota seguita dalla ripetizione dell'intestazione.

## Avvio

Apri `index.html` in un browser moderno. Se il browser blocca l'accesso alle librerie CDN aprendo il file direttamente, avvia un piccolo server locale nella cartella del progetto e apri l'indirizzo indicato:

```powershell
py -m http.server 8000
```

Poi visita `http://localhost:8000`.
