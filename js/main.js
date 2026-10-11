/**
 * js/main.js
 * Ponto de entrada da SPA, inicialização dos módulos, controle de fluxo e eventos do jogo.
 */

import { loadHistoria, loadTop10Seed, getEligibleCategories, preloadImage, preloadBatch } from './data-loader.js';
import { getLeaderboard, isEligibleForTop10, addRecord, exportTop10JSON, getLastPlayerRecord } from './leaderboard.js';
import { playCardPick, playSuccess, playError, playFanfare, playGameOver, isAudioMuted, toggleAudioMute } from './audio.js';
import { CanvasRenderer } from './canvas-renderer.js';
import { InputHandler } from './input-handler.js';
import { GameEngine, GamePhase } from './game.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Inicializando História da Tecnologia - Vanilla SPA');

  const canvas = document.getElementById('gameCanvas');
  const renderer = new CanvasRenderer(canvas);
  renderer.start();

  const game = new GameEngine();

  // Elementos do DOM - HUD e Telas
  const screenLobby = document.getElementById('screenLobby');
  const btnStartGame = document.getElementById('btnStartGame');
  const btnLobbyHowToPlay = document.getElementById('btnLobbyHowToPlay');
  const btnLobbyLeaderboard = document.getElementById('btnLobbyLeaderboard');
  const btnLobbyDiagnostic = document.getElementById('btnLobbyDiagnostic');
  const modeButtonsList = document.getElementById('modeButtonsList');
  let selectedCategory = 'GERAL';
  const btnHome = document.getElementById('btnHome');

  // Modal: Como Jogar / Tutorial
  const modalHowToPlay = document.getElementById('modalHowToPlay');
  const btnHowToPlayClose = document.getElementById('btnHowToPlayClose');
  const btnHowToPlayOk = document.getElementById('btnHowToPlayOk');
  const tutorialDrawer = document.getElementById('tutorialDrawer');
  const btnToggleInstructions = document.getElementById('btnToggleInstructions');
  const btnDrawerClose = document.getElementById('btnDrawerClose');
  const toggleInstructionsIcon = document.getElementById('toggleInstructionsIcon');
  const toggleInstructionsText = document.getElementById('toggleInstructionsText');

  const hudModeBadge = document.getElementById('hudModeBadge');
  const hudScore = document.getElementById('hudScore');
  const hudProgressFill = document.getElementById('hudProgressFill');
  const instructionText = document.getElementById('instructionText');

  const btnAudioToggle = document.getElementById('btnAudioToggle');
  const btnHudHelp = document.getElementById('btnHudHelp');
  const btnHudLeaderboard = document.getElementById('btnHudLeaderboard');
  const btnLeaderboardOpen = document.getElementById('btnLeaderboardOpen');
  const btnLeaderboardClose = document.getElementById('btnLeaderboardClose');
  const btnLeaderboardOk = document.getElementById('btnLeaderboardOk');
  const btnExportTop10 = document.getElementById('btnExportTop10');
  const modalLeaderboard = document.getElementById('modalLeaderboard');
  const leaderboardBody = document.getElementById('leaderboardBody');

  const btnSmokeTestToggle = document.getElementById('btnSmokeTestToggle');
  const btnDiagnosticClose = document.getElementById('btnDiagnosticClose');
  const diagnosticPanel = document.getElementById('diagnosticPanel');
  const btnRunDiagnosticTests = document.getElementById('btnRunDiagnosticTests');
  const btnTestSound = document.getElementById('btnTestSound');

  // Modal: Detalhes do Card
  const modalCardDetail = document.getElementById('modalCardDetail');
  const btnDetailClose = document.getElementById('btnDetailClose');
  const btnDetailOk = document.getElementById('btnDetailOk');
  const detailImg = document.getElementById('detailImg');
  const detailYear = document.getElementById('detailYear');
  const detailHeading = document.getElementById('detailHeading');
  const detailCountry = document.getElementById('detailCountry');
  const detailCategory = document.getElementById('detailCategory');
  const detailSummary = document.getElementById('detailSummary');

  // Modal: Game Over / Resultado
  const modalGameOver = document.getElementById('modalGameOver');
  const resultScore = document.getElementById('resultScore');
  const resultRankTitle = document.getElementById('resultRankTitle');
  const resultEmojis = document.getElementById('resultEmojis');
  const resultExplanation = document.getElementById('resultExplanation');
  const btnShareResult = document.getElementById('btnShareResult');
  const btnPlayAgain = document.getElementById('btnPlayAgain');
  const btnGameOverLeaderboard = document.getElementById('btnGameOverLeaderboard');
  const btnGameOverHome = document.getElementById('btnGameOverHome');

  // Modal: Recorde Top 10
  const modalRecorde = document.getElementById('modalRecorde');
  const recordeScoreVal = document.getElementById('recordeScoreVal');
  const inputInitials = document.getElementById('inputInitials');
  const initialsError = document.getElementById('initialsError');
  const btnSalvarRecorde = document.getElementById('btnSalvarRecorde');
  const btnRecordeClose = document.getElementById('btnRecordeClose');
  const btnPularRecorde = document.getElementById('btnPularRecorde');

  // Toast
  const toastMessage = document.getElementById('toastMessage');
  const toastText = document.getElementById('toastText');

  function showToast(msg, duration = 3000) {
    toastText.textContent = msg;
    toastMessage.hidden = false;
    setTimeout(() => {
      toastMessage.hidden = true;
    }, duration);
  }

  // Controle de Áudio
  const updateAudioButton = () => {
    btnAudioToggle.textContent = isAudioMuted() ? '🔇' : '🔊';
  };
  updateAudioButton();
  btnAudioToggle.addEventListener('click', () => {
    toggleAudioMute();
    updateAudioButton();
  });

  // Gerenciamento Ativo de Orientação Paisagem no Celular
  const landscapeNotice = document.getElementById('landscapeNotice');
  const btnDismissLandscape = document.getElementById('btnDismissLandscape');
  let landscapeDismissed = false;

  function updateOrientationNotice() {
    if (!landscapeNotice) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isLandscape = w > h;

    // Detecta se o dispositivo possui toque
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    // Celular na horizontal: largura > altura, altura <= 650px e (é touch ou tela compacta <= 1050px)
    const isMobileLandscape = isLandscape && h <= 650 && (isTouch || w <= 1050);

    if (isMobileLandscape) {
      document.body.classList.add('is-mobile-landscape');
      if (!landscapeDismissed) {
        landscapeNotice.classList.remove('dismissed');
        landscapeNotice.style.display = 'flex';
      }
    } else {
      document.body.classList.remove('is-mobile-landscape');
      landscapeDismissed = false; // Reseta dispensa quando o jogador retorna o celular para vertical
      landscapeNotice.classList.remove('dismissed');
      landscapeNotice.style.display = 'none';
    }
  }

  if (btnDismissLandscape) {
    btnDismissLandscape.addEventListener('click', () => {
      landscapeDismissed = true;
      if (landscapeNotice) {
        landscapeNotice.classList.add('dismissed');
        landscapeNotice.style.display = 'none';
      }
    });
  }

  window.addEventListener('resize', updateOrientationNotice);
  window.addEventListener('orientationchange', updateOrientationNotice);
  if (window.screen && window.screen.orientation) {
    window.screen.orientation.addEventListener('change', updateOrientationNotice);
  }
  updateOrientationNotice();

  // Alternar diagnóstico
  if (btnSmokeTestToggle) {
    btnSmokeTestToggle.addEventListener('click', () => {
      diagnosticPanel.hidden = !diagnosticPanel.hidden;
    });
  }
  btnLobbyDiagnostic.addEventListener('click', () => {
    diagnosticPanel.hidden = false;
  });
  btnDiagnosticClose.addEventListener('click', () => {
    diagnosticPanel.hidden = true;
  });

  // Carregar e popular categorias elegíveis como botões no Lobby
  try {
    const historia = await loadHistoria();
    const eligibleCategories = getEligibleCategories(historia);

    if (modeButtonsList) {
      modeButtonsList.innerHTML = '';

      // Opção 1: Modo Geral (Todas as 174 cartas)
      const btnGeneral = document.createElement('button');
      btnGeneral.type = 'button';
      btnGeneral.className = 'mode-option-btn active';
      btnGeneral.innerHTML = `
        <span>🌟 Modo Geral</span>
        <span class="mode-badge-count">174 cartas</span>
      `;
      btnGeneral.addEventListener('click', () => {
        document.querySelectorAll('.mode-option-btn').forEach(b => b.classList.remove('active'));
        btnGeneral.classList.add('active');
        selectedCategory = 'GERAL';
        playCardPick();
      });
      modeButtonsList.appendChild(btnGeneral);

      // Categorias temáticas elegíveis (11+ anos distintos)
      eligibleCategories.forEach(cat => {
        const count = historia.filter(m => m.categoria === cat).length;
        const btnCat = document.createElement('button');
        btnCat.type = 'button';
        btnCat.className = 'mode-option-btn';
        btnCat.innerHTML = `
          <span>📂 ${cat}</span>
          <span class="mode-badge-count">${count} marcos</span>
        `;
        btnCat.addEventListener('click', () => {
          document.querySelectorAll('.mode-option-btn').forEach(b => b.classList.remove('active'));
          btnCat.classList.add('active');
          selectedCategory = cat;
          playCardPick();
        });
        modeButtonsList.appendChild(btnCat);
      });
    }
  } catch (err) {
    console.error('Erro ao carregar categorias para o lobby:', err);
  }

  // Atualizar badge da modalidade na HUD preservando estrutura compacta mobile
  function updateHudModeBadge(category = 'GERAL') {
    if (!hudModeBadge) return;
    hudModeBadge.innerHTML = `<span class="hud-mode-prefix">MODALIDADE: </span><span id="hudModeValue">${category.toUpperCase()}</span>`;
  }

  // Restauração de Sessão Ativa em caso de Refresh no Navegador
  async function restoreSessionIfAvailable() {
    const hasActiveSession = game.loadFromStorage();
    if (hasActiveSession && game.phase === GamePhase.JOGANDO && game.activeCard) {
      // Pré-carregar imagens dos cards em background
      const allCards = [...game.timeline, ...game.mysteryDeck];
      preloadBatch(allCards.map(c => c.imagem_local || (c.ref ? `data/images/${c.ref}.jpg` : ''))).catch(e => console.warn(e));

      // Ocultar Lobby e exibir jogo diretamente
      screenLobby.hidden = true;
      diagnosticPanel.hidden = true;
      modalGameOver.hidden = true;
      modalRecorde.hidden = true;
      modalCardDetail.hidden = true;
      modalHowToPlay.hidden = true;

      // Sincronizar HUD
      updateHudModeBadge(game.selectedCategory);
      hudScore.textContent = `${game.score} / 10`;
      const progressPct = Math.round(((game.currentRound - 1) / 10) * 100);
      hudProgressFill.style.width = `${progressPct}%`;
      if (instructionText) {
        instructionText.textContent = `🕹️ Jogada ${game.currentRound}/10: Arraste o próximo card misterioso!`;
      }

      // Sincronizar Canvas Renderer
      renderer.timelineCards = game.timeline;
      renderer.activeCard = game.activeCard;
      renderer.isCardSelected = false;

      // Centralizar a timeline suavemente no último marco jogado ou âncora
      const focusIndex = Math.max(0, game.timeline.length - 1);
      renderer.centerTimelineOnIndex(focusIndex);
      renderer.timelineOffsetX = renderer.targetTimelineOffsetX;

      console.log(`🎮 Partida restaurada após refresh! Rodada: ${game.currentRound}/10, Placar: ${game.score}`);
      return true;
    } else if (hasActiveSession && game.phase === GamePhase.FIM_DE_JOGO) {
      screenLobby.hidden = true;
      diagnosticPanel.hidden = true;
      modalRecorde.hidden = true;
      modalCardDetail.hidden = true;

      updateHudModeBadge(game.selectedCategory);
      hudScore.textContent = `${game.score} / 10`;
      hudProgressFill.style.width = '100%';

      renderer.timelineCards = game.timeline;
      renderer.activeCard = null;
      renderer.isCardSelected = false;
      renderer.centerTimelineOnIndex(Math.floor(game.timeline.length / 2));
      renderer.timelineOffsetX = renderer.targetTimelineOffsetX;

      finishGame(game.score);
      return true;
    }
    return false;
  }

  // Tenta restaurar partida persistida antes de renderizar tela inicial
  await restoreSessionIfAvailable();

  // Formatar ano amigável (a.C. / d.C.)
  function formatYear(year) {
    if (year < 0) return `${Math.abs(year)} a.C.`;
    return `${year}`;
  }

  // Títulos honoríficos para pontuação final
  function getRankTitle(score) {
    if (score === 10) return '👑 Lenda Absoluta da Computação';
    if (score >= 8) return '🚀 Mestre da Era Digital';
    if (score >= 6) return '💡 Explorador Tecnológico';
    if (score >= 4) return '📚 Aprendiz do Silício';
    return '🕹️ Entusiasta da História Tech';
  }

  // Abertura do Modal de Detalhe Histórico ao Clicar em Card Fixado
  function openCardDetail(card) {
    playCardPick();
    detailImg.src = card.imagem_local || (card.ref ? `data/images/${card.ref}.jpg` : '');
    detailYear.textContent = card.revelado ? `ANO: ${formatYear(card.ano)}` : 'ANO: ????';
    detailHeading.textContent = card.resumo || card.titulo || 'Marco Histórico';
    detailCountry.textContent = `📍 ${card.pais || 'Mundo'}`;
    detailCategory.textContent = `🏷️ ${card.categoria || 'Geral'}`;
    detailSummary.textContent = card.texto || card.resumo || 'Sem descrição cadastrada.';
    modalCardDetail.hidden = false;
  }

  btnDetailClose.addEventListener('click', () => { modalCardDetail.hidden = true; });
  btnDetailOk.addEventListener('click', () => { modalCardDetail.hidden = true; });

  // Iniciar uma nova partida
  async function startMatch(category = 'GERAL') {
    screenLobby.hidden = true;
    diagnosticPanel.hidden = true;
    modalGameOver.hidden = true;
    modalRecorde.hidden = true;
    modalCardDetail.hidden = true;
    modalLeaderboard.hidden = true;
    modalHowToPlay.hidden = true;

    updateHudModeBadge(category);
    hudScore.textContent = '0 / 10';
    hudProgressFill.style.width = '0%';
    if (instructionText) instructionText.textContent = '🕹️ Jogada 1/10: Arraste o card misterioso para a posição cronológica correta!';

    try {
      const match = await game.startNewGame(category);
      renderer.timelineCards = game.timeline;
      renderer.activeCard = game.activeCard;
      renderer.isCardSelected = false;

      // Centralizar o card selecionado inicial bem no meio da timeline
      renderer.centerTimelineOnIndex(0);
      renderer.timelineOffsetX = renderer.targetTimelineOffsetX;

      playCardPick();
    } catch (err) {
      console.error('Falha ao iniciar partida:', err);
      alert('Erro ao iniciar partida: ' + err.message);
      screenLobby.hidden = false;
    }
  }

  // Manipulador de Soltura do Card em uma Drop Zone (Mecânica Central)
  async function handleDropCard(zoneIndex, card, dropCoords) {
    renderer.isCardSelected = false;
    const result = game.submitCardDrop(zoneIndex);
    if (!result) return;

    const playedCard = result.playedCard;
    const isCorrect = result.isCorrect;

    // Atualizar HUD
    hudScore.textContent = `${result.newScore} / 10`;
    const progressPct = Math.round((result.round / 10) * 100);
    hudProgressFill.style.width = `${progressPct}%`;

    // Atualizar renderizador
    renderer.timelineCards = game.timeline;
    renderer.centerTimelineOnIndex(result.correctIndex);

    if (isCorrect) {
      playSuccess();
      renderer.addParticleBurst(dropCoords.x, dropCoords.y, '#73daca', 26);
      renderer.showFeedbackBanner(`🎉 ACERTOU! "${playedCard.resumo}" ocorreu em ${formatYear(playedCard.ano)}!`, 'success');
    } else {
      playError();
      renderer.addParticleBurst(dropCoords.x, dropCoords.y, '#ff9e64', 18);
      renderer.showFeedbackBanner(`❌ ERROU! "${playedCard.resumo}" ocorreu em ${formatYear(playedCard.ano)}!`, 'error');
    }

    // Avançar para próximo card ou finalizar
    if (!result.isGameOver) {
      renderer.activeCard = result.nextCard;
      if (instructionText) instructionText.textContent = `🕹️ Jogada ${result.round}/10: Arraste o próximo card misterioso!`;
    } else {
      renderer.activeCard = null;
      if (instructionText) instructionText.textContent = '🏁 Partida concluída! Analisando seu desempenho...';

      // Aguardar 1.6s para que o jogador veja a animação da régua completa
      setTimeout(async () => {
        await finishGame(result.newScore);
      }, 1600);
    }
  }

  // Finalização da Partida e Exibição de Resultados
  async function finishGame(finalScore) {
    resultScore.textContent = `${finalScore} / 10`;
    resultRankTitle.textContent = getRankTitle(finalScore);

    const emojis = game.history.map(h => h.isCorrect ? '🟩' : '🟥').join('');
    resultEmojis.textContent = emojis;

    const correctCount = game.history.filter(h => h.isCorrect).length;
    resultExplanation.textContent = `Você acertou ${correctCount} de 10 decisões temporais. Toda a linha do tempo com 11 marcos históricos está agora destravada e navegável!`;

    modalGameOver.hidden = false;

    // Verificar se pontuação é elegível para o Top 10 Arcade
    const eligible = await isEligibleForTop10(finalScore);
    if (eligible && !game.recordSubmitted) {
      playFanfare();
      setTimeout(() => {
        // Preserva modalGameOver visível como tela de base ("tela de baixo")
        recordeScoreVal.textContent = `${finalScore}/10`;
        inputInitials.value = '';
        initialsError.hidden = true;
        modalRecorde.hidden = false;
        inputInitials.focus();
      }, 1200);
    } else if (!eligible) {
      playGameOver();
    }
  }

  // Fechamento / Pular Entrada de Recorde
  function closeRecorde() {
    modalRecorde.hidden = true;
    game.recordSubmitted = true;
    game.saveToStorage();
    if (game.phase === GamePhase.FIM_DE_JOGO) {
      modalGameOver.hidden = false;
    }
  }

  if (btnRecordeClose) btnRecordeClose.addEventListener('click', closeRecorde);
  if (btnPularRecorde) btnPularRecorde.addEventListener('click', closeRecorde);

  // Salvar Recorde de 3 Letras
  btnSalvarRecorde.addEventListener('click', async () => {
    const val = inputInitials.value.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(val)) {
      initialsError.hidden = false;
      return;
    }
    initialsError.hidden = true;

    try {
      await addRecord(val, game.score);
      game.recordSubmitted = true;
      game.saveToStorage();
      modalRecorde.hidden = true;
      showToast(`🏆 Recorde gravado com sucesso para ${val}!`);
      await renderLeaderboard();
      // Exibe o Top 10 sobreposto preservando modalGameOver como tela de base ("tela de baixo")
      modalLeaderboard.hidden = false;
    } catch (err) {
      initialsError.textContent = err.message;
      initialsError.hidden = false;
    }
  });

  inputInitials.addEventListener('input', () => {
    inputInitials.value = inputInitials.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (inputInitials.value.length === 3) {
      initialsError.hidden = true;
    }
  });

  inputInitials.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnSalvarRecorde.click();
    }
  });

  // Compartilhar Resultado com Emojis (Estilo Wordle)
  btnShareResult.addEventListener('click', async () => {
    const shareText = game.getShareText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareText);
        showToast('📋 Resultado copiado para a área de transferência!');
      } else {
        prompt('Copie seu resultado:', shareText);
      }
    } catch (_) {
      prompt('Copie seu resultado:', shareText);
    }
  });

  // Configurar InputHandler com todos os callbacks
  new InputHandler(canvas, renderer, {
    onDropCard: (zoneIndex, card, dropCoords) => handleDropCard(zoneIndex, card, dropCoords),
    onCardClick: (card) => openCardDetail(card),
    onPickSound: () => playCardPick()
  });

  // Eventos de Ação do Lobby e Menus
  btnStartGame.addEventListener('click', () => {
    startMatch(selectedCategory);
  });

  btnPlayAgain.addEventListener('click', () => {
    modalGameOver.hidden = true;
    startMatch(game.selectedCategory || 'GERAL');
  });

  btnHome.addEventListener('click', () => {
    game.reset(); // Limpa estado interno da engine e remove partida do localStorage
    renderer.timelineCards = [];
    renderer.activeCard = null;
    renderer.feedbackBanner = null;
    renderer.isCardSelected = false;

    screenLobby.hidden = false;
    modalGameOver.hidden = true;
    modalCardDetail.hidden = true;
    diagnosticPanel.hidden = true;
    modalLeaderboard.hidden = true;
    modalRecorde.hidden = true;
    modalHowToPlay.hidden = true;
  });

  btnGameOverHome.addEventListener('click', () => {
    game.reset(); // Limpa estado interno da engine e remove partida do localStorage
    renderer.timelineCards = [];
    renderer.activeCard = null;
    renderer.feedbackBanner = null;
    renderer.isCardSelected = false;

    modalGameOver.hidden = true;
    screenLobby.hidden = false;
  });

  btnGameOverLeaderboard.addEventListener('click', async () => {
    // Não oculta modalGameOver; exibe o Top 10 sobreposto preservando o contexto de janelas
    await renderLeaderboard();
    modalLeaderboard.hidden = false;
  });

  btnLobbyLeaderboard.addEventListener('click', async () => {
    await renderLeaderboard();
    modalLeaderboard.hidden = false;
  });

  // Modal: Como Jogar / Tutorial
  function setInstructionsDrawerOpen(isOpen) {
    if (!tutorialDrawer) return;
    if (isOpen) {
      tutorialDrawer.classList.add('open');
      if (toggleInstructionsIcon) toggleInstructionsIcon.textContent = '▼';
      if (toggleInstructionsText) toggleInstructionsText.textContent = 'Ocultar instruções';
    } else {
      tutorialDrawer.classList.remove('open');
      if (toggleInstructionsIcon) toggleInstructionsIcon.textContent = '▲';
      if (toggleInstructionsText) toggleInstructionsText.textContent = 'Ler mais instruções';
    }
  }

  function toggleInstructionsDrawer() {
    if (!tutorialDrawer) return;
    const isCurrentlyOpen = tutorialDrawer.classList.contains('open');
    setInstructionsDrawerOpen(!isCurrentlyOpen);
  }

  function openHowToPlay() {
    playCardPick();
    setInstructionsDrawerOpen(false); // Sempre inicia focado na animação em destaque
    modalHowToPlay.hidden = false;
  }

  function closeHowToPlay() {
    setInstructionsDrawerOpen(false);
    modalHowToPlay.hidden = true;
  }

  if (btnLobbyHowToPlay) {
    btnLobbyHowToPlay.addEventListener('click', openHowToPlay);
  }
  if (btnHudHelp) {
    btnHudHelp.addEventListener('click', openHowToPlay);
  }
  if (btnHowToPlayClose) {
    btnHowToPlayClose.addEventListener('click', closeHowToPlay);
  }
  if (btnHowToPlayOk) {
    btnHowToPlayOk.addEventListener('click', closeHowToPlay);
  }
  if (btnToggleInstructions) {
    btnToggleInstructions.addEventListener('click', toggleInstructionsDrawer);
  }
  if (btnDrawerClose) {
    btnDrawerClose.addEventListener('click', () => setInstructionsDrawerOpen(false));
  }

  // Modal Hall da Fama
  async function renderLeaderboard() {
    const list = await getLeaderboard();
    const lastRecord = getLastPlayerRecord();

    // Determina qual linha destacar:
    // Se o jogador possui um recorde registrado no Top 10, destaca esse recorde.
    // Se ainda não tem nenhum recorde registrado (ou não consta no Top 10), destaca o primeiro colocado.
    let highlightIndex = -1;
    let isPlayerRecord = false;

    if (lastRecord) {
      const foundIdx = list.findIndex(
        (item) => item.data === lastRecord.data || (item.nome === lastRecord.nome && item.pontos === lastRecord.pontos && item.data === lastRecord.data)
      );
      if (foundIdx !== -1) {
        highlightIndex = foundIdx;
        isPlayerRecord = true;
      }
    }

    if (highlightIndex === -1 && list.length > 0) {
      highlightIndex = 0; // Primeiro colocado por padrão
      isPlayerRecord = false;
    }

    leaderboardBody.innerHTML = '';
    list.forEach((item, index) => {
      const tr = document.createElement('tr');
      const isHighlighted = index === highlightIndex;
      if (isHighlighted) {
        tr.classList.add('row-highlight');
      }

      const dateStr = item.data ? new Date(item.data).toLocaleDateString('pt-BR') : '-';
      const posClass = item.pos === 1 ? 'pos-1' : (item.pos === 2 ? 'pos-2' : (item.pos === 3 ? 'pos-3' : ''));

      let badgeHtml = '';
      if (isHighlighted) {
        if (isPlayerRecord) {
          badgeHtml = ' <span class="badge-record-star" title="Seu recorde">⭐</span>';
        } else {
          badgeHtml = ' <span class="badge-record-star" title="Atual líder do Hall da Fama">👑</span>';
        }
      }

      tr.innerHTML = `
        <td class="${posClass}">#${item.pos}</td>
        <td><strong>${item.nome}</strong>${badgeHtml}</td>
        <td>${item.pontos}/10 pts</td>
        <td>${dateStr}</td>
      `;
      leaderboardBody.appendChild(tr);
    });
  }

  function closeLeaderboard() {
    modalLeaderboard.hidden = true;
    // Se a partida foi concluída, assegura que a tela de resultado ("tela de baixo") permaneça visível
    if (game.phase === GamePhase.FIM_DE_JOGO) {
      modalGameOver.hidden = false;
    }
  }

  if (btnLeaderboardOpen) {
    btnLeaderboardOpen.addEventListener('click', async () => {
      await renderLeaderboard();
      modalLeaderboard.hidden = false;
    });
  }
  if (btnHudLeaderboard) {
    btnHudLeaderboard.addEventListener('click', async () => {
      playCardPick();
      await renderLeaderboard();
      modalLeaderboard.hidden = false;
    });
  }
  btnLeaderboardClose.addEventListener('click', closeLeaderboard);
  btnLeaderboardOk.addEventListener('click', closeLeaderboard);
  btnExportTop10.addEventListener('click', async () => {
    await exportTop10JSON();
    showToast('💾 Arquivo top10.json baixado!');
  });

  // Fechamento amigável por clique fora do card (backdrop) e tecla Escape
  modalLeaderboard.addEventListener('click', (e) => {
    if (e.target === modalLeaderboard) closeLeaderboard();
  });
  modalRecorde.addEventListener('click', (e) => {
    if (e.target === modalRecorde) closeRecorde();
  });
  modalHowToPlay.addEventListener('click', (e) => {
    if (e.target === modalHowToPlay) closeHowToPlay();
  });
  modalCardDetail.addEventListener('click', (e) => {
    if (e.target === modalCardDetail) modalCardDetail.hidden = true;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!modalCardDetail.hidden) {
        modalCardDetail.hidden = true;
      } else if (!modalHowToPlay.hidden) {
        closeHowToPlay();
      } else if (!modalLeaderboard.hidden) {
        closeLeaderboard();
      } else if (!modalRecorde.hidden) {
        closeRecorde();
      }
    }
  });

  // Teste de som retrô no diagnóstico
  btnTestSound.addEventListener('click', () => {
    playSuccess();
  });

  // Validação em Tempo Real do Ambiente no Cliente (Client-Side Smoke Test)
  async function runClientSmokeTest() {
    console.log('🧪 Executando bateria de testes do ambiente no navegador...');

    // 1. Historia JSON
    const badgeHistoria = document.getElementById('badgeHistoria');
    const diagHistoriaDesc = document.getElementById('diagHistoriaDesc');
    try {
      const historia = await loadHistoria();
      badgeHistoria.className = 'diag-status badge-ok';
      badgeHistoria.textContent = 'OK';
      diagHistoriaDesc.textContent = `${historia.length} marcos históricos carregados com sucesso!`;
      document.querySelector('#diagHistoria .diag-icon').textContent = '🟢';
    } catch (e) {
      badgeHistoria.className = 'diag-status badge-error';
      badgeHistoria.textContent = 'ERRO';
      diagHistoriaDesc.textContent = e.message;
      document.querySelector('#diagHistoria .diag-icon').textContent = '🔴';
    }

    // 2. Top10 JSON
    const badgeTop10 = document.getElementById('badgeTop10');
    const diagTop10Desc = document.getElementById('diagTop10Desc');
    try {
      const top10 = await loadTop10Seed();
      badgeTop10.className = 'diag-status badge-ok';
      badgeTop10.textContent = 'OK';
      diagTop10Desc.textContent = `${top10.length} recordes arcade carregados no ranking!`;
      document.querySelector('#diagTop10 .diag-icon').textContent = '🟢';
    } catch (e) {
      badgeTop10.className = 'diag-status badge-error';
      badgeTop10.textContent = 'ERRO';
      diagTop10Desc.textContent = e.message;
      document.querySelector('#diagTop10 .diag-icon').textContent = '🔴';
    }

    // 3. Imagem Amostra (abaco-2400.jpg)
    const badgeImage = document.getElementById('badgeImage');
    const diagImageDesc = document.getElementById('diagImageDesc');
    try {
      await preloadImage('data/images/abaco-2400.jpg');
      badgeImage.className = 'diag-status badge-ok';
      badgeImage.textContent = 'OK';
      diagImageDesc.textContent = 'Amostra de imagem 500x500 JPEG carregada com sucesso!';
      document.querySelector('#diagImageSample .diag-icon').textContent = '🟢';
    } catch (e) {
      badgeImage.className = 'diag-status badge-error';
      badgeImage.textContent = 'ERRO';
      diagImageDesc.textContent = e.message;
      document.querySelector('#diagImageSample .diag-icon').textContent = '🔴';
    }

    // 4. Web Audio API
    const badgeAudio = document.getElementById('badgeAudio');
    const diagAudioDesc = document.getElementById('diagAudioDesc');
    const hasAudio = !!(window.AudioContext || window.webkitAudioContext);
    if (hasAudio) {
      badgeAudio.className = 'diag-status badge-ok';
      badgeAudio.textContent = 'OK';
      diagAudioDesc.textContent = 'AudioContext detectado e operacional para síntese!';
      document.querySelector('#diagAudio .diag-icon').textContent = '🟢';
    } else {
      badgeAudio.className = 'diag-status badge-error';
      badgeAudio.textContent = 'NÃO SUPORTADO';
      document.querySelector('#diagAudio .diag-icon').textContent = '🔴';
    }

    // 5. Canvas 2D
    const badgeCanvas = document.getElementById('badgeCanvas');
    const diagCanvasDesc = document.getElementById('diagCanvasDesc');
    if (renderer.ctx) {
      badgeCanvas.className = 'diag-status badge-ok';
      badgeCanvas.textContent = 'OK';
      diagCanvasDesc.textContent = `Contexto 2D ativo (Device Pixel Ratio: ${renderer.dpr})!`;
      document.querySelector('#diagCanvas .diag-icon').textContent = '🟢';
    } else {
      badgeCanvas.className = 'diag-status badge-error';
      badgeCanvas.textContent = 'ERRO';
      document.querySelector('#diagCanvas .diag-icon').textContent = '🔴';
    }
  }

  btnRunDiagnosticTests.addEventListener('click', runClientSmokeTest);

  // Executar teste automaticamente no boot
  runClientSmokeTest();
});
