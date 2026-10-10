/**
 * js/leaderboard.js
 * Gerenciamento do Hall da Fama Top 10 Arcade (Persistência Híbrida: JSON + localStorage + Export)
 */

import { loadTop10Seed } from './data-loader.js';

const STORAGE_KEY = 'historia_tecnologia_top10';
const LAST_PLAYER_RECORD_KEY = 'historia_tecnologia_last_player_record';

/**
 * Retorna os dados do último recorde registrado pelo jogador
 * @returns {{nome: string, pontos: number, data: string}|null}
 */
export function getLastPlayerRecord() {
  const local = localStorage.getItem(LAST_PLAYER_RECORD_KEY);
  if (!local) return null;
  try {
    return JSON.parse(local);
  } catch (e) {
    return null;
  }
}

/**
 * Persiste a referência do último recorde registrado pelo jogador
 * @param {{nome: string, pontos: number, data: string}} record
 */
export function setLastPlayerRecord(record) {
  if (record) {
    localStorage.setItem(LAST_PLAYER_RECORD_KEY, JSON.stringify(record));
  } else {
    localStorage.removeItem(LAST_PLAYER_RECORD_KEY);
  }
}

/**
 * Obtém a lista atual do Top 10 (do localStorage ou da semente estática)
 * @returns {Promise<Array>} Lista ordenada do Top 10
 */
export async function getLeaderboard() {
  const local = localStorage.getItem(STORAGE_KEY);
  if (local) {
    try {
      return JSON.parse(local);
    } catch (e) {
      console.warn('Erro ao ler localStorage do Top 10, recarregando semente.', e);
    }
  }

  const seed = await loadTop10Seed();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

/**
 * Verifica se uma pontuação entra para o Top 10
 * @param {number} score Pontuação (0 a 10)
 * @returns {Promise<boolean>}
 */
export async function isEligibleForTop10(score) {
  if (score <= 0) return false;
  const list = await getLeaderboard();
  if (list.length < 10) return true;
  const lastScore = list[list.length - 1].pontos;
  return score > lastScore;
}

/**
 * Adiciona um novo recorde ao Top 10
 * @param {string} initials 3 letras maiúsculas
 * @param {number} score Pontuação (0 a 10)
 * @returns {Promise<Array>} Lista atualizada
 */
export async function addRecord(initials, score) {
  const sanitized = initials.toUpperCase().trim();
  if (!/^[A-Z]{3}$/.test(sanitized)) {
    throw new Error('Iniciais devem conter exatamente 3 letras maiúsculas.');
  }

  const list = await getLeaderboard();
  const entry = {
    pos: 0,
    nome: sanitized,
    pontos: score,
    data: new Date().toISOString()
  };

  setLastPlayerRecord(entry);
  list.push(entry);

  // Ordenação: 1º Pontos decrescente, 2º Data crescente (quem fez primeiro)
  list.sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    return new Date(a.data).getTime() - new Date(b.data).getTime();
  });

  // Limitar a 10 e recalcular posições
  const updated = list.slice(0, 10).map((item, index) => ({
    ...item,
    pos: index + 1
  }));

  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

/**
 * Exporta a lista atual do Top 10 como arquivo JSON para download
 */
export async function exportTop10JSON() {
  const list = await getLeaderboard();
  const jsonStr = JSON.stringify(list, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'top10.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
