/**
 * js/input-handler.js
 * Captura unificada de interações (Mouse, Touch e Pen) via Pointer Events
 * Suporta mecânica híbrida:
 *   1. Pan/Swipe fluido na Linha do Tempo:
 *      - Rastreamento 1:1 de latência zero com o dedo.
 *      - Resistência elástica nas bordas (rubber-band) com snap-back suave.
 *      - Cálculo de velocidade real de arremesso (flick) nos últimos 100ms.
 *      - Desaceleração física exponencial com atrito natural a 60/120 FPS.
 *      - Parada tátil imediata ao encostar o dedo durante o deslizamento.
 *   2. Arraste com o dedo com elevação (Lift Offset) para não cobrir o card nem a Drop Zone.
 *   3. Modo Toque Direto (Tap-to-Place): Toque no card do deck + Toque na Drop Zone [+].
 *   4. Detecção ergonômica de toque para abrir detalhes históricos sem falso disparo durante swipes.
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
    this.hasMovedSignificantly = false;
    this.clickedTimelineCard = null;
    this.pointerType = 'mouse';

    // Histórico circular para cálculo preciso de velocidade de arremesso (flick)
    this.moveHistory = [];

    // Conectar callback de vibração ao alinhar magneticamente com uma Drop Zone
    this.renderer.onDropZoneHoverChange = (zoneIndex) => {
      if (zoneIndex >= 0) {
        triggerHaptic(30);
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

    // Roda do mouse para rolagem lateral suave da linha do tempo
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY)) ? e.deltaX : e.deltaY;
      this.renderer.shiftTimeline(-delta * 0.85);
    }, { passive: false });
  }

  onPointerDown(e) {
    this.isPointerDown = true;
    this.hasMovedSignificantly = false;
    this.pointerType = e.pointerType || 'mouse';

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

    // Se a timeline estava deslizando com inércia, parar imediatamente ao toque (tactile catch)
    if (r.panMomentum !== 0) {
      r.panMomentum = 0;
      r.targetTimelineOffsetX = r.timelineOffsetX;
    }

    // 1. Verificar clique nos botões de navegação lateral (◀ ▶) com área de toque ampliada
    const centerY = r.timelineCenterY;
    const btnSize = r.isMobile ? 32 : 36;
    const hitAreaH = 48;
    const hitAreaW = r.isMobile ? 48 : 42;
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

    // 3. Verificar se tocou no Card Misterioso Ativo no Deck Inferior (Pegar a carta!)
    if (r.activeCard && !r.animatingCard) {
      const deckX = r.width / 2 - r.activeCardWidth / 2;
      const deckY = r.deckCenterY - r.activeCardHeight / 2;
      const hitMargin = r.isMobile ? 12 : 8;

      if (coords.x >= deckX - hitMargin && coords.x <= deckX + r.activeCardWidth + hitMargin &&
          coords.y >= deckY - hitMargin && coords.y <= deckY + r.activeCardHeight + hitMargin) {
        this.interactionType = 'DECK_CARD';
        triggerHaptic(40); // Feedback tátil imediato no milissegundo em que o dedo encosta na carta
        if (this.options.onPickSound) this.options.onPickSound();
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

    // 5. Iniciar Pan Horizontal da Linha do Tempo com ancoragem visual precisa
    this.interactionType = 'PAN_TIMELINE';
    r.isDraggingTimeline = true;
    r.panMomentum = 0;
    r.panStartX = coords.x;
    r.panStartOffsetX = r.timelineOffsetX; // Usa o offset visual atual para evitar qualquer salto
    this.moveHistory = [{ x: coords.x, time: Date.now() }];

    this.canvas.style.cursor = 'grabbing';
  }

  onPointerMove(e) {
    const coords = this.getCanvasCoords(e);
    const r = this.renderer;
    const isTouch = (this.pointerType === 'touch');
    const now = Date.now();

    r.rawPointerX = coords.x;
    r.rawPointerY = coords.y;

    if (this.isPointerDown) {
      const dist = Math.hypot(coords.x - this.startCoords.x, coords.y - this.startCoords.y);
      const threshold = isTouch ? 8 : 4;

      if (dist > threshold) {
        this.hasMovedSignificantly = true;
      }

      // Transição de toque no deck para arraste contínuo
      if (this.interactionType === 'DECK_CARD' && this.hasMovedSignificantly) {
        this.interactionType = 'DRAG_CARD';
        r.isDraggingCard = true;
        r.isCardSelected = false; // Arraste sobrepõe seleção
        r.hoverDropZoneIndex = -1;
        triggerHaptic(30);
        if (this.options.onPickSound) this.options.onPickSound();
      }

      // Arraste do card ativo
      if (this.interactionType === 'DRAG_CARD') {
        r.dragX = coords.x;
        // Lift Offset no Touch: eleva o card em 70px para que o dedo não tape a foto nem o alvo
        r.dragY = isTouch ? coords.y - r.touchLiftOffset : coords.y;
        r.dragVelocityX = coords.x - this.lastPointerX;
        r.updateHoverDropZoneOnDrag();
        this.lastPointerX = coords.x;
        return;
      }

      // Pan interativo da linha do tempo com resposta direta 1:1
      if (this.interactionType === 'PAN_TIMELINE') {
        // Registrar pontos para cálculo preciso de arremesso (flick)
        this.moveHistory.push({ x: coords.x, time: now });
        while (this.moveHistory.length > 2 && now - this.moveHistory[0].time > 100) {
          this.moveHistory.shift();
        }

        const panDelta = coords.x - r.panStartX;
        let newOffset = r.panStartOffsetX + panDelta;

        // Efeito elástico sutil (rubber-band) nas extremidades para sensação física agradável
        const bounds = r.getTimelineBounds();
        if (newOffset > bounds.max) {
          const over = newOffset - bounds.max;
          newOffset = bounds.max + over * 0.35;
        } else if (newOffset < bounds.min) {
          const under = bounds.min - newOffset;
          newOffset = bounds.min - under * 0.35;
        }

        r.targetTimelineOffsetX = newOffset;
        r.timelineOffsetX = newOffset; // Atualização síncrona 1:1 em tempo real com o dedo!
        this.lastPointerX = coords.x;
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
    const now = Date.now();

    this.canvas.style.cursor = 'default';

    // 1. Toque rápido no card do Deck sem arrastar (Ativar/Desativar Tap-to-Place)
    if (this.interactionType === 'DECK_CARD') {
      if (!this.hasMovedSignificantly && r.activeCard) {
        r.isCardSelected = !r.isCardSelected;
        triggerHaptic(r.isCardSelected ? 40 : 25);
        if (this.options.onPickSound) this.options.onPickSound();
      }
    }

    // 2. Conclusão de Arraste do Card (Soltou a carta!)
    if (this.interactionType === 'DRAG_CARD') {
      r.isDraggingCard = false;
      const targetZone = r.hoverDropZoneIndex;
      r.hoverDropZoneIndex = -1;

      if (targetZone >= 0 && r.activeCard) {
        // Soltou em uma Drop Zone válida!
        triggerHaptic(50); // Feedback tátil marcante ao soltar na linha do tempo
        if (this.options.onDropCard) {
          this.options.onDropCard(targetZone, r.activeCard, { x: r.dragX, y: r.dragY });
        }
      } else if (r.activeCard) {
        // Soltou fora: retornar suavemente ao deck com efeito elástico
        triggerHaptic(35); // Feedback tátil ao soltar a carta fora e retorná-la
        const deckX = r.width / 2;
        const deckY = r.deckCenterY;
        r.animateCardDrop(r.activeCard, r.dragX, r.dragY, deckX, deckY, null);
      }
    }

    // 3. Conclusão de Pan da Régua e Disparo de Inércia Física (Flick)
    if (this.interactionType === 'PAN_TIMELINE') {
      r.isDraggingTimeline = false;

      const bounds = r.getTimelineBounds();
      let flickVelocity = 0;

      // Calcular velocidade vetorial usando a janela temporal dos últimos 100ms
      if (this.moveHistory && this.moveHistory.length >= 2) {
        const oldest = this.moveHistory[0];
        const newest = this.moveHistory[this.moveHistory.length - 1];
        const dt = newest.time - oldest.time;
        const dx = newest.x - oldest.x;

        if (dt > 10 && (now - newest.time) < 80) {
          flickVelocity = (dx / dt) * 16.67; // Converte px/ms para px por quadro (60fps)
        }
      }

      // Se soltou fora dos limites (overscroll com rubber-band), o snap-back suave recupera os limites
      if (r.timelineOffsetX > bounds.max) {
        r.targetTimelineOffsetX = bounds.max;
        r.panMomentum = 0;
      } else if (r.timelineOffsetX < bounds.min) {
        r.targetTimelineOffsetX = bounds.min;
        r.panMomentum = 0;
      } else if (Math.abs(flickVelocity) > 1.5) {
        // Aplicar inércia de arremesso suave e natural
        const maxVelocity = isTouch ? 42 : 32;
        r.panMomentum = Math.max(-maxVelocity, Math.min(maxVelocity, flickVelocity * (isTouch ? 1.25 : 1.1)));
        triggerHaptic(10);
      } else {
        r.panMomentum = 0;
      }

      // Se foi um toque pontual (sem movimento significativo) em um card da timeline, abrir detalhes
      const totalMoved = Math.hypot(coords.x - this.startCoords.x, coords.y - this.startCoords.y);
      const clickTolerance = isTouch ? 10 : 5;

      if (totalMoved <= clickTolerance && this.clickedTimelineCard && !this.hasMovedSignificantly) {
        triggerHaptic(15);
        if (this.options.onCardClick) {
          this.options.onCardClick(this.clickedTimelineCard);
        }
      }
    }

    this.interactionType = null;
    this.clickedTimelineCard = null;
    this.moveHistory = [];
  }
}
