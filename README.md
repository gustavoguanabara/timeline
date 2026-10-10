# História da Tecnologia — Game Educacional da Linha do Tempo

Jogo educativo arcade retrô de dedução cronológica dos grandes marcos da história da computação e tecnologia.
Construído com arquitetura **Vanilla Web pura** (HTML5 Canvas 2D, CSS3 modular e JavaScript moderno via ES Modules).

---

## 🕹️ Como Jogar

1. Um **card misterioso** é sorteado com foto histórica, título e resumo, mas com o ano oculto (`????`).
2. Sua missão é **deduzir a ordem temporal** e posicionar o card na régua cronológica entre os acontecimentos já revelados.
3. Arraste até uma das **Drop Zones** marcadas com o glifo `+` e solte para confirmar o palpite (ou clique na zona correspondente no celular).
4. **Acertou**: O ano acende em verde, você ganha 100 pontos, ouve sons retrô e avança na linha do tempo.
5. **Errou**: O card se encaixa na posição cronológica real com o ano em vermelho e você recebe feedback pedagógico do erro.
6. Ao final da rodada de 10 fatos históricos, cadastre suas 3 iniciais no **Hall da Fama (TOP 10)** e compartilhe seu desempenho no estilo Wordle!

---

## 🚀 Como Executar Localmente

Como a aplicação faz uso de **ES Modules nativos** (`import`/`export`) e carregamento de dados JSON via `fetch()`, execute através de um servidor HTTP local:

### Opção 1: Python 3 (Nativo)
```bash
python3 -m http.server 8080
```
Em seguida, acesse no navegador: [http://localhost:8080](http://localhost:8080)

### Opção 2: Node.js (npx serve / http-server)
```bash
npx serve .
# ou: npx http-server -p 8080
```

### Opção 3: PHP (Nativo)
```bash
php -S localhost:8080
```

---

## 📁 Estrutura de Arquivos da Distribuição (`dist/`)

```text
dist/
├── index.html                   # Ponto de entrada e casca da SPA
├── README.md                    # Manual de execução e informações da distribuição
├── css/                         # Folhas de estilo modulares
│   ├── style.css                # Variáveis globais, reset e layout base
│   └── components/
│       ├── hud.css              # Barra superior slim e placar
│       ├── modal.css            # Modais (Lobby, Game Over, Top 10, Detalhes, Ajuda)
│       └── responsive.css       # Regras responsivas e suporte a toque móvel
├── js/                          # 8 módulos JavaScript ES Modules
│   ├── main.js                  # Ponto de entrada da aplicação e binding de UI
│   ├── game.js                  # Máquina de estados e loop da partida
│   ├── timeline.js              # Cálculo de slots, posições e validação cronológica
│   ├── canvas-renderer.js       # Renderização 60 FPS no Canvas 2D
│   ├── input-handler.js         # Arraste do mouse, toque móvel e inércia física
│   ├── audio.js                 # Síntese sonora retrô via Web Audio API e háptico
│   ├── leaderboard.js           # Hall da Fama Arcade Top 10 com LocalStorage
│   └── data-loader.js           # Carregamento e pré-aquecimento de dados e imagens
└── data/
    ├── historia.json            # Catálogo dos 174 marcos históricos da computação
    ├── top10.json               # Semente estática dos recordes do Hall da Fama
    └── images/                  # 174 imagens processadas em 500x500 JPEG
```

---

## 🌐 Publicação em Servidores Estáticos

Este diretório `dist/` está 100% pronto para publicação estática:

- **GitHub Pages**: Configure o diretório de publicação para `dist` ou envie seu conteúdo para o branch `gh-pages`.
- **Vercel / Netlify / Cloudflare Pages**: Aponte a pasta de deploy (Publish Directory) para `dist/`.
- **Apache / Nginx / S3**: Copie todos os arquivos desta pasta diretamente para a raiz do servidor web.

---

## 📜 Licença e Créditos

- Dados históricos e curadoria baseados em fontes públicas da Wikipedia e Wikimedia Commons.
- Todas as ilustrações e fotos históricas seguem licenças livres ou estão em domínio público.
