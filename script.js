(() => {
  "use strict";

  const WORD_LISTS = [
    ["apple", "hammer", "river", "candle", "guitar", "rabbit"],
    ["bottle", "mountain", "spoon", "tiger", "window", "pencil"],
    ["orange", "ladder", "ocean", "button", "horse", "basket"]
  ];

  const STRATEGIES = [
    {
      id: "maintenance_rehearsal",
      name: "Maintenance rehearsal",
      instructions: "Repeat the word silently to yourself several times while it is on screen. Focus on keeping the word active in your short-term memory. Do not create a story or personal connection."
    },
    {
      id: "self_reference",
      name: "Self-reference",
      instructions: "Think about how the word relates to you personally. For example, ask yourself whether you own, use, enjoy, or have an experience involving the thing named. Make a brief personal connection."
    },
    {
      id: "mental_imagery",
      name: "Mental imagery",
      instructions: "Create a clear mental picture of the object named by the word. Imagine its shape, color, texture, or how it would look in a real setting."
    }
  ];

  // A small alias list handles common equivalent forms and spelling variants.
  const ALIASES = {
    apple: ["apples"], hammer: ["hammers"], river: ["rivers"], candle: ["candles"],
    guitar: ["guitars"], rabbit: ["rabbits"], bottle: ["bottles"], mountain: ["mountains"],
    spoon: ["spoons"], tiger: ["tigers"], window: ["windows"], pencil: ["pencils"],
    orange: ["oranges"], ladder: ["ladders"], ocean: ["oceans"], button: ["buttons"],
    horse: ["horses"], basket: ["baskets"]
  };

  const $ = (id) => document.getElementById(id);
  const screens = ["welcome-screen", "instruction-screen", "study-screen", "block-complete-screen",
    "distractor-screen", "recall-screen", "results-screen"];
  const show = (id) => screens.forEach(s => $(s).classList.toggle("hidden", s !== id));
  const shuffle = (items) => {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const nowISO = () => new Date().toISOString();
  const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const downloadCSV = (filename, headers, rows) => {
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };
  const normalize = (s) => s.toLowerCase().trim().replace(/^[^a-z]+|[^a-z]+$/g, "").replace(/[^a-z]/g, "");
  const editDistance = (a, b) => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0]; row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const old = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = old;
      }
    }
    return row[b.length];
  };

  let session = null;
  let blockIndex = 0;
  let wordIndex = 0;
  let wordTimer = null;
  let distractorInterval = null;
  let distractorTimeout = null;
  let distractorStart = null;
  let distractorEnd = null;

  function startSession() {
    const strategyOrder = shuffle(STRATEGIES);
    const listOrder = shuffle([0, 1, 2]);
    const start = nowISO();
    session = {
      participant_id: $("participant-id").value.trim(),
      session_id: (crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      started_at: start,
      ended_at: "",
      strategyOrder,
      blocks: strategyOrder.map((strategy, i) => ({
        strategy,
        listIndex: listOrder[i],
        words: WORD_LISTS[listOrder[i]],
        started_at: "",
        ended_at: ""
      })),
      startingNumber: 0,
      countingResponse: "",
      recallResponse: "",
      recallTokens: [],
      results: []
    };
    blockIndex = 0;
    show("instruction-screen");
    renderBlockInstructions();
  }

  function renderBlockInstructions() {
    const block = session.blocks[blockIndex];
    $("block-label").textContent = `BLOCK ${blockIndex + 1} OF 3`;
    $("strategy-title").textContent = block.strategy.name;
    $("strategy-instructions").textContent = block.strategy.instructions;
  }

  function beginBlock() {
    const block = session.blocks[blockIndex];
    block.started_at = nowISO();
    wordIndex = 0;
    show("study-screen");
    showWord();
  }

  function showWord() {
    const block = session.blocks[blockIndex];
    if (wordIndex >= block.words.length) {
      block.ended_at = nowISO();
      show("block-complete-screen");
      return;
    }
    $("study-progress").textContent = `Word ${wordIndex + 1} of 6`;
    $("study-strategy").textContent = block.strategy.name;
    $("study-progress-bar").style.width = `${(wordIndex / 6) * 100}%`;
    $("study-word").textContent = block.words[wordIndex];
    wordTimer = setTimeout(() => {
      wordIndex++;
      $("study-progress-bar").style.width = `${(wordIndex / 6) * 100}%`;
      showWord();
    }, 4000); // Four seconds per word; adjust here if required.
  }

  function nextBlock() {
    blockIndex++;
    if (blockIndex < 3) {
      show("instruction-screen");
      renderBlockInstructions();
    } else {
      beginDistractor();
    }
  }

  function beginDistractor() {
    session.startingNumber = Math.floor(100 + Math.random() * 900);
    $("starting-number").textContent = session.startingNumber;
    $("counting-response").value = "";
    $("counting-response").disabled = false;
    $("finish-distractor-button").disabled = false;
    let remaining = 30;
    $("distractor-timer").textContent = remaining;
    distractorStart = nowISO();
    show("distractor-screen");
    distractorInterval = setInterval(() => {
      remaining--;
      $("distractor-timer").textContent = remaining;
      if (remaining <= 0) finishDistractor();
    }, 1000);
    distractorTimeout = setTimeout(finishDistractor, 30000);
  }

  function finishDistractor() {
    if (!distractorStart || distractorEnd) return;
    clearInterval(distractorInterval);
    clearTimeout(distractorTimeout);
    distractorEnd = nowISO();
    session.distractor_started_at = distractorStart;
    session.distractor_ended_at = distractorEnd;
    session.countingResponse = $("counting-response").value.trim();
    $("counting-response").disabled = true;
    $("finish-distractor-button").disabled = true;
    show("recall-screen");
    $("recall-response").focus();
  }

  function tokenizeRecall(text) {
    return text.split(/[\s,;]+/).map(normalize).filter(Boolean);
  }

  function matchWord(token, word) {
    const candidates = [word, ...(ALIASES[word] || [])];
    return candidates.some(candidate => {
      const target = normalize(candidate);
      if (token === target) return true;
      // Permit one-character typo for words of at least five letters.
      return target.length >= 5 && Math.abs(token.length - target.length) <= 1 && editDistance(token, target) <= 1;
    });
  }

  function scoreRecall() {
    const tokens = tokenizeRecall($("recall-response").value);
    const allWords = session.blocks.flatMap(block => block.words);
    const usedTokens = new Set();
    const results = allWords.map(word => {
      const matchedIndex = tokens.findIndex((token, i) => !usedTokens.has(i) && matchWord(token, word));
      const recalled = matchedIndex !== -1;
      if (recalled) usedTokens.add(matchedIndex);
      const block = session.blocks.find(b => b.words.includes(word));
      return {
        word, strategy_id: block.strategy.id, strategy_name: block.strategy.name,
        list_number: block.listIndex + 1, recalled
      };
    });
    session.recallResponse = $("recall-response").value.trim();
    session.recallTokens = tokens;
    session.results = results;
    session.ended_at = nowISO();
    renderResults();
  }

  function renderResults() {
    const cards = $("score-cards");
    cards.innerHTML = "";
    session.blocks.forEach(block => {
      const n = session.results.filter(r => r.strategy_id === block.strategy.id && r.recalled).length;
      const card = document.createElement("div");
      card.className = "score-card";
      const strong = document.createElement("strong");
      strong.textContent = `${n} / 6`;
      const label = document.createElement("span");
      label.textContent = block.strategy.name;
      card.append(strong, label);
      cards.appendChild(card);
    });
    const total = session.results.filter(r => r.recalled).length;
    $("total-score").textContent = `Total recall: ${total} of 18 words (${Math.round(total / 18 * 100)}%).`;
    $("results-intro").textContent = `Session ${session.session_id.slice(0, 8)} is complete. Your score is based on the number of studied words correctly identified in your free-recall response.`;
    const details = $("scoring-details");
    details.innerHTML = "";
    session.blocks.forEach(block => {
      const list = document.createElement("ul");
      list.className = "detail-list";
      block.words.forEach(word => {
        const item = document.createElement("li");
        const result = session.results.find(r => r.word === word);
        item.textContent = `${word}: ${result.recalled ? "recalled" : "not recalled"}`;
        list.appendChild(item);
      });
      const heading = document.createElement("h3");
      heading.textContent = block.strategy.name;
      details.append(heading, list);
    });
    show("results-screen");
  }

  function downloadSummary() {
    const strategyScores = {};
    session.blocks.forEach(block => {
      strategyScores[block.strategy.id] = session.results.filter(r => r.strategy_id === block.strategy.id && r.recalled).length;
    });
    const headers = [
      "session_id", "participant_id", "started_at", "ended_at",
      "strategy_order", "maintenance_rehearsal_recalled", "self_reference_recalled",
      "mental_imagery_recalled", "total_recalled", "total_studied",
      "distractor_start_number", "distractor_response", "recall_response"
    ];
    const row = [
      session.session_id, session.participant_id, session.started_at, session.ended_at,
      session.blocks.map(b => b.strategy.id).join(" > "),
      strategyScores.maintenance_rehearsal, strategyScores.self_reference,
      strategyScores.mental_imagery, session.results.filter(r => r.recalled).length, 18,
      session.startingNumber, session.countingResponse, session.recallResponse
    ];
    downloadCSV(`memory_encoding_summary_${session.session_id.slice(0, 8)}.csv`, headers, [row]);
  }

  function downloadTrials() {
    const headers = [
      "session_id", "participant_id", "trial_number", "block_number", "strategy_id",
      "strategy_name", "word_list_number", "word", "word_presented_at_block_start",
      "block_started_at", "block_ended_at", "recalled"
    ];
    let trial = 0;
    const rows = [];
    session.blocks.forEach((block, bi) => block.words.forEach(word => {
      trial++;
      const result = session.results.find(r => r.word === word);
      rows.push([
        session.session_id, session.participant_id, trial, bi + 1, block.strategy.id,
        block.strategy.name, block.listIndex + 1, word, "yes",
        block.started_at, block.ended_at, result.recalled ? 1 : 0
      ]);
    }));
    downloadCSV(`memory_encoding_trials_${session.session_id.slice(0, 8)}.csv`, headers, rows);
  }

  $("start-button").addEventListener("click", startSession);
  $("begin-block-button").addEventListener("click", beginBlock);
  $("next-block-button").addEventListener("click", nextBlock);
  $("finish-distractor-button").addEventListener("click", finishDistractor);
  $("submit-recall-button").addEventListener("click", () => {
    if (!$("recall-response").value.trim()) {
      if (!confirm("You have not entered any words. Submit an empty recall response?")) return;
    }
    scoreRecall();
  });
  $("download-summary").addEventListener("click", downloadSummary);
  $("download-trials").addEventListener("click", downloadTrials);
  $("restart-button").addEventListener("click", () => {
    clearTimeout(wordTimer);
    clearInterval(distractorInterval);
    clearTimeout(distractorTimeout);
    distractorStart = null; distractorEnd = null;
    $("participant-id").value = "";
    $("recall-response").value = "";
    show("welcome-screen");
  });
})();