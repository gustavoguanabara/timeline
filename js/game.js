/**
 * js/game.js
 * Máquina de Estados da Partida e Regras de Negócio (RN-01 a RN-13)
 */

import { loadHistoria, preloadBatch } from './data-loader.js';
import { calculateDropZones, validateGuess, insertCardChronologically } from './timeline.js';

export const GamePhase = {
  INICIAL: 'INICIAL',
  JOGANDO: 'JOGANDO',
  VALIDANDO_PALPITE: 'VALIDANDO_PALPITE',
  FIM_DE_JOGO: 'FIM_DE_JOGO'
};

export const STORAGE_KEY_GAME_STATE = 'historia_tech_active_game';

export class GameEngine {
  constructor() {
    this.phase = GamePhase.INICIAL;
    this.score = 0;
    this.currentRound = 0; // 1 a 10
    this.anchorCard = null;
    this.mysteryDeck = [];
    this.timeline = [];
    this.activeCard = null;
    this.selectedCategory = 'GERAL';
    this.history = [];
    this.recordSubmitted = false;
  }

  /**
   * Sorteia 11 marcos com anos estritamente distintos
   * @param {Array} pool Lista de marcos elegíveis
   * @returns {Array} 11 marcos com anos distintos
   */
  sampleDistinctCards(pool) {
    const byYear = new Map();
    // Agrupa por ano para evitar colisões
    for (const item of pool) {
      if (!byYear.has(item.ano)) byYear.set(item.ano, []);
      byYear.get(item.ano).push(item);
    }

    const availableYears = Array.from(byYear.keys());
    if (availableYears.length < 11) {
      throw new Error(`Pool insuficiente: apenas ${availableYears.length} anos distintos disponíveis (necessário 11).`);
    }

    // Embaralhar anos (Fisher-Yates)
    for (let i = availableYears.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableYears[i], availableYears[j]] = [availableYears[j], availableYears[i]];
    }

    const chosenYears = availableYears.slice(0, 11);
    const selectedCards = chosenYears.map(year => {
      const candidates = byYear.get(year);
      return candidates[Math.floor(Math.random() * candidates.length)];
    });

    return selectedCards;
  }

  /**
   * Inicia uma nova partida
   */
  async startNewGame(category = 'GERAL') {
    this.selectedCategory = category;
    const allMarcos = await loadHistoria();
    const pool = (category === 'GERAL') 
      ? allMarcos 
      : allMarcos.filter(m => m.categoria === category);

    const cards = this.sampleDistinctCards(pool);

    // Pré-carregar todas as 11 imagens em background
    preloadBatch(cards.map(c => c.imagem_local || (c.ref ? `data/images/${c.ref}.jpg` : ''))).catch(e => console.warn(e));

    // 1º card é a âncora inicial (revelado)
    this.anchorCard = { ...cards[0], revelado: true, statusAcerto: null };
    this.timeline = [this.anchorCard];

    // Os outros 10 são os cards misteriosos da partida
    this.mysteryDeck = cards.slice(1).map(c => ({ ...c, revelado: false, statusAcerto: null }));
    this.score = 0;
    this.currentRound = 1;
    this.activeCard = this.mysteryDeck[0];
    this.history = [];
    this.recordSubmitted = false;
    this.phase = GamePhase.JOGANDO;
    this.saveToStorage();

    return {
      anchorCard: this.anchorCard,
      activeCard: this.activeCard,
      round: this.currentRound,
      score: this.score,
      totalRounds: 10
    };
  }

  /**
   * Submete a jogada do card misterioso em uma drop zone
   */
  submitCardDrop(chosenZoneIndex) {
    if (this.phase !== GamePhase.JOGANDO || !this.activeCard) {
      return null;
    }

    const playedCard = this.activeCard;
    const result = validateGuess(this.timeline, chosenZoneIndex, playedCard);
    
    // Revelar o ano do card após a jogada
    playedCard.revelado = true;
    playedCard.statusAcerto = result.isCorrect;

    if (result.isCorrect) {
      this.score += 1;
    }

    // Registrar no histórico da partida
    this.history.push({
      round: this.currentRound,
      card: playedCard,
      chosenZoneIndex,
      isCorrect: result.isCorrect,
      correctIndex: result.correctIndex,
      year: playedCard.ano,
      prevCard: result.prevCard,
      nextCard: result.nextCard
    });

    // Inserir pedagogicamente na ordem cronológica correta
    this.timeline = insertCardChronologically(this.timeline, playedCard);

    const wasLastRound = this.currentRound >= 10;

    // Avançar rodada
    if (!wasLastRound) {
      this.currentRound += 1;
      this.activeCard = this.mysteryDeck[this.currentRound - 1];
    } else {
      this.activeCard = null;
      this.phase = GamePhase.FIM_DE_JOGO;
    }

    // Persistir estado atualizado após a jogada
    this.saveToStorage();

    return {
      isCorrect: result.isCorrect,
      correctIndex: result.correctIndex,
      playedCard,
      newScore: this.score,
      round: this.currentRound,
      isGameOver: wasLastRound,
      nextCard: this.activeCard,
      chosenZone: result.chosenZone,
      prevCard: result.prevCard,
      nextCardRef: result.nextCard
    };
  }

  /**
   * Persiste o estado da partida atual no localStorage
   */
  saveToStorage() {
    try {
      if (this.phase === GamePhase.INICIAL) {
        this.clearSavedState();
        return;
      }
      const state = {
        phase: this.phase,
        score: this.score,
        currentRound: this.currentRound,
        anchorCard: this.anchorCard,
        mysteryDeck: this.mysteryDeck,
        timeline: this.timeline,
        activeCard: this.activeCard,
        selectedCategory: this.selectedCategory,
        history: this.history,
        recordSubmitted: !!this.recordSubmitted,
        savedAt: Date.now()
      };
      localStorage.setItem(STORAGE_KEY_GAME_STATE, JSON.stringify(state));
    } catch (err) {
      console.warn('Não foi possível persistir o estado do jogo:', err);
    }
  }

  /**
   * Remove o estado salvo da partida do localStorage
   */
  clearSavedState() {
    try {
      localStorage.removeItem(STORAGE_KEY_GAME_STATE);
    } catch (err) {
      console.warn('Não foi possível remover o estado salvo:', err);
    }
  }

  /**
   * Restaura o estado da partida a partir do localStorage
   * @returns {boolean} true se recuperou com sucesso, false caso contrário
   */
  loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_GAME_STATE);
      if (!raw) return false;

      const state = JSON.parse(raw);
      if (!state || !state.timeline || !Array.isArray(state.timeline) || state.timeline.length === 0) {
        return false;
      }

      this.phase = state.phase || GamePhase.JOGANDO;
      this.score = Number(state.score) || 0;
      this.currentRound = Number(state.currentRound) || 1;
      this.anchorCard = state.anchorCard || null;
      this.mysteryDeck = Array.isArray(state.mysteryDeck) ? state.mysteryDeck : [];
      this.timeline = state.timeline;
      this.activeCard = state.activeCard || null;
      this.selectedCategory = state.selectedCategory || 'GERAL';
      this.history = Array.isArray(state.history) ? state.history : [];
      this.recordSubmitted = !!state.recordSubmitted;

      return true;
    } catch (err) {
      console.warn('Falha ao restaurar estado do jogo do localStorage:', err);
      return false;
    }
  }

  /**
   * Reseta a engine para o estado limpo inicial
   */
  reset() {
    this.phase = GamePhase.INICIAL;
    this.score = 0;
    this.currentRound = 0;
    this.anchorCard = null;
    this.mysteryDeck = [];
    this.timeline = [];
    this.activeCard = null;
    this.selectedCategory = 'GERAL';
    this.history = [];
    this.recordSubmitted = false;
    this.clearSavedState();
  }

  /**
   * Gera o texto no estilo Wordle para compartilhamento
   */
  getShareText() {
    const emojis = this.history.map(h => h.isCorrect ? '🟩' : '🟥').join('');
    const pct = Math.round((this.score / 10) * 100);
    return `🕹️ História da Tecnologia (${this.selectedCategory})\n` +
           `Pontuação: ${this.score}/10 acertos (${pct}%)\n` +
           `${emojis}\n` +
           `Desafie seus conhecimentos sobre a evolução da computação!`;
  }
}

