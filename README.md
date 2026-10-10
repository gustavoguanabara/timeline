# Pipeline de Imagens Históricas - História da Tecnologia

Este módulo automatiza a busca, download e processamento de imagens históricas para cada um dos 174 marcos tecnológicos presentes no arquivo [`data/historia.json`](file:///Users/gustavoguanabara/Documents/Projetos-Antigravity/historia-tecnologia/data/historia.json).

---

## 📁 Estrutura de Pastas e Arquivos

```text
historia-tecnologia/
├── data/
│   ├── historia.json              # Base com os 174 fatos históricos
│   └── images/
│       ├── temp/                  # Arquivos originais baixados da web ({ref}.{ext})
│       │   └── download_metadata.json # Log e metadados das fontes consultadas
│       └── *.jpg                  # Imagens finais quadradas 500x500 JPEG ({ref}.jpg)
├── scripts/                       # Módulos Python e scripts operacionais
│   ├── __init__.py                # Pacote Python de scripts
│   ├── run_pipeline.py            # Script orquestrador de ponta a ponta
│   ├── download_images.py         # Script de busca e download inteligente
│   └── crop_images.py             # Script de Smart Cropping e redimensionamento 500x500
├── docs/                          # Documentação técnica e governança viva (SPEC, ARCHITECTURE, DECISIONS, CONTEXT)
├── .agents/                       # Regras e skills para agentes autônomos
├── requirements.txt               # Dependências Python
└── README.md                      # Este arquivo
```

---

## ⚙️ Instalação das Dependências

Instale os pacotes necessários via `pip`:

```bash
pip install -r requirements.txt
```

As principais bibliotecas utilizadas são:
- **`requests`**: requisições HTTP para as APIs públicas da Wikipedia e Wikimedia Commons.
- **`Pillow`**: leitura, decodificação, conversão de formatos e redimensionamento de alta qualidade (`LANCZOS`).
- **`opencv-python-headless`**: visão computacional para detecção de faces e cálculo de saliência visual / gradientes.
- **`numpy`**: operações matriciais e cálculo do mapa de atenção visual.

---

## 🚀 Como Executar

### 1. Execução Completa (Pipeline de Ponta a Ponta)
Para buscar, baixar todos os originais que faltarem e gerar os recortes 500x500 JPEG:

```bash
python3 scripts/run_pipeline.py
```

### 2. Executar Apenas o Download
Para baixar apenas os arquivos originais para `data/images/temp`:

```bash
python3 scripts/run_pipeline.py --download-only
# ou: python3 scripts/download_images.py
```

### 3. Executar Apenas o Crop Inteligente
Para reprocessar os recortes de 500x500 a partir dos arquivos já existentes em `data/images/temp`:

```bash
python3 scripts/run_pipeline.py --crop-only
# ou: python3 scripts/crop_images.py
```

---

## 🛠️ Opções e Argumentos Avançados

Todos os scripts aceitam argumentos de linha de comando para controle granular:

| Parâmetro | Descrição | Exemplo |
| :--- | :--- | :--- |
| `--limit N` | Processa apenas os primeiros $N$ registros | `python3 scripts/run_pipeline.py --limit 5` |
| `--ref REF` | Processa exclusivamente um registro específico | `python3 scripts/run_pipeline.py --ref abaco-2400` |
| `--force` | Força novo download/crop sobrescrevendo arquivos existentes | `python3 scripts/run_pipeline.py --force` |
| `--delay S` | Intervalo em segundos entre requisições de download (padrão: 0.25s) | `python3 scripts/run_pipeline.py --delay 0.5` |

---

## 🧠 Como Funciona a Busca Inteligente (`download_images.py`)

1. **Extração Contextual de Termos**: O script analisa tanto o campo `resumo` quanto o campo `texto`, gerando queries candidatas com termos destacados entre aspas, inventores/figuras históricas e nomes limpos.
2. **Consultas em Camadas**:
   - Wikipedia em Português (`pt.wikipedia.org`)
   - Wikipedia em Inglês (`en.wikipedia.org`)
   - Wikimedia Commons (`commons.wikimedia.org`)
3. **Imagens Otimizadas**: Solicita miniaturas na faixa de 800px no próprio servidor da Wikimedia (`pithumbsize`/`iiurlwidth`), evitando o tráfego de arquivos desnecessariamente pesados.
4. **Armazenamento Seguro**: As imagens originais são validadas e salvas em `data/images/temp/{ref}.{ext}` preservando o formato original (`.jpg`, `.png`, `.webp`, `.gif`), com registro detalhado em `download_metadata.json`.

---

## ✂️ Como Funciona o Smart Crop 500x500 (`crop_images.py`)

O script encontra o ponto visual mais importante da imagem através de visão computacional em dois níveis:

1. **Detecção Facial (Haar Cascades)**:
   - Para inventores e personalidades históricas (ex: Ada Lovelace, Alan Turing, Charles Babbage, Guido van Rossum), os rostos são detectados e posicionados de forma harmônica na composição (entre o terço superior e o centro), evitando cortes de cabeça.
2. **Saliência Visual por Gradiente e Contraste**:
   - Para equipamentos, máquinas e ilustrações (ex: Ábaco, Pascalina, ENIAC, circuitos, logotipos), calcula o mapa de gradientes espaciais com filtros de Sobel e variação de textura local (Laplaciano).
   - Aplica uma atenuação suave em direção ao centro (*Gaussian Center Bias*), priorizando a área focal de maior densidade de informação.
3. **Tratamento de Transparência**:
   - Converte imagens com transparência (RGBA/PNG) sobre fundo branco puro antes da conversão para JPEG.
4. **Formato e Resolução Finais**:
   - Realiza o recorte quadrado centralizado no ponto focal e faz o resampling com `LANCZOS` para exatamente **500x500 pixels**, salvando em `data/images/{ref}.jpg` no formato **JPEG**.
