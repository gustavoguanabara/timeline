/**
 * js/timeline.js
 * Matemática da Linha do Tempo e Zonas de Soltura (Drop Zones)
 */

/**
 * Calcula as zonas de encaixe na régua com base nos cards fixados
 * @param {Array} timelineCards Cards já fixados em ordem cronológica
 * @returns {Array<Object>} Lista de Drop Zones com intervalos válidos
 */
export function calculateDropZones(timelineCards) {
  const zones = [];
  const n = timelineCards.length;

  if (n === 0) {
    zones.push({ index: 0, minYear: -Infinity, maxYear: Infinity });
    return zones;
  }

  // Zona 0: antes do primeiro card
  zones.push({
    index: 0,
    minYear: -Infinity,
    maxYear: Number(timelineCards[0].ano)
  });

  // Zonas intermediárias: entre C_{i-1} e C_i
  for (let i = 1; i < n; i++) {
    zones.push({
      index: i,
      minYear: Number(timelineCards[i - 1].ano),
      maxYear: Number(timelineCards[i].ano)
    });
  }

  // Zona final: após o último card
  zones.push({
    index: n,
    minYear: Number(timelineCards[n - 1].ano),
    maxYear: Infinity
  });

  return zones;
}

/**
 * Valida o palpite de posicionamento de um card misterioso
 * @param {Array} timelineCards Cards já fixados na linha do tempo
 * @param {number} chosenZoneIndex Índice da Drop Zone escolhida pelo jogador
 * @param {Object} card Card misterioso com a propriedade `ano`
 * @returns {Object} { isCorrect: boolean, correctIndex: number }
 */
export function validateGuess(timelineCards, chosenZoneIndex, card) {
  const year = Number(card.ano);
  const zones = calculateDropZones(timelineCards);

  // Determinar o índice correto onde o card deveria ser inserido
  let correctIndex = 0;
  while (correctIndex < timelineCards.length && Number(timelineCards[correctIndex].ano) < year) {
    correctIndex++;
  }

  const targetZone = zones[chosenZoneIndex] || { minYear: -Infinity, maxYear: Infinity };
  const isCorrect = (year > targetZone.minYear && year < targetZone.maxYear);

  return {
    isCorrect,
    correctIndex,
    chosenZone: targetZone,
    prevCard: chosenZoneIndex > 0 ? timelineCards[chosenZoneIndex - 1] : null,
    nextCard: chosenZoneIndex < timelineCards.length ? timelineCards[chosenZoneIndex] : null
  };
}

/**
 * Insere um card na posição cronológica correta
 * @param {Array} timelineCards 
 * @param {Object} card 
 * @returns {Array} Nova linha do tempo ordenada
 */
export function insertCardChronologically(timelineCards, card) {
  const next = [...timelineCards, card];
  next.sort((a, b) => Number(a.ano) - Number(b.ano));
  return next;
}
