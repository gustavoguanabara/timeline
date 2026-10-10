/**
 * js/input-handler.js
 * Captura unificada de interações (Mouse, Touch e Pen) via Pointer Events
 * Suporta mecânica híbrida:
 *   1. Arraste com o dedo com elevação (Lift Offset) para não cobrir o card nem a Drop Zone.
 *   2. Modo Toque Direto (Tap-to-Place): Toque no card do deck + Toque na Drop Zone [+].
 *   3. Swipe com inércia (momentum scroll) na Linha do Tempo.
 *   4. Detecção tolerante de toque em cards fixados para abrir curiosidades históricas.
 */

import { triggerHaptic } from './audio.js';

export class InputHandler {
  constructor(canvasElement, renderer, options = {}) {
    this.canvas = canvasElement;
    this.renderer = renderer;
    this.options = options;

    this.isPointerDown = false;
    this.interactionType = null; // 'DECK_CARD' | 'DRAG_CARD' | 'PAN_TIMELINE' | 'NAV_BTN' | 'NONE'
    this.startCoords = { x: 0, y: 0 };
    this.lastPointerX = 0;
    this.pointerVelocityX = 0;
    this.lastMoveTime = 0;
    this.hasMovedSignificantly = false;
    this.clickedTimelineCard = null;
    this.pointerType = 'mouse';

    // Conectar callback de vibração sutil ao alinhar com uma Drop Zone
    this.renderer.onDropZoneHoverChange = (zoneIndex) => {
      if (zoneIndex >= 0) {
        triggerHaptic(12);
      }
    };

    this.bindEvents();
  }

  getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const scaleX = (this.canvas.width / rect.width) / dpr;
    const scaleY = (this.canvas.height / rect.height) / dpr;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));

    // Roda do mouse para rolagem lateral da linha do tempo
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY)) ? e.deltaX : e.deltaY;
      this.renderer.shiftTimeline(-delta * 0.8);
    }, { passive: false });
  }

  onPointerDown(e) {
    this.isPointerDown = true;
    this.hasMovedSignificantly = false;
    this.pointerType = e.pointerType || 'mouse';
    this.lastMoveTime = Date.now();
    this.pointerVelocityX = 0;

    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch (_) {}

    const coords = this.getCanvasCoords(e);
    this.startCoords = { ...coords };
    this.lastPointerX = coords.x;
    const r = this.renderer;
    r.dragPointerType = this.pointerType;
    r.rawPointerX = coords.x;
    r.rawPointerY = coords.y;

    // 1. Verificar clique nos botões de navegação lateral (◀ ▶) com área de toque ampliada
    const centerY = r.timelineCenterY;
    const btnSize = r.isMobile ? 32 : 36;
    const hitAreaH = 46;
    const hitAreaW = r.isMobile ? 46 : 40;
    const margin = r.isMobile ? 8 : 12;

    // Botão Esquerda ◀
    if (coords.x >= 0 && coords.x <= margin + btnSize + (hitAreaW - btnSize) &&
        coords.y >= centerY - hitAreaH / 2 && coords.y <= centerY + hitAreaH / 2) {
      r.shiftTimeline(r.isMobile ? 180 : 220);
      triggerHaptic(15);
      if (this.options.onPickSound) this.options.onPickSound();
      this.interactionType = 'NAV_BTN';
      return;
    }

    // Botão Direita ▶
    if (coords.x >= r.width - margin - btnSize - (hitAreaW - btnSize) && coords.x <= r.width &&
        coords.y >= centerY - hitAreaH / 2 && coords.y <= centerY + hitAreaH / 2) {
      r.shiftTimeline(r.isMobile ? -180 : -220);
      triggerHaptic(15);
      if (this.options.onPickSound) this.options.onPickSound();
      this.interactionType = 'NAV_BTN';
      return;
    }

    // 2. Se o Card já está selecionado (Tap-to-Place ativo), verificar se tocou em uma Drop Zone
    if (r.isCardSelected && r.activeCard && !r.animatingCard) {
      const timelineTop = r.timelineCenterY - r.cardHeight / 2 - (r.isMobile ? 50 : 35);
      const timelineBottom = r.timelineCenterY + r.cardHeight / 2 + (r.isMobile ? 80 : 60);

      if (coords.y >= timelineTop && coords.y <= timelineBottom) {
        const numZones = r.timelineCards.length + 1;
        let closestZone = -1;
        let minDist = r.isMobile ? 70 : 80;

        for (let i = 0; i < numZones; i++) {
          const zx = r.getDropZoneX(i);
          const dist = Math.abs(coords.x - zx);
          if (dist < minDist) {
            minDist = dist;
            closestZone = i;
          }
        }

        if (closestZone >= 0) {
          // Confirmar soltura via Toque Direto!
          r.isCardSelected = false;
          triggerHaptic(20);
          const targetX = r.getDropZoneX(closestZone);
          const targetY = r.timelineCenterY;

          r.animateCardDrop(r.activeCard, r.width / 2, r.deckCenterY, targetX, targetY, () => {
            if (this.options.onDropCard) {
              this.options.onDropCard(closestZone, r.activeCard, { x: targetX, y: targetY });
            }
          });
          this.interactionType = 'TAP_DROP';
          return;
        }
      }
    }

    // 3. Verificar se tocou no Card Misterioso Ativo no Deck Inferior
    if (r.activeCard && !r.animatingCard) {
      const deckX = r.width / 2 - r.activeCardWidth / 2;
      const deckY = r.deckCenterY - r.activeCardHeight / 2;
      const hitMargin = r.isMobile ? 12 : 8;

      if (coords.x >= deckX - hitMargin && coords.x <= deckX + r.activeCardWidth + hitMargin &&
          coords.y >= deckY - hitMargin && coords.y <= deckY + r.activeCardHeight + hitMargin) {
        this.interactionType = 'DECK_CARD';
        return;
      }
    }

    // 4. Verificar se tocou em algum card posicionado na Linha do Tempo (para abrir detalhes)
    this.clickedTimelineCard = null;
    for (let i = 0; i < r.timelineCards.length; i++) {
      const card = r.timelineCards[i];
      const cx = r.getTimelineCardX(i);
      const cy = r.timelineCenterY - r.cardHeight / 2;
      if (coords.x >= cx - r.cardWidth / 2 && coords.x <= cx + r.cardWidth / 2 &&
          coords.y >= cy && coords.y <= cy + r.cardHeight) {
        this.clickedTimelineCard = card;
        break;
      }
    }

    // 5. Iniciar Pan Horizontal da Linha do Tempo
    this.interactionType = 'PAN_TIMELINE';
    r.isDraggingTimeline = true;
    r.panMomentum = 0;
    r.panStartX = coords.x;
    r.panStartOffsetX = r.targetTimelineOffsetX;
  }

  onPointerMove(e) {
    const coords = this.getCanvasCoords(e);
    const r = this.renderer;
    const isTouch = (this.pointerType === 'touch');

    // Calcular velocidade e timestamp para inércia
    const now = Date.now();
    const deltaX = coords.x - this.lastPointerX;
    this.pointerVelocityX = deltaX;
    this.lastPointerX = coords.x;
    this.lastMoveTime = now;

    r.rawPointerX = coords.x;
    r.rawPointerY = coords.y;

    if (this.isPointerDown) {
      const dist = Math.hypot(coords.x - this.startCoords.x, coords.y - this.startCoords.y);
      const threshold = isTouch ? 12 : 6;

      if (dist > threshold) {
        this.hasMovedSignificantly = true;
      }

      // Transição de toque no deck para arraste contínuo
      if (this.interactionType === 'DECK_CARD' && this.hasMovedSignificantly) {
        this.interactionType = 'DRAG_CARD';
        r.isDraggingCard = true;
        r.isCardSelected = false; // Arraste sobrepõe seleção
        r.dragVelocityX = 0;
        r.hoverDropZoneIndex = -1;
        triggerHaptic(15);
        if (this.options.onPickSound) this.options.onPickSound();
      }

      if (this.interactionType === 'DRAG_CARD') {
        r.dragX = coords.x;
        // Lift Offset no Touch: eleva o card em 70px para que o dedo não tape a foto nem o alvo
        r.dragY = isTouch ? coords.y - r.touchLiftOffset : coords.y;
        r.dragVelocityX = deltaX;
        r.updateHoverDropZoneOnDrag();
        return;
      }

      if (this.interactionType === 'PAN_TIMELINE') {
        const panDelta = coords.x - r.panStartX;
        r.targetTimelineOffsetX = r.panStartOffsetX + panDelta;
        r.clampTimelineOffset();
        return;
      }
    } else {
      // Estado de repouso / Hover sobre cards da timeline
      let foundCard = null;
      for (let i = 0; i < r.timelineCards.length; i++) {
        const card = r.timelineCards[i];
        const cx = r.getTimelineCardX(i);
        const cy = r.timelineCenterY - r.cardHeight / 2;
        if (coords.x >= cx - r.cardWidth / 2 && coords.x <= cx + r.cardWidth / 2 &&
            coords.y >= cy && coords.y <= cy + r.cardHeight) {
          foundCard = card;
          break;
        }
      }
      r.hoveredTimelineCard = foundCard;
      this.canvas.style.cursor = foundCard ? 'pointer' : 'default';
    }
  }

  onPointerUp(e) {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}

    const r = this.renderer;
    const coords = this.getCanvasCoords(e);
    const isTouch = (this.pointerType === 'touch');

    // 1. Toque rápido no card do Deck sem arrastar (Ativar/Desativar Tap-to-Place)
    if (this.interactionType === 'DECK_CARD') {
      if (!this.hasMovedSignificantly && r.activeCard) {
        r.isCardSelected = !r.isCardSelected;
        triggerHaptic(r.isCardSelected ? 20 : 10);
        if (this.options.onPickSound) this.options.onPickSound();
      }
    }

    // 2. Conclusão de Arraste do Card
    if (this.interactionType === 'DRAG_CARD') {
      r.isDraggingCard = false;
      const targetZone = r.hoverDropZoneIndex;
      r.hoverDropZoneIndex = -1;

      if (targetZone >= 0 && r.activeCard) {
        // Soltou em uma Drop Zone válida!
        triggerHaptic(25);
        if (this.options.onDropCard) {
          this.options.onDropCard(targetZone, r.activeCard, { x: r.dragX, y: r.dragY });
        }
      } else if (r.activeCard) {
        // Soltou fora: retornar suavemente ao deck com efeito elástico
        const deckX = r.width / 2;
        const deckY = r.deckCenterY;
        r.animateCardDrop(r.activeCard, r.dragX, r.dragY, deckX, deckY, null);
      }
    }

    // 3. Conclusão de Pan da Régua e Inércia (Swipe Momentum)
    if (this.interactionType === 'PAN_TIMELINE') {
      r.isDraggingTimeline = false;
      r.clampTimelineOffset();

      // Aplicar inércia de swipe se soltou em movimento rápido
      const timeSinceMove = Date.now() - this.lastMoveTime;
      if (timeSinceMove < 90 && Math.abs(this.pointerVelocityX) > 2) {
        r.panMomentum = this.pointerVelocityX * (isTouch ? 1.6 : 1.3);
      }

      // Se não houve arraste significativo e tocou em um card fixado, abrir detalhes
      const clickTolerance = isTouch ? 14 : 6;
      const totalMoved = Math.hypot(coords.x - this.startCoords.x, coords.y - this.startCoords.y);

      if (totalMoved <= clickTolerance && this.clickedTimelineCard) {
        triggerHaptic(15);
        if (this.options.onCardClick) {
          this.options.onCardClick(this.clickedTimelineCard);
        }
      }
    }

    this.interactionType = null;
    this.clickedTimelineCard = null;
  }
}
