/**
 * js/canvas-renderer.js
 * Motor Gráfico no Canvas 2D com suporte a HiDPI (Retina), Pan Horizontal,
 * física de arraste do card misterioso, colisão com Drop Zones e partículas.
 */

import { getImage } from './data-loader.js';

export class CanvasRenderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.width = 0;
    this.height = 0;
    this.isRendering = false;

    // Estado do jogo e dados
    this.timelineCards = [];
    this.activeCard = null;
    this.hoveredTimelineCard = null;
    this.hoverDropZoneIndex = -1;

    // Detecção e perfil de dispositivo responsivo
    this.isMobile = false;

    // Dimensões dos cards na Linha do Tempo
    this.cardWidth = 120;
    this.cardHeight = 185;
    this.cardGap = 55;
    this.timelineMarginLeft = 60;
    this.timelineCenterY = 220;

    // Pan Horizontal da Linha do Tempo e Inércia (Swipe)
    this.timelineOffsetX = 0;
    this.targetTimelineOffsetX = 0;
    this.isDraggingTimeline = false;
    this.panStartX = 0;
    this.panStartOffsetX = 0;
    this.panMomentum = 0;

    // Dimensões do Card Ativo / Deck
    this.activeCardWidth = 175;
    this.activeCardHeight = 290;
    this.deckCenterY = 0;

    // Mecânica Híbrida: Seleção / Tap-to-Place
    this.isCardSelected = false;

    // Arraste do Card Ativo e Touch Lift Offset
    this.isDraggingCard = false;
    this.dragX = 0;
    this.dragY = 0;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.dragVelocityX = 0;
    this.lastPointerX = 0;
    this.dragPointerType = 'mouse';
    this.rawPointerX = 0;
    this.rawPointerY = 0;
    this.touchLiftOffset = 70; // Elevação vertical ao arrastar com o dedo

    // Animação de encaixe suave (lerp)
    this.animatingCard = null;

    // Partículas e Efeitos Visuais
    this.particles = [];
    this.feedbackBanner = null; // { text, type: 'success' | 'error', timer: 0 }

    // Callbacks
    this.onDropCard = null;
    this.onCardClick = null;
    this.onTimelineMove = null;
    this.onDropZoneHoverChange = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);

    this.ctx.resetTransform?.();
    this.ctx.scale(this.dpr, this.dpr);

    // Detecção dinâmica de perfil responsivo
    this.isMobile = (this.width < 640 || this.height < 750);

    if (this.isMobile) {
      // Escala proporcional adaptada para telas móveis
      this.cardWidth = 92;
      this.cardHeight = 142;
      this.cardGap = 36;
      this.activeCardWidth = 138;
      this.activeCardHeight = 228;
      this.timelineMarginLeft = 45;
      this.timelineCenterY = Math.max(105, Math.min(145, Math.round(this.height * 0.25)));
      this.deckCenterY = Math.round(this.height - this.activeCardHeight / 2 - 8);
    } else {
      // Dimensões elegantes de Desktop / Tablet
      this.cardWidth = 120;
      this.cardHeight = 185;
      this.cardGap = 55;
      this.activeCardWidth = 175;
      this.activeCardHeight = 290;
      this.timelineMarginLeft = 60;
      this.timelineCenterY = Math.max(130, Math.min(185, Math.round(this.height * 0.28)));
      this.deckCenterY = Math.round(this.height - this.activeCardHeight / 2 - 4);
    }

    if (this.timelineCards && this.timelineCards.length === 1) {
      this.centerTimelineOnIndex(0);
      this.timelineOffsetX = this.targetTimelineOffsetX;
    } else if (this.timelineCards && this.timelineCards.length > 1) {
      this.clampTimelineOffset();
    }
  }

  start() {
    if (this.isRendering) return;
    this.isRendering = true;
    const loop = () => {
      if (!this.isRendering) return;
      this.update();
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.isRendering = false;
  }

  /**
   * Atualização de interpolações físicas e animações por quadro
   */
  update() {
    // 0. Decaimento suave de inércia do swipe da linha do tempo (momentum)
    if (!this.isDraggingTimeline && Math.abs(this.panMomentum) > 0.2) {
      this.targetTimelineOffsetX += this.panMomentum;
      this.panMomentum *= 0.94; // Decaimento exponencial com atrito natural suave

      // Frear suavemente ao atingir os limites
      const bounds = this.getTimelineBounds();
      if (this.targetTimelineOffsetX > bounds.max) {
        this.targetTimelineOffsetX = bounds.max;
        this.panMomentum = 0;
      } else if (this.targetTimelineOffsetX < bounds.min) {
        this.targetTimelineOffsetX = bounds.min;
        this.panMomentum = 0;
      }

      // Sincronizar offset visual em tempo real a cada quadro de inércia
      this.timelineOffsetX = this.targetTimelineOffsetX;

      if (Math.abs(this.panMomentum) <= 0.2) {
        this.panMomentum = 0;
      }
    }

    // 1. Auto-scroll contínuo da Linha do Tempo ao arrastar o card secreto perto das bordas laterais
    if (this.isDraggingCard) {
      const edgeZone = Math.min(150, Math.max(70, this.width * 0.16));

      if (this.dragX < edgeZone) {
        // Canto esquerdo: rolar timeline para a esquerda (aumentar offset p/ trazer anos anteriores)
        const intensity = Math.min(1, Math.max(0, (edgeZone - this.dragX) / edgeZone));
        const speed = Math.round(intensity * 14 + 3);
        this.targetTimelineOffsetX += speed;
        this.timelineOffsetX = this.targetTimelineOffsetX;
        this.clampTimelineOffset();
        this.updateHoverDropZoneOnDrag();
      } else if (this.dragX > this.width - edgeZone) {
        // Canto direito: rolar timeline para a direita (diminuir offset p/ trazer anos posteriores)
        const intensity = Math.min(1, Math.max(0, (this.dragX - (this.width - edgeZone)) / edgeZone));
        const speed = Math.round(intensity * 14 + 3);
        this.targetTimelineOffsetX -= speed;
        this.timelineOffsetX = this.targetTimelineOffsetX;
        this.clampTimelineOffset();
        this.updateHoverDropZoneOnDrag();
      }
    }

    // 2. Interpolação suave em repouso (para snap-back elástico ou botões laterais ◀ ▶)
    if (!this.isDraggingTimeline && !this.isDraggingCard && Math.abs(this.panMomentum) <= 0.2) {
      const diff = this.targetTimelineOffsetX - this.timelineOffsetX;
      if (Math.abs(diff) > 0.2) {
        this.timelineOffsetX += diff * 0.18;
      } else {
        this.timelineOffsetX = this.targetTimelineOffsetX;
      }
    }

    // 3. Interpolação suave de card em animação de soltura/encaixe
    if (this.animatingCard) {
      const anim = this.animatingCard;
      anim.currentX += (anim.targetX - anim.currentX) * 0.22;
      anim.currentY += (anim.targetY - anim.currentY) * 0.22;
      anim.scale += (anim.targetScale - anim.scale) * 0.22;

      const dist = Math.hypot(anim.targetX - anim.currentX, anim.targetY - anim.currentY);
      if (dist < 1.5) {
        if (anim.onComplete) anim.onComplete();
        this.animatingCard = null;
      }
    }

    // 4. Decaimento do banner de feedback
    if (this.feedbackBanner) {
      this.feedbackBanner.timer -= 0.016;
      if (this.feedbackBanner.timer <= 0) {
        this.feedbackBanner = null;
      }
    }
  }

  /**
   * Recalcula a Drop Zone mais próxima durante o arraste do card ativo
   */
  updateHoverDropZoneOnDrag() {
    const numZones = this.timelineCards.length + 1;
    const timelineReach = this.timelineCenterY + this.cardHeight / 2 + (this.isMobile ? 120 : 80);
    let closestIndex = -1;
    let minDistance = this.isMobile ? 120 : 95; // Raio de magnetismo generoso

    if (this.dragY <= timelineReach) {
      for (let i = 0; i < numZones; i++) {
        const zx = this.getDropZoneX(i);
        const distZ = Math.abs(this.dragX - zx);
        if (distZ < minDistance) {
          minDistance = distZ;
          closestIndex = i;
        }
      }
    }

    const prevIndex = this.hoverDropZoneIndex;
    this.hoverDropZoneIndex = closestIndex;
    if (closestIndex !== -1 && closestIndex !== prevIndex) {
      if (this.onDropZoneHoverChange) {
        this.onDropZoneHoverChange(closestIndex);
      }
    }
  }

  /**
   * Ciclo principal de renderização gráfica 2D a 60 FPS
   */
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Fundo com gradiente e grade retrô
    this.renderBackground();

    // 2. Régua e Trilho da Linha do Tempo
    this.renderTimelineTrack();

    // 3. Drop Zones (Zonas de Encaixe)
    this.renderDropZones();

    // 4. Cards Posicionados na Linha do Tempo
    this.renderTimelineCards();

    // 5. Botões de navegação lateral (◀ ▶) da Linha do Tempo
    this.renderTimelineNavButtons();

    // 6. Deck Inferior e Card Misterioso Ativo
    this.renderActiveCardDeck();

    // 7. Card em animação de transição (se houver)
    this.renderAnimatingCard();

    // 8. Partículas comemorativas
    this.renderParticles();

    // 9. Banner de Feedback (Acerto / Erro pedagógico)
    this.renderFeedbackBanner();
  }

  renderBackground() {
    const ctx = this.ctx;
    const bgGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    bgGrad.addColorStop(0, '#0a0c13');
    bgGrad.addColorStop(0.5, '#101422');
    bgGrad.addColorStop(1, '#151928');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Grade sutil estilo arcade
    ctx.strokeStyle = 'rgba(59, 66, 97, 0.12)';
    ctx.lineWidth = 1;
    for (let y = 0; y < this.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
  }

  renderTimelineTrack() {
    const ctx = this.ctx;
    const centerY = this.timelineCenterY;

    // Linha de base contínua com efeito neon
    ctx.save();
    ctx.strokeStyle = '#3b4261';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(this.width, centerY);
    ctx.stroke();

    // Gradiente central na régua
    const railGrad = ctx.createLinearGradient(0, 0, this.width, 0);
    railGrad.addColorStop(0, 'rgba(115, 218, 202, 0.1)');
    railGrad.addColorStop(0.5, 'rgba(125, 207, 255, 0.5)');
    railGrad.addColorStop(1, 'rgba(115, 218, 202, 0.1)');
    ctx.strokeStyle = railGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(this.width, centerY);
    ctx.stroke();

    // Traços de medição com offset da rolagem
    ctx.strokeStyle = 'rgba(125, 207, 255, 0.25)';
    ctx.lineWidth = 1.5;
    const startX = (this.timelineOffsetX % 30);
    for (let x = startX - 30; x < this.width + 30; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, centerY - 6);
      ctx.lineTo(x, centerY + 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Obtém a posição X central de cada card na linha do tempo
   */
  getTimelineCardX(index) {
    return this.timelineOffsetX + this.timelineMarginLeft + index * (this.cardWidth + this.cardGap);
  }

  /**
   * Obtém a posição X central de cada Drop Zone
   */
  getDropZoneX(zoneIndex) {
    const totalCards = this.timelineCards.length;
    if (totalCards === 0) {
      return this.width / 2;
    }
    if (zoneIndex === 0) {
      // Antes do primeiro card
      return this.getTimelineCardX(0) - (this.cardWidth / 2 + this.cardGap / 2);
    }
    if (zoneIndex >= totalCards) {
      // Após o último card
      return this.getTimelineCardX(totalCards - 1) + (this.cardWidth / 2 + this.cardGap / 2);
    }
    // Entre card index-1 e index
    const xPrev = this.getTimelineCardX(zoneIndex - 1);
    const xNext = this.getTimelineCardX(zoneIndex);
    return (xPrev + xNext) / 2;
  }

  /**
   * Renderiza as Zonas de Soltura (Drop Zones) na linha do tempo
   */
  renderDropZones() {
    const ctx = this.ctx;
    const numZones = this.timelineCards.length + 1;
    const centerY = this.timelineCenterY;
    const isDragging = this.isDraggingCard;
    const isSelected = this.isCardSelected;
    const isInteractive = isDragging || isSelected;

    for (let i = 0; i < numZones; i++) {
      const zx = this.getDropZoneX(i);
      const isHovered = (this.hoverDropZoneIndex === i);

      // Não renderiza fora da tela para poupar processamento
      if (zx < -100 || zx > this.width + 100) continue;

      ctx.save();
      const zoneWidth = isHovered
        ? (this.isMobile ? 80 : 100)
        : (isInteractive ? (this.isMobile ? 42 : 50) : (this.isMobile ? 24 : 30));
      const zoneHeight = isHovered
        ? (this.isMobile ? 125 : 160)
        : (isInteractive ? (this.isMobile ? 105 : 135) : (this.isMobile ? 75 : 100));
      const zy = centerY - zoneHeight / 2;

      if (isHovered) {
        // Drop Zone ativa com efeito de pulso neon verde/ciano
        ctx.shadowColor = '#73daca';
        ctx.shadowBlur = 18;
        ctx.fillStyle = 'rgba(115, 218, 202, 0.2)';
        ctx.strokeStyle = '#73daca';
        ctx.lineWidth = 2.5;
        this.roundRect(ctx, zx - zoneWidth / 2, zy, zoneWidth, zoneHeight, 10, true, true);

        ctx.fillStyle = '#73daca';
        ctx.font = this.isMobile ? 'bold 24px monospace' : 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', zx, centerY);
      } else if (isInteractive) {
        // Drop Zone visível durante o arraste ou quando o card está selecionado (Tap-to-Place)
        ctx.fillStyle = isSelected ? 'rgba(125, 207, 255, 0.12)' : 'rgba(36, 41, 62, 0.6)';
        ctx.strokeStyle = isSelected ? 'rgba(125, 207, 255, 0.65)' : 'rgba(125, 207, 255, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        this.roundRect(ctx, zx - zoneWidth / 2, zy, zoneWidth, zoneHeight, 8, true, true);
        ctx.setLineDash([]);

        ctx.fillStyle = isSelected ? '#7dcfff' : 'rgba(125, 207, 255, 0.7)';
        ctx.font = this.isMobile ? 'bold 15px monospace' : 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', zx, centerY);
      } else {
        // Indicador discreto em repouso
        ctx.fillStyle = 'rgba(59, 66, 97, 0.4)';
        ctx.beginPath();
        ctx.arc(zx, centerY, this.isMobile ? 5 : 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /**
   * Renderiza os cards já posicionados na linha do tempo
   */
  renderTimelineCards() {
    const ctx = this.ctx;
    const centerY = this.timelineCenterY;

    for (let i = 0; i < this.timelineCards.length; i++) {
      const card = this.timelineCards[i];
      const cx = this.getTimelineCardX(i);
      const cy = centerY - this.cardHeight / 2;

      // Descartar cards fora da viewport
      if (cx + this.cardWidth / 2 < -50 || cx - this.cardWidth / 2 > this.width + 50) {
        continue;
      }

      const isHovered = (this.hoveredTimelineCard === card);
      this.drawCard(ctx, card, cx - this.cardWidth / 2, cy, this.cardWidth, this.cardHeight, {
        isHovered,
        showDetailsHint: true
      });
    }
  }

  /**
   * Desenha um card individual estilizado:
   * 1. Miniatura da imagem no topo (data/images/{ref}.jpg)
   * 2. Campo resumo logo abaixo da imagem (no meio)
   * 3. Local do ano na parte de baixo:
   *    - Cards da timeline: valor do ano (fundo VERDE se acertou, fundo VERMELHO se errou, azul se âncora)
   *    - Card em jogo no momento: "????",
   */
  drawCard(ctx, card, x, y, width, height, options = {}) {
    ctx.save();

    const isHovered = options.isHovered || false;
    const isActiveCard = options.isActiveCard || false;
    const isSelected = options.isSelected || false;
    const isAnchor = card.statusAcerto === null && card.revelado && !isActiveCard;
    const isCorrect = card.statusAcerto === true && !isActiveCard;
    const isError = card.statusAcerto === false && !isActiveCard;

    // Cores de contorno e brilho
    let strokeColor = '#3b4261';
    let glowColor = 'rgba(0, 0, 0, 0)';

    if (isActiveCard) {
      if (isSelected) {
        strokeColor = '#7dcfff';
        glowColor = 'rgba(125, 207, 255, 0.7)';
      } else {
        strokeColor = '#bb9af7';
        glowColor = 'rgba(187, 154, 247, 0.45)';
      }
    } else if (isAnchor) {
      strokeColor = '#7dcfff';
      glowColor = 'rgba(125, 207, 255, 0.4)';
    } else if (isCorrect) {
      strokeColor = '#22c55e';
      glowColor = 'rgba(34, 197, 94, 0.45)';
    } else if (isError) {
      strokeColor = '#ef4444';
      glowColor = 'rgba(239, 68, 68, 0.45)';
    }

    if (isHovered) {
      glowColor = '#7dcfff';
      y -= 4; // Elevação visual ao passar o mouse
    }

    // 1. Moldura externa e fundo escuro do card
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = isHovered ? 18 : (options.shadowBlur !== undefined ? options.shadowBlur : 8);
    ctx.fillStyle = '#161926';
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isHovered || isActiveCard ? 2.5 : 2;

    this.roundRect(ctx, x, y, width, height, this.isMobile ? 8 : 10, true, true);
    ctx.shadowBlur = 0; // reset de sombra para os elementos internos

    const pad = isActiveCard ? (this.isMobile ? 6 : 8) : (this.isMobile ? 5 : 6);
    const imgX = x + pad;
    const imgY = y + pad;
    const imgW = width - pad * 2;
    // O componente que contém a imagem deve ser quadrado (proporção 1:1)
    const imgH = imgW;

    // 2. Miniatura da Imagem logo no início do card (Topo) com crop central quadrado
    const imgSrc = card.imagem_local || (card.ref ? `data/images/${card.ref}.jpg` : null);
    const imgObj = getImage(imgSrc);

    if (imgObj && imgObj.complete && imgObj.naturalWidth > 0) {
      ctx.save();
      this.roundRect(ctx, imgX, imgY, imgW, imgH, this.isMobile ? 4 : 6, false, false);
      ctx.clip();

      // Crop quadrado bem no centro se a imagem original não for 1:1
      const nw = imgObj.naturalWidth;
      const nh = imgObj.naturalHeight;
      const size = Math.min(nw, nh);
      const sx = Math.round((nw - size) / 2);
      const sy = Math.round((nh - size) / 2);

      ctx.drawImage(imgObj, sx, sy, size, size, imgX, imgY, imgW, imgH);
      ctx.restore();
    } else {
      ctx.fillStyle = '#24293e';
      this.roundRect(ctx, imgX, imgY, imgW, imgH, this.isMobile ? 4 : 6, true, false);
      ctx.fillStyle = '#9aa5ce';
      ctx.font = isActiveCard ? (this.isMobile ? '22px sans-serif' : '28px sans-serif') : (this.isMobile ? '16px sans-serif' : '20px sans-serif');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isActiveCard ? '🕹️' : '🖼️', imgX + imgW / 2, imgY + imgH / 2);
    }

    // Moldura fina interna na foto
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, imgX, imgY, imgW, imgH, this.isMobile ? 4 : 6, false, true);

    // Lupa indicativa de detalhes sobre a foto ao passar o mouse em cards fixados da timeline
    if (isHovered && !isActiveCard) {
      ctx.save();
      // Overlay translúcido sobre a foto
      ctx.fillStyle = 'rgba(10, 12, 19, 0.45)';
      this.roundRect(ctx, imgX, imgY, imgW, imgH, this.isMobile ? 4 : 6, true, false);

      // Círculo central com brilho neon
      const badgeR = this.isMobile ? 13 : 16;
      const badgeCx = imgX + imgW / 2;
      const badgeCy = imgY + imgH / 2;
      ctx.shadowColor = 'rgba(125, 207, 255, 0.6)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(26, 30, 46, 0.85)';
      ctx.strokeStyle = '#7dcfff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Glifo da lupa centralizado
      ctx.font = this.isMobile ? '12px sans-serif' : '15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔍', badgeCx, badgeCy);
      ctx.restore();
    }

    if (isActiveCard) {
      // =========================================================================
      // CARD DA JOGADA ATUAL (ESCALA RESPONSIVA)
      // =========================================================================
      const yearH = this.isMobile ? 24 : 30;
      const yearY = y + height - yearH - pad;
      const yearW = width - pad * 2;

      // Caixa do ano com ????
      ctx.fillStyle = isSelected ? 'rgba(125, 207, 255, 0.25)' : 'rgba(187, 154, 247, 0.25)';
      ctx.strokeStyle = isSelected ? '#7dcfff' : '#bb9af7';
      ctx.lineWidth = 1.5;
      this.roundRect(ctx, imgX, yearY, yearW, yearH, 5, true, true);

      ctx.fillStyle = '#ffffff';
      ctx.font = this.isMobile ? 'bold 13px monospace' : 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('????', imgX + yearW / 2, yearY + yearH / 2);

      // Categoria acima da data com fonte pequena
      const catY = yearY - (this.isMobile ? 4 : 6);
      ctx.save();
      ctx.fillStyle = '#9aa5ce';
      ctx.font = this.isMobile ? '9px sans-serif' : '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const catText = this.truncateText(ctx, card.categoria || 'Geral', width - pad * 2 - 4);
      ctx.fillText(catText, x + width / 2, catY);
      ctx.restore();

      // Campo Resumo logo abaixo da imagem e acima da categoria
      const middleTop = imgY + imgH + (this.isMobile ? 3 : 5);
      const middleBottom = catY - (this.isMobile ? 10 : 14);
      const middleHeight = middleBottom - middleTop;
      const resumoText = card.resumo || card.titulo || '';

      this.drawMultilineText(
        ctx,
        resumoText,
        x + width / 2,
        middleTop,
        width - pad * 2 - 4,
        middleHeight,
        3,
        this.isMobile ? 'bold 11px sans-serif' : 'bold 12px sans-serif',
        '#ffffff'
      );
    } else {
      // =========================================================================
      // CARD DA TIMELINE (ESCALA RESPONSIVA, SEM CATEGORIA, ANO COLADO NO RESUMO)
      // =========================================================================
      const yearH = this.isMobile ? 18 : 22;
      const yearY = y + height - yearH - pad;
      const yearW = width - pad * 2;

      if (card.revelado) {
        const yearVal = Number(card.ano);
        const yearText = yearVal < 0 ? `${Math.abs(yearVal)} a.C.` : `${yearVal}`;

        if (isCorrect) {
          ctx.fillStyle = '#16a34a';
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 1.5;
          this.roundRect(ctx, imgX, yearY, yearW, yearH, 4, true, true);

          ctx.fillStyle = '#ffffff';
          ctx.font = this.isMobile ? 'bold 10px monospace' : 'bold 12px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(yearText, imgX + yearW / 2, yearY + yearH / 2);
        } else if (isError) {
          ctx.fillStyle = '#dc2626';
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.5;
          this.roundRect(ctx, imgX, yearY, yearW, yearH, 4, true, true);

          ctx.fillStyle = '#ffffff';
          ctx.font = this.isMobile ? 'bold 10px monospace' : 'bold 12px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(yearText, imgX + yearW / 2, yearY + yearH / 2);
        } else {
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5;
          this.roundRect(ctx, imgX, yearY, yearW, yearH, 4, true, true);

          ctx.fillStyle = '#7dcfff';
          ctx.font = this.isMobile ? 'bold 10px monospace' : 'bold 12px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(yearText, imgX + yearW / 2, yearY + yearH / 2);
        }
      }

      // Campo Resumo logo abaixo da imagem e colado acima do ano
      const middleTop = imgY + imgH + (this.isMobile ? 2 : 4);
      const middleBottom = yearY - (this.isMobile ? 2 : 4);
      const middleHeight = middleBottom - middleTop;
      const resumoText = card.resumo || card.titulo || '';

      this.drawMultilineText(
        ctx,
        resumoText,
        x + width / 2,
        middleTop,
        width - pad * 2 - 2,
        middleHeight,
        this.isMobile ? 2 : 3,
        this.isMobile ? 'bold 9px sans-serif' : 'bold 10px sans-serif',
        '#ffffff'
      );
    }

    ctx.restore();
  }

  /**
   * Renderiza os botões visuais de navegação lateral (◀ ▶) na linha do tempo
   */
  renderTimelineNavButtons() {
    const ctx = this.ctx;
    const centerY = this.timelineCenterY;
    const btnSize = this.isMobile ? 32 : 36;
    const margin = this.isMobile ? 8 : 12;

    // Botão Esquerda ◀
    ctx.save();
    ctx.fillStyle = 'rgba(26, 30, 46, 0.85)';
    ctx.strokeStyle = '#3b4261';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, margin, centerY - btnSize / 2, btnSize, btnSize, 18, true, true);
    ctx.fillStyle = '#7dcfff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◀', margin + btnSize / 2, centerY);

    // Botão Direita ▶ (idêntico ao da esquerda, com seta voltada para a direita)
    ctx.fillStyle = 'rgba(26, 30, 46, 0.85)';
    ctx.strokeStyle = '#3b4261';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, this.width - margin - btnSize, centerY - btnSize / 2, btnSize, btnSize, 18, true, true);
    ctx.fillStyle = '#7dcfff';
    ctx.fillText('▶', this.width - margin - btnSize / 2, centerY);
    ctx.restore();
  }

  /**
   * Renderiza o Deck Inferior e o Card Misterioso Ativo
   */
  renderActiveCardDeck() {
    const ctx = this.ctx;
    const card = this.activeCard;
    if (!card) return;

    const deckX = this.width / 2 - this.activeCardWidth / 2;
    const deckY = this.deckCenterY - this.activeCardHeight / 2;

    // Se o card NÃO está sendo arrastado, renderiza no repouso do deck
    if (!this.isDraggingCard && !this.animatingCard) {
      const isSelected = this.isCardSelected;

      // Moldura decorativa do slot no chão
      ctx.save();
      ctx.fillStyle = isSelected ? 'rgba(125, 207, 255, 0.12)' : 'rgba(26, 30, 46, 0.5)';
      ctx.strokeStyle = isSelected ? '#7dcfff' : 'rgba(187, 154, 247, 0.3)';
      ctx.lineWidth = isSelected ? 2.5 : 2;
      ctx.setLineDash([8, 6]);
      this.roundRect(ctx, deckX - 4, deckY - 4, this.activeCardWidth + 8, this.activeCardHeight + 8, 14, true, true);
      ctx.setLineDash([]);
      ctx.restore();

      // Desenha o card ativo com destaque
      this.drawCard(ctx, card, deckX, deckY, this.activeCardWidth, this.activeCardHeight, {
        isActiveCard: true,
        isSelected: isSelected,
        shadowBlur: isSelected ? 24 : 12
      });

      // Orientação visual discreta acima do card em repouso
      ctx.save();
      ctx.fillStyle = isSelected ? '#7dcfff' : '#73daca';
      ctx.font = this.isMobile ? 'bold 9px monospace' : 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const promptMsg = isSelected
        ? '👆 TOQUE EM UM SLOT [+] DA RÉGUA'
        : (this.isMobile ? '👆 ARRASTE OU TOQUE NO CARD' : '👆 ARRASTE O CARD ATÉ A RÉGUA');
      ctx.fillText(promptMsg, this.width / 2, deckY - 6);
      ctx.restore();
    } else if (this.isDraggingCard) {
      // Slot pontilhado indicando origem
      ctx.save();
      ctx.strokeStyle = 'rgba(59, 66, 97, 0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      this.roundRect(ctx, deckX, deckY, this.activeCardWidth, this.activeCardHeight, 10, false, true);
      ctx.setLineDash([]);
      ctx.restore();

      // Indicador visual na posição real do dedo se touch (Lift Offset)
      if (this.dragPointerType === 'touch' && this.rawPointerY > this.dragY) {
        ctx.save();
        // Raio/feixe sutil conectando o ponto do dedo à base do card
        ctx.strokeStyle = 'rgba(115, 218, 202, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(this.rawPointerX, this.rawPointerY);
        ctx.lineTo(this.dragX, this.dragY + (this.activeCardHeight * 1.04) / 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Ponto de luz sob a ponta do dedo
        ctx.fillStyle = 'rgba(115, 218, 202, 0.45)';
        ctx.shadowColor = '#73daca';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(this.rawPointerX, this.rawPointerY, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Card ativo seguindo com elevação e tilt físico
      const dragW = this.activeCardWidth * 1.04;
      const dragH = this.activeCardHeight * 1.04;
      const tilt = Math.max(-0.15, Math.min(0.15, this.dragVelocityX * 0.015));

      ctx.save();
      ctx.translate(this.dragX, this.dragY);
      ctx.rotate(tilt);
      this.drawCard(ctx, card, -dragW / 2, -dragH / 2, dragW, dragH, {
        isActiveCard: true,
        shadowBlur: 25
      });
      ctx.restore();
    }
  }

  /**
   * Desenha o Card Ativo do Deck em tamanho maior com detalhes do fato
   */
  drawActiveDeckCard(ctx, card, x, y, width, height, shadowElevation = 10) {
    this.drawCard(ctx, card, x, y, width, height, {
      isActiveCard: true,
      shadowBlur: shadowElevation
    });
  }

  /**
   * Renderiza card em transição animada de encaixe
   */
  renderAnimatingCard() {
    if (!this.animatingCard) return;
    const ctx = this.ctx;
    const anim = this.animatingCard;
    const card = anim.card;
    const w = this.cardWidth * anim.scale;
    const h = this.cardHeight * anim.scale;
    const x = anim.currentX - w / 2;
    const y = anim.currentY - h / 2;

    this.drawCard(ctx, card, x, y, w, h, { isHovered: false });
  }

  /**
   * Dispara animação de encaixe suave (lerp)
   */
  animateCardDrop(card, startX, startY, targetX, targetY, onComplete) {
    this.animatingCard = {
      card,
      currentX: startX,
      currentY: startY,
      targetX,
      targetY,
      scale: 1.1,
      targetScale: 1.0,
      onComplete
    };
  }

  /**
   * Partículas e efeitos visuais
   */
  addParticleBurst(x, y, color = '#73daca', count = 18) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        color,
        radius: Math.random() * 3 + 2
      });
    }
  }

  renderParticles() {
    const ctx = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.alpha -= 0.025;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Banner pedagógico flutuante
   */
  showFeedbackBanner(text, type = 'success', durationSeconds = 3.5) {
    this.feedbackBanner = {
      text,
      type,
      timer: durationSeconds
    };
  }

  renderFeedbackBanner() {
    if (!this.feedbackBanner) return;
    const ctx = this.ctx;
    const fb = this.feedbackBanner;
    const isSuccess = fb.type === 'success';

    ctx.save();
    ctx.font = this.isMobile ? 'bold 11px sans-serif' : 'bold 13px sans-serif';

    const text = fb.text || '';
    // Limite máximo de largura suportado pela tela
    const maxAvailableW = Math.max(260, this.width - 24);
    const maxTextW = maxAvailableW - (this.isMobile ? 36 : 48);
    // Garante que o texto caiba perfeitamente no balão sem vazar
    const textToDraw = this.truncateText(ctx, text, maxTextW);
    const measuredW = ctx.measureText(textToDraw).width;

    const bannerW = Math.max(260, Math.min(maxAvailableW, Math.round(measuredW + (this.isMobile ? 36 : 48))));
    const bannerH = this.isMobile ? 34 : 38;
    const bannerX = Math.round(this.width / 2 - bannerW / 2);

    // Posicionar no centro geométrico do vão livre entre a timeline e o deck inferior
    const timelineBottom = this.timelineCenterY + this.cardHeight / 2;
    const deckTop = this.height - this.activeCardHeight - (this.isMobile ? 8 : 4);
    const middleGapY = (timelineBottom + deckTop) / 2;
    const bannerY = Math.round(
      Math.max(timelineBottom + 6, Math.min(deckTop - bannerH - 6, middleGapY - bannerH / 2))
    );

    // Cores e brilho do balão
    ctx.shadowColor = isSuccess ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.45)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = isSuccess ? '#15803d' : '#b91c1c';
    ctx.strokeStyle = isSuccess ? '#4ade80' : '#f87171';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, bannerX, bannerY, bannerW, bannerH, 8, true, true);
    ctx.shadowBlur = 0;

    // Mesma centralização exata para sucesso e erro
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(textToDraw, this.width / 2, bannerY + bannerH / 2);

    ctx.restore();
  }

  /**
   * Move a linha do tempo suavemente para centralizar exatamente em determinado card
   */
  centerTimelineOnIndex(index) {
    const cardX = this.timelineMarginLeft + index * (this.cardWidth + this.cardGap);
    this.targetTimelineOffsetX = (this.width / 2) - cardX;
    this.clampTimelineOffset();
  }

  shiftTimeline(deltaX) {
    this.panMomentum = 0;
    this.targetTimelineOffsetX += deltaX;
    this.clampTimelineOffset();
  }

  getTimelineBounds() {
    const n = Math.max(1, this.timelineCards ? this.timelineCards.length : 1);
    const totalSpan = (n - 1) * (this.cardWidth + this.cardGap);

    const margin = this.isMobile ? 120 : 180;
    const maxOffset = (this.width / 2) - this.timelineMarginLeft + margin;
    const minOffset = (this.width / 2) - (this.timelineMarginLeft + totalSpan) - margin;

    return {
      min: Math.min(minOffset, maxOffset),
      max: Math.max(minOffset, maxOffset)
    };
  }

  clampTimelineOffset() {
    const bounds = this.getTimelineBounds();
    this.targetTimelineOffsetX = Math.max(bounds.min, Math.min(bounds.max, this.targetTimelineOffsetX));
  }

  /**
   * Utilitário para retângulos com cantos arredondados
   */
  roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  /**
   * Trunca texto com reticências se ultrapassar a largura máxima
   */
  truncateText(ctx, text, maxWidth) {
    if (!text) return '';
    if (ctx.measureText(text).width <= maxWidth) return text;
    let truncated = text;
    while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + '…';
  }

  /**
   * Desenha texto com quebra inteligente de linha por palavras, centralizado na área delimitada
   */
  drawMultilineText(ctx, text, centerX, topY, maxWidth, maxHeight, maxLines = 3, font = 'bold 11px sans-serif', color = '#ffffff') {
    if (!text) return;
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const words = String(text).split(' ');
    const lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
        if (lines.length >= maxLines - 1) {
          const remaining = words.slice(i).join(' ');
          currentLine = this.truncateText(ctx, remaining, maxWidth);
          break;
        }
      }
    }
    if (currentLine && lines.length < maxLines) {
      lines.push(currentLine);
    }

    const fontSizeMatch = font.match(/(\d+)px/);
    const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1], 10) : 11;
    const lineHeight = Math.round(fontSize * 1.3);
    const totalTextHeight = lines.length * lineHeight;
    const startY = Math.max(topY, topY + Math.max(0, maxHeight - totalTextHeight) / 2);

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], centerX, startY + i * lineHeight);
    }

    ctx.restore();
  }
}
